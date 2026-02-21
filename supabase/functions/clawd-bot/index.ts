import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret',
}

const API_VERSION = 'v1'

// ─── Rate Limiter (in-memory, per-IP, 5 req/s) ──────────────
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(ip)
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 1000 })
    return true
  }
  bucket.count++
  return bucket.count <= 5
}

// ─── Unified response helpers ────────────────────────────────
function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data, api_version: API_VERSION }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fail(error: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error, api_version: API_VERSION }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ─── Audit logger ────────────────────────────────────────────
async function auditLog(supabase: any, endpoint: string, payload: unknown) {
  try {
    await supabase.from('webhook_events').insert({
      source: 'spacebot',
      event_type: endpoint,
      payload: payload || {},
      processed: true,
    })
  } catch (_) { /* non-blocking */ }
}

// ─── Activity logger (feeds real-time notifications) ─────────
async function logActivity(supabase: any, entityType: string, entityId: string | null, action: string, name?: string) {
  try {
    await supabase.from('activity_log').insert({
      entity_type: entityType,
      entity_id: entityId,
      action,
      meta: { name: name || '' },
    })
  } catch (_) { /* non-blocking */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Rate limit check
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || 'unknown'
  if (!checkRateLimit(clientIp)) {
    return fail('Rate limit exceeded. Max 5 requests per second.', 429)
  }

  const url = new URL(req.url)
  const path = url.pathname.split('/').pop()

  const botSecret = req.headers.get('x-bot-secret')
  const authHeader = req.headers.get('Authorization')
  const expectedSecret = Deno.env.get('BOT_SECRET')

  // Debug: log auth attempt (no secret values, just presence)
  console.log(`[auth] path=${path} bot-secret-present=${!!botSecret} expected-present=${!!expectedSecret} match=${botSecret === expectedSecret} auth-header-present=${!!authHeader}`)

  const isBot = !!(botSecret && expectedSecret && botSecret === expectedSecret)
  const isStaff = !!authHeader?.startsWith('Bearer ')

  if (!isBot && !isStaff) {
    console.log(`[auth] REJECTED - isBot=${isBot} isStaff=${isStaff} bot-secret-length=${botSecret?.length} expected-length=${expectedSecret?.length}`)
    return fail('Unauthorized', 401)
  }

  const supabase = isBot
    ? createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    : createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader! } }
      })

  if (isStaff) {
    const token = authHeader!.replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return fail('Unauthorized', 401)
  }

  // Valid category IDs matching the UI
  const VALID_CATEGORIES = ['digital-services', 'brick-and-mortar', 'digital-ecommerce', 'food-and-beverage', 'mobile-services', 'other']
  const normalizeCategory = (cat: string | null | undefined): string => {
    if (!cat) return 'other'
    return VALID_CATEGORIES.includes(cat) ? cat : 'other'
  }

  try {
    let body: Record<string, unknown> = {}
    if (req.method !== 'GET') {
      try {
        const text = await req.text()
        if (text && text.trim().length > 0) {
          body = JSON.parse(text)
        }
      } catch (_) {
        // Body may be empty for DELETE requests — fall through to query params
      }
    }
    const params = url.searchParams
    // For DELETE requests, also check query param ?id=
    if (req.method === 'DELETE' && !body.id) {
      const qId = params.get('id')
      if (qId) body.id = qId
    }

    // Audit log for bot calls
    if (isBot && path) {
      await auditLog(supabase, path, body)
    }

    // ─── CUSTOMERS ───────────────────────────────────────────
    if (path === 'customers' && req.method === 'GET') {
      const status = params.get('status')
      const category = params.get('category')
      let q = supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(100)
      if (status) q = q.eq('status', status)
      if (category) q = q.eq('category', category)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ customers: data })
    }

    if (path === 'customer' && req.method === 'POST') {
      const { id, full_name, email, phone, address, company, source, status, notes, tags, category, meta } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (full_name) updates.full_name = full_name
        if (email !== undefined) updates.email = email
        if (phone !== undefined) updates.phone = phone
        if (address !== undefined) updates.address = address
        if (company !== undefined) updates.company = company
        if (source !== undefined) updates.source = source
        if (status) updates.status = status
        if (notes !== undefined) updates.notes = notes
        if (tags) updates.tags = tags
        if (category) updates.category = normalizeCategory(category)
        if (meta) updates.meta = meta
        const { error } = await supabase.from('customers').update(updates).eq('id', id)
        if (error) return fail(error.message)
        await logActivity(supabase, 'customer', id, 'updated', full_name || updates.full_name as string)
        return ok({ action: 'updated', customer_id: id })
      }
      if (!full_name) return fail('full_name is required')
      const { data, error } = await supabase.from('customers').insert({
        full_name, email: email || null, phone: phone || null, address: address || null,
        company: company || null, source: source || 'bot', status: status || 'lead',
        notes: notes || null, tags: tags || [], category: normalizeCategory(category), meta: meta || {},
      }).select('id').single()
      if (error) return fail(error.message)
      await logActivity(supabase, 'customer', data?.id, 'created', full_name)
      return ok({ action: 'created', customer_id: data?.id })
    }

    if (path === 'customer' && req.method === 'DELETE') {
      const id = body.id || params.get('id')
      if (!id) return fail('id is required. Pass as JSON body {"id":"uuid"} or query param ?id=uuid')
      // Unlink/delete ALL related records to avoid FK constraint errors
      await supabase.from('cards').update({ customer_id: null }).eq('customer_id', id)
      await supabase.from('deals').update({ customer_id: null as any }).eq('customer_id', id)
      await supabase.from('signatures').delete().eq('customer_id', id)
      await supabase.from('documents').delete().eq('customer_id', id)
      await supabase.from('invoices').delete().eq('customer_id', id)
      await supabase.from('interactions').delete().eq('customer_id', id)
      await supabase.from('conversation_threads').delete().eq('customer_id', id)
      await supabase.from('bot_tasks').delete().eq('customer_id', id)
      await supabase.from('communications').delete().eq('customer_id', id)
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) return fail(error.message)
      await logActivity(supabase, 'customer', id as string, 'deleted')
      return ok({ action: 'deleted', customer_id: id })
    }

    // ─── BULK DELETE CUSTOMERS ───────────────────────────────
    if (path === 'bulk-delete' && req.method === 'POST') {
      const ids = body.ids as string[] | undefined
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return fail('ids is required. Pass as JSON body {"ids":["uuid1","uuid2",...]}')
      }
      if (ids.length > 100) return fail('Maximum 100 IDs per bulk-delete call')

      const deleted: string[] = []
      const errors: { id: string; error: string }[] = []

      for (const id of ids) {
        try {
          await supabase.from('cards').update({ customer_id: null }).eq('customer_id', id)
          await supabase.from('deals').update({ customer_id: null as any }).eq('customer_id', id)
          await supabase.from('signatures').delete().eq('customer_id', id)
          await supabase.from('documents').delete().eq('customer_id', id)
          await supabase.from('invoices').delete().eq('customer_id', id)
          await supabase.from('interactions').delete().eq('customer_id', id)
          await supabase.from('conversation_threads').delete().eq('customer_id', id)
          await supabase.from('bot_tasks').delete().eq('customer_id', id)
          await supabase.from('communications').delete().eq('customer_id', id)
          const { error } = await supabase.from('customers').delete().eq('id', id)
          if (error) {
            errors.push({ id, error: error.message })
          } else {
            deleted.push(id)
            await logActivity(supabase, 'customer', id, 'deleted')
          }
        } catch (e) {
          errors.push({ id, error: String(e) })
        }
      }

      return ok({ action: 'bulk-deleted', deleted_count: deleted.length, deleted, errors })
    }

    // ─── LEADS (shortcut) ────────────────────────────────────
    if (path === 'lead' && req.method === 'POST') {
      const { full_name, email, phone, address, company, source, source_url, notes, tags, category } = body
      if (!full_name) return fail('full_name is required')
      let existingId: string | null = null
      if (email) {
        const { data: existing } = await supabase.from('customers').select('id').eq('email', email).eq('status', 'lead').maybeSingle()
        existingId = existing?.id || null
      }
      if (existingId) {
        const updates: Record<string, unknown> = {}
        if (phone) updates.phone = phone
        if (address) updates.address = address
        if (company) updates.company = company
        if (notes) updates.notes = notes
        if (Object.keys(updates).length > 0) await supabase.from('customers').update(updates).eq('id', existingId)
        await logActivity(supabase, 'lead', existingId, 'updated', full_name)
        return ok({ action: 'updated', customer_id: existingId })
      }
      const { data, error } = await supabase.from('customers').insert({
        full_name, email: email || null, phone: phone || null, address: address || null,
        company: company || null, source: source || 'bot', status: 'lead',
        notes: notes || (source_url ? `Source: ${source_url}` : null), tags: tags || [], category: normalizeCategory(category),
      }).select('id').single()
      if (error) return fail(error.message)
      await logActivity(supabase, 'lead', data?.id, 'created', full_name)
      return ok({ action: 'created', customer_id: data?.id })
    }

    // ─── DEALS ───────────────────────────────────────────────
    if (path === 'deals' && req.method === 'GET') {
      const category = params.get('category')
      const status = params.get('status')
      let q = supabase.from('deals').select('*, customers(full_name)').order('created_at', { ascending: false }).limit(100)
      if (category) q = q.eq('category', category)
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ deals: data })
    }

    if (path === 'deal' && req.method === 'POST') {
      const { id, title, customer_id, deal_value, stage, pipeline, probability, expected_close_date, status, tags, category } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (title) updates.title = title
        if (deal_value !== undefined) updates.deal_value = deal_value
        if (stage) updates.stage = stage
        if (pipeline) updates.pipeline = pipeline
        if (probability !== undefined) updates.probability = probability
        if (expected_close_date !== undefined) updates.expected_close_date = expected_close_date
        if (status) updates.status = status
        if (tags) updates.tags = tags
        if (category) updates.category = category
        const { error } = await supabase.from('deals').update(updates).eq('id', id)
        if (error) return fail(error.message)
        await logActivity(supabase, 'deal', id, 'updated', title)
        return ok({ action: 'updated', deal_id: id })
      }
      if (!title || !customer_id) return fail('title and customer_id are required')
      const { data, error } = await supabase.from('deals').insert({
        title, customer_id, deal_value: deal_value || 0, stage: stage || 'new',
        pipeline: pipeline || 'default', probability: probability || 10,
        expected_close_date: expected_close_date || null, status: status || 'open',
        tags: tags || [], category: category || null,
      }).select('id').single()
      if (error) return fail(error.message)
      await logActivity(supabase, 'deal', data?.id, 'created', title)
      return ok({ action: 'created', deal_id: data?.id })
    }

    if (path === 'deal' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('deals').delete().eq('id', id)
      if (error) return fail(error.message)
      await logActivity(supabase, 'deal', id, 'deleted')
      return ok({ action: 'deleted', deal_id: id })
    }

    // ─── PROJECTS ────────────────────────────────────────────
    if (path === 'projects' && req.method === 'GET') {
      const category = params.get('category')
      const status = params.get('status')
      let q = supabase.from('projects').select('*, customers(full_name)').order('created_at', { ascending: false }).limit(100)
      if (category) q = q.eq('category', category)
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ projects: data })
    }

    if (path === 'project' && req.method === 'POST') {
      const { id, title, description, customer_id, status, priority, start_date, due_date, tags, category } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (title) updates.title = title
        if (description !== undefined) updates.description = description
        if (customer_id) updates.customer_id = customer_id
        if (status) updates.status = status
        if (priority) updates.priority = priority
        if (start_date !== undefined) updates.start_date = start_date
        if (due_date !== undefined) updates.due_date = due_date
        if (tags) updates.tags = tags
        if (category) updates.category = category
        const { error } = await supabase.from('projects').update(updates).eq('id', id)
        if (error) return fail(error.message)
        await logActivity(supabase, 'project', id, 'updated', title)
        return ok({ action: 'updated', project_id: id })
      }
      if (!title) return fail('title is required')
      const { data, error } = await supabase.from('projects').insert({
        title, description: description || null, customer_id: customer_id || null,
        status: status || 'planned', priority: priority || 'medium',
        start_date: start_date || null, due_date: due_date || null,
        tags: tags || [], category: category || null,
      }).select('id').single()
      if (error) return fail(error.message)
      await logActivity(supabase, 'project', data?.id, 'created', title)
      return ok({ action: 'created', project_id: data?.id })
    }

    if (path === 'project' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) return fail(error.message)
      await logActivity(supabase, 'project', id, 'deleted')
      return ok({ action: 'deleted', project_id: id })
    }

    // ─── TASKS (project tasks) ───────────────────────────────
    if (path === 'project-tasks' && req.method === 'GET') {
      const project_id = params.get('project_id')
      const category = params.get('category')
      let q = supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(100)
      if (project_id) q = q.eq('project_id', project_id)
      if (category) q = q.eq('category', category)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ tasks: data })
    }

    if (path === 'project-task' && req.method === 'POST') {
      const { id, title, description, project_id, status, priority, due_date, tags, category, checklist } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (title) updates.title = title
        if (description !== undefined) updates.description = description
        if (status) updates.status = status
        if (priority) updates.priority = priority
        if (due_date !== undefined) updates.due_date = due_date
        if (tags) updates.tags = tags
        if (category) updates.category = category
        if (checklist) updates.checklist = checklist
        const { error } = await supabase.from('tasks').update(updates).eq('id', id)
        if (error) return fail(error.message)
        await logActivity(supabase, 'task', id, 'updated', title)
        return ok({ action: 'updated', task_id: id })
      }
      if (!title || !project_id) return fail('title and project_id are required')
      const { data, error } = await supabase.from('tasks').insert({
        title, description: description || null, project_id,
        status: status || 'todo', priority: priority || 'medium',
        due_date: due_date || null, tags: tags || [], category: category || null,
        checklist: checklist || [],
      }).select('id').single()
      if (error) return fail(error.message)
      await logActivity(supabase, 'task', data?.id, 'created', title)
      return ok({ action: 'created', task_id: data?.id })
    }

    if (path === 'project-task' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) return fail(error.message)
      await logActivity(supabase, 'task', id, 'deleted')
      return ok({ action: 'deleted', task_id: id })
    }

    // ─── CONTENT ASSETS ──────────────────────────────────────
    if (path === 'content' && req.method === 'GET') {
      const category = params.get('category')
      const type = params.get('type')
      const source = params.get('source')
      const customer_id = params.get('customer_id')
      let q = supabase.from('content_assets').select('*, customers(id, full_name, category)').order('created_at', { ascending: false }).limit(200)
      if (category) q = q.eq('category', category)
      if (type) q = q.eq('type', type)
      if (source) q = q.eq('source', source)
      if (customer_id) q = q.eq('customer_id', customer_id)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ content: data })
    }

    if (path === 'content' && req.method === 'POST') {
      const { id, title, type, body: assetBody, status, tags, category, url, folder, scheduled_for, source, customer_id } = body
      const VALID_SOURCES = ['dashboard', 'google-drive', 'instagram', 'sms', 'client-direct', 'other']
      if (id) {
        const updates: Record<string, unknown> = {}
        if (title) updates.title = title
        if (type) updates.type = type
        if (assetBody !== undefined) updates.body = assetBody
        if (status) updates.status = status
        if (tags) updates.tags = tags
        if (category) updates.category = normalizeCategory(category)
        if (url !== undefined) updates.url = url
        if (folder !== undefined) updates.folder = folder
        if (scheduled_for !== undefined) updates.scheduled_for = scheduled_for
        if (source) updates.source = VALID_SOURCES.includes(source as string) ? source : 'other'
        if (customer_id !== undefined) updates.customer_id = customer_id || null
        const { error } = await supabase.from('content_assets').update(updates).eq('id', id)
        if (error) return fail(error.message)
        await logActivity(supabase, 'content', id, 'updated', title)
        return ok({ action: 'updated', content_id: id })
      }
      if (!title || !type) return fail('title and type are required')
      const normalizedSource = source ? (VALID_SOURCES.includes(source as string) ? source : 'other') : 'dashboard'
      const { data, error } = await supabase.from('content_assets').insert({
        title, type, body: assetBody || null, status: status || 'draft',
        tags: tags || [], category: normalizeCategory(category), url: url || null,
        folder: folder || null, scheduled_for: scheduled_for || null,
        source: normalizedSource, customer_id: customer_id || null,
      }).select('id').single()
      if (error) return fail(error.message)
      await logActivity(supabase, 'content', data?.id, 'created', title)
      return ok({ action: 'created', content_id: data?.id })
    }

    if (path === 'content' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('content_assets').delete().eq('id', id)
      if (error) return fail(error.message)
      await logActivity(supabase, 'content', id, 'deleted')
      return ok({ action: 'deleted', content_id: id })
    }

    // ─── CONVERSATION THREADS ────────────────────────────────
    if (path === 'threads' && req.method === 'GET') {
      const customer_id = params.get('customer_id')
      const category = params.get('category')
      let q = supabase.from('conversation_threads').select('*, customers(full_name)').order('created_at', { ascending: false }).limit(100)
      if (customer_id) q = q.eq('customer_id', customer_id)
      if (category) q = q.eq('category', category)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ threads: data })
    }

    if (path === 'thread' && req.method === 'POST') {
      const { id, customer_id, channel, status, summary, raw_transcript, category } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (channel) updates.channel = channel
        if (status) updates.status = status
        if (summary !== undefined) updates.summary = summary
        if (raw_transcript !== undefined) updates.raw_transcript = raw_transcript
        if (category) updates.category = category
        const { error } = await supabase.from('conversation_threads').update(updates).eq('id', id)
        if (error) return fail(error.message)
        return ok({ action: 'updated', thread_id: id })
      }
      if (!customer_id) return fail('customer_id is required')
      const { data, error } = await supabase.from('conversation_threads').insert({
        customer_id, channel: channel || 'chat', status: status || 'open',
        summary: summary || null, raw_transcript: raw_transcript || null, category: category || null,
      }).select('id').single()
      if (error) return fail(error.message)
      return ok({ action: 'created', thread_id: data?.id })
    }

    if (path === 'thread' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('conversation_threads').delete().eq('id', id)
      if (error) return fail(error.message)
      return ok({ action: 'deleted', thread_id: id })
    }

    // ─── DOCUMENTS ───────────────────────────────────────────
    if (path === 'documents' && req.method === 'GET') {
      const customer_id = params.get('customer_id')
      const category = params.get('category')
      let q = supabase.from('documents').select('*, customers(full_name)').order('created_at', { ascending: false }).limit(100)
      if (customer_id) q = q.eq('customer_id', customer_id)
      if (category) q = q.eq('category', category)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ documents: data })
    }

    if (path === 'document' && req.method === 'POST') {
      const { id, title, type, customer_id, thread_id, status, file_url, storage_path, category } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (title) updates.title = title
        if (type) updates.type = type
        if (status) updates.status = status
        if (file_url !== undefined) updates.file_url = file_url
        if (storage_path !== undefined) updates.storage_path = storage_path
        if (category) updates.category = category
        const { error } = await supabase.from('documents').update(updates).eq('id', id)
        if (error) return fail(error.message)
        await logActivity(supabase, 'document', id, 'updated', title)
        return ok({ action: 'updated', document_id: id })
      }
      if (!title || !type || !customer_id) return fail('title, type, and customer_id are required')
      const { data, error } = await supabase.from('documents').insert({
        title, type, customer_id, thread_id: thread_id || null,
        status: status || 'draft', file_url: file_url || null,
        storage_path: storage_path || null, category: category || null,
      }).select('id').single()
      if (error) return fail(error.message)
      await logActivity(supabase, 'document', data?.id, 'created', title)
      return ok({ action: 'created', document_id: data?.id })
    }

    if (path === 'document' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('documents').delete().eq('id', id)
      if (error) return fail(error.message)
      await logActivity(supabase, 'document', id, 'deleted')
      return ok({ action: 'deleted', document_id: id })
    }

    // ─── INVOICES ────────────────────────────────────────────
    if (path === 'invoices' && req.method === 'GET') {
      const customer_id = params.get('customer_id')
      const status = params.get('status')
      let q = supabase.from('invoices').select('*, customers(full_name)').order('created_at', { ascending: false }).limit(100)
      if (customer_id) q = q.eq('customer_id', customer_id)
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ invoices: data })
    }

    if (path === 'invoice' && req.method === 'POST') {
      const { id, customer_id, deal_id, line_items, tax_rate, subtotal, amount, status, due_date, notes, currency } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (line_items) updates.line_items = line_items
        if (tax_rate !== undefined) updates.tax_rate = tax_rate
        if (subtotal !== undefined) updates.subtotal = subtotal
        if (amount !== undefined) updates.amount = amount
        if (status) updates.status = status
        if (due_date !== undefined) updates.due_date = due_date
        if (notes !== undefined) updates.notes = notes
        if (currency) updates.currency = currency
        if (status === 'sent') updates.sent_at = new Date().toISOString()
        if (status === 'paid') updates.paid_at = new Date().toISOString()
        const { error } = await supabase.from('invoices').update(updates).eq('id', id)
        if (error) return fail(error.message)
        await logActivity(supabase, 'invoice', id, 'updated')
        return ok({ action: 'updated', invoice_id: id })
      }
      if (!customer_id) return fail('customer_id is required')
      const { data, error } = await supabase.from('invoices').insert({
        customer_id, deal_id: deal_id || null, line_items: line_items || [],
        tax_rate: tax_rate || 0, subtotal: subtotal || 0, amount: amount || 0,
        status: status || 'draft', due_date: due_date || null, notes: notes || null,
        currency: currency || 'USD',
      }).select('id, invoice_number').single()
      if (error) return fail(error.message)
      await logActivity(supabase, 'invoice', data?.id, 'created', data?.invoice_number)
      return ok({ action: 'created', invoice_id: data?.id, invoice_number: data?.invoice_number })
    }

    if (path === 'invoice' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('invoices').delete().eq('id', id)
      if (error) return fail(error.message)
      await logActivity(supabase, 'invoice', id, 'deleted')
      return ok({ action: 'deleted', invoice_id: id })
    }

    // ─── COMMUNICATIONS ─────────────────────────────────────
    if (path === 'communications' && req.method === 'GET') {
      const customer_id = params.get('customer_id')
      const type = params.get('type')
      let q = supabase.from('communications').select('*, customers(full_name)').order('created_at', { ascending: false }).limit(100)
      if (customer_id) q = q.eq('customer_id', customer_id)
      if (type) q = q.eq('type', type)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ communications: data })
    }

    if (path === 'communication' && req.method === 'POST') {
      const { id, type, customer_id, direction, subject, body: commBody, from_address, to_address, phone_number, status, provider, duration_seconds, metadata } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (status) updates.status = status
        if (commBody !== undefined) updates.body = commBody
        if (metadata) updates.metadata = metadata
        if (duration_seconds !== undefined) updates.duration_seconds = duration_seconds
        const { error } = await supabase.from('communications').update(updates).eq('id', id)
        if (error) return fail(error.message)
        return ok({ action: 'updated', communication_id: id })
      }
      if (!type) return fail('type is required')
      const { data, error } = await supabase.from('communications').insert({
        type, customer_id: customer_id || null, direction: direction || 'outbound',
        subject: subject || null, body: commBody || null,
        from_address: from_address || null, to_address: to_address || null,
        phone_number: phone_number || null, status: status || 'sent',
        provider: provider || null, duration_seconds: duration_seconds || null,
        metadata: metadata || {},
      }).select('id').single()
      if (error) return fail(error.message)
      return ok({ action: 'created', communication_id: data?.id })
    }

    if (path === 'communication' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('communications').delete().eq('id', id)
      if (error) return fail(error.message)
      return ok({ action: 'deleted', communication_id: id })
    }

    // ─── SIGNATURES (read-only) ──────────────────────────────
    if (path === 'signatures' && req.method === 'GET') {
      const customer_id = params.get('customer_id')
      const document_id = params.get('document_id')
      let q = supabase.from('signatures').select('*, customers(full_name), documents(title)').order('signed_at', { ascending: false }).limit(100)
      if (customer_id) q = q.eq('customer_id', customer_id)
      if (document_id) q = q.eq('document_id', document_id)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ signatures: data })
    }

    // ─── INTERACTIONS ────────────────────────────────────────
    if (path === 'interactions' && req.method === 'GET') {
      const customer_id = params.get('customer_id')
      let q = supabase.from('interactions').select('*').order('occurred_at', { ascending: false }).limit(100)
      if (customer_id) q = q.eq('customer_id', customer_id)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ interactions: data })
    }

    if (path === 'interaction' && req.method === 'POST') {
      const { customer_id, type, direction, subject, notes, outcome, next_action } = body
      if (!customer_id || !type) return fail('customer_id and type are required')
      const { data, error } = await supabase.from('interactions').insert({
        customer_id, type, direction: direction || 'outbound',
        subject: subject || null, notes: notes || null,
        outcome: outcome || null, next_action: next_action || null,
      }).select('id').single()
      if (error) return fail(error.message)
      return ok({ action: 'created', interaction_id: data?.id })
    }

    // ─── BOARDS / LISTS / CARDS ──────────────────────────────
    if (path === 'boards' && req.method === 'GET') {
      const { data } = await supabase.from('boards').select(`
        id, name, description, category, deadline, visibility,
        lists:lists(id, name, position,
          cards:cards(id, title, status, priority, position, source, description)
        )
      `).order('created_at', { ascending: true })
      return ok({ boards: data })
    }

    if (path === 'board' && req.method === 'POST') {
      const { id, name, description, category, deadline, visibility, customer_id } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (name) updates.name = name
        if (description !== undefined) updates.description = description
        if (category) updates.category = category
        if (deadline !== undefined) updates.deadline = deadline
        if (visibility) updates.visibility = visibility
        if (customer_id !== undefined) updates.customer_id = customer_id
        const { error } = await supabase.from('boards').update(updates).eq('id', id)
        if (error) return fail(error.message)
        await logActivity(supabase, 'board', id, 'updated', name)
        return ok({ action: 'updated', board_id: id })
      }
      if (!name) return fail('name is required')
      const { data, error } = await supabase.from('boards').insert({
        name, description: description || null, category: category || null,
        deadline: deadline || null, visibility: visibility || 'private',
        customer_id: customer_id || null,
      }).select('id').single()
      if (error) return fail(error.message)
      await logActivity(supabase, 'board', data?.id, 'created', name)
      return ok({ action: 'created', board_id: data?.id })
    }

    if (path === 'board' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('boards').delete().eq('id', id)
      if (error) return fail(error.message)
      await logActivity(supabase, 'board', id, 'deleted')
      return ok({ action: 'deleted', board_id: id })
    }

    if (path === 'list' && req.method === 'POST') {
      const { id, board_id, name, position } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (name) updates.name = name
        if (position !== undefined) updates.position = position
        const { error } = await supabase.from('lists').update(updates).eq('id', id)
        if (error) return fail(error.message)
        return ok({ action: 'updated', list_id: id })
      }
      if (!board_id || !name) return fail('board_id and name are required')
      const { data, error } = await supabase.from('lists').insert({
        board_id, name, position: position || 0,
      }).select('id').single()
      if (error) return fail(error.message)
      return ok({ action: 'created', list_id: data?.id })
    }

    // ─── CARDS (board cards) ─────────────────────────────────
    if (path === 'task' && req.method === 'POST') {
      const { external_id, source, source_url, title, content, metadata } = body
      const { data: existing } = await supabase.from('cards').select('id').eq('external_id', external_id).maybeSingle()
      if (existing) {
        await supabase.from('card_comments').insert({ card_id: existing.id, body: `[Bot Update] ${content || title}` })
        const updates: Record<string, unknown> = {}
        if (source_url) updates.source_url = source_url
        if (Object.keys(updates).length > 0) await supabase.from('cards').update(updates).eq('id', existing.id)
        return ok({ action: 'updated', card_id: existing.id })
      }
      let { data: board } = await supabase.from('boards').select('id').eq('name', 'Clawd Bot Command Center').maybeSingle()
      if (!board) {
        const { data: nb } = await supabase.from('boards').insert({ name: 'Clawd Bot Command Center', description: 'Auto-created by Clawd Bot', visibility: 'team' }).select('id').single()
        board = nb
      }
      let { data: inbox } = await supabase.from('lists').select('id').eq('board_id', board!.id).eq('name', 'Inbox').maybeSingle()
      if (!inbox) {
        const { data: nl } = await supabase.from('lists').insert({ board_id: board!.id, name: 'Inbox', position: 0 }).select('id').single()
        inbox = nl
      }
      let priority = 'medium'
      const keywords = metadata?.keywords || []
      const lowerTitle = (title || '').toLowerCase()
      if (keywords.includes('urgent') || lowerTitle.includes('urgent')) priority = 'urgent'
      else if (keywords.includes('high') || lowerTitle.includes('important')) priority = 'high'
      else if (keywords.includes('low') || lowerTitle.includes('fyi')) priority = 'low'
      const { data: maxPos } = await supabase.from('cards').select('position').eq('list_id', inbox!.id).order('position', { ascending: false }).limit(1).maybeSingle()
      const { data: card } = await supabase.from('cards').insert({
        board_id: board!.id, list_id: inbox!.id, title: title || 'Untitled',
        description: content || '', source, source_url, external_id, priority,
        position: (maxPos?.position ?? -1) + 1,
      }).select('id').single()
      if (card) {
        const labelMap: Record<string, string> = { x: 'Lead', twitter: 'Lead', reddit: 'Content Idea', craigslist: 'Opportunity', web: 'Bug/Issue', email: 'Follow-up' }
        const labelName = labelMap[source?.toLowerCase()] || 'Lead'
        const { data: label } = await supabase.from('labels').select('id').eq('board_id', board!.id).eq('name', labelName).maybeSingle()
        if (label) await supabase.from('card_labels').insert({ card_id: card.id, label_id: label.id })
      }
      return ok({ action: 'created', card_id: card?.id })
    }

    if (path === 'card' && req.method === 'POST') {
      const { id, board_id, list_id, title, description, status, priority, due_date, source, source_url, customer_id, deal_id } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (list_id) updates.list_id = list_id
        if (title) updates.title = title
        if (description !== undefined) updates.description = description
        if (status) updates.status = status
        if (priority) updates.priority = priority
        if (due_date !== undefined) updates.due_date = due_date
        if (customer_id !== undefined) updates.customer_id = customer_id
        if (deal_id !== undefined) updates.deal_id = deal_id
        const { error } = await supabase.from('cards').update(updates).eq('id', id)
        if (error) return fail(error.message)
        return ok({ action: 'updated', card_id: id })
      }
      if (!board_id || !list_id || !title) return fail('board_id, list_id, and title are required')
      const { data: maxPos } = await supabase.from('cards').select('position').eq('list_id', list_id).order('position', { ascending: false }).limit(1).maybeSingle()
      const { data, error } = await supabase.from('cards').insert({
        board_id, list_id, title, description: description || null,
        status: status || 'open', priority: priority || 'medium',
        due_date: due_date || null, source: source || null, source_url: source_url || null,
        customer_id: customer_id || null, deal_id: deal_id || null,
        position: (maxPos?.position ?? -1) + 1,
      }).select('id').single()
      if (error) return fail(error.message)
      return ok({ action: 'created', card_id: data?.id })
    }

    if (path === 'card' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('cards').delete().eq('id', id)
      if (error) return fail(error.message)
      return ok({ action: 'deleted', card_id: id })
    }

    if (path === 'move' && req.method === 'POST') {
      const { card_id, to_list_id } = body
      if (!card_id || !to_list_id) return fail('card_id and to_list_id are required')
      const { error } = await supabase.from('cards').update({ list_id: to_list_id }).eq('id', card_id)
      if (error) return fail(error.message)
      return ok({ action: 'moved', card_id })
    }

    if (path === 'comment' && req.method === 'POST') {
      const { card_id, comment } = body
      if (!card_id || !comment) return fail('card_id and comment are required')
      const { error } = await supabase.from('card_comments').insert({ card_id, body: comment })
      if (error) return fail(error.message)
      return ok({ action: 'created', card_id })
    }

    if (path === 'attach' && req.method === 'POST') {
      const { card_id, type, title: attTitle, url: attUrl } = body
      if (!card_id) return fail('card_id is required')
      const { error } = await supabase.from('card_attachments').insert({ card_id, type: type || 'url', title: attTitle, url: attUrl })
      if (error) return fail(error.message)
      return ok({ action: 'created', card_id })
    }

    // ─── BOT TASKS ───────────────────────────────────────────
    if (path === 'bot-tasks' && req.method === 'GET') {
      const status = params.get('status')
      let q = supabase.from('bot_tasks').select('*').order('created_at', { ascending: false }).limit(100)
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ bot_tasks: data })
    }

    if (path === 'bot-task' && req.method === 'POST') {
      const { id, title, description, bot_agent, customer_id, status, priority, due_date, meta } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (title) updates.title = title
        if (description !== undefined) updates.description = description
        if (status) updates.status = status
        if (priority) updates.priority = priority
        if (due_date !== undefined) updates.due_date = due_date
        if (meta) updates.meta = meta
        const { error } = await supabase.from('bot_tasks').update(updates).eq('id', id)
        if (error) return fail(error.message)
        return ok({ action: 'updated', bot_task_id: id })
      }
      if (!title || !bot_agent) return fail('title and bot_agent are required')
      const { data, error } = await supabase.from('bot_tasks').insert({
        title, description: description || null, bot_agent,
        customer_id: customer_id || null, status: status || 'queued',
        priority: priority || 'medium', due_date: due_date || null, meta: meta || {},
      }).select('id').single()
      if (error) return fail(error.message)
      return ok({ action: 'created', bot_task_id: data?.id })
    }

    if (path === 'bot-task' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('bot_tasks').delete().eq('id', id)
      if (error) return fail(error.message)
      return ok({ action: 'deleted', bot_task_id: id })
    }

    // ─── ACTIVITY LOG (read-only) ────────────────────────────
    if (path === 'activity' && req.method === 'GET') {
      const entity_type = params.get('entity_type')
      let q = supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(100)
      if (entity_type) q = q.eq('entity_type', entity_type)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ activity: data })
    }

    // ─── LABELS ──────────────────────────────────────────────
    if (path === 'labels' && req.method === 'GET') {
      const board_id = params.get('board_id')
      let q = supabase.from('labels').select('*')
      if (board_id) q = q.eq('board_id', board_id)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ labels: data })
    }

    if (path === 'label' && req.method === 'POST') {
      const { board_id, name, color } = body
      if (!board_id || !name) return fail('board_id and name are required')
      const { data, error } = await supabase.from('labels').insert({ board_id, name, color: color || null }).select('id').single()
      if (error) return fail(error.message)
      return ok({ action: 'created', label_id: data?.id })
    }

    // ─── AUTOMATIONS ─────────────────────────────────────────
    if (path === 'automations' && req.method === 'GET') {
      const trigger_table = params.get('trigger_table')
      const enabled = params.get('enabled')
      let q = supabase.from('automations').select('*').order('created_at', { ascending: false }).limit(100)
      if (trigger_table) q = q.eq('trigger_table', trigger_table)
      if (enabled === 'true') q = q.eq('is_enabled', true)
      if (enabled === 'false') q = q.eq('is_enabled', false)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ automations: data })
    }

    if (path === 'automation' && req.method === 'POST') {
      const { id, name, trigger_event, trigger_table: tt, conditions, actions, is_enabled } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (name) updates.name = name
        if (trigger_event) updates.trigger_event = trigger_event
        if (tt) updates.trigger_table = tt
        if (conditions !== undefined) updates.conditions = conditions
        if (actions !== undefined) updates.actions = actions
        if (is_enabled !== undefined) updates.is_enabled = is_enabled
        const { error } = await supabase.from('automations').update(updates).eq('id', id)
        if (error) return fail(error.message)
        return ok({ action: 'updated', automation_id: id })
      }
      if (!name || !trigger_event || !tt) return fail('name, trigger_event, and trigger_table are required')
      const { data, error } = await supabase.from('automations').insert({
        name, trigger_event, trigger_table: tt,
        conditions: conditions || {}, actions: actions || [],
        is_enabled: is_enabled !== undefined ? is_enabled : true,
      }).select('id').single()
      if (error) return fail(error.message)
      return ok({ action: 'created', automation_id: data?.id })
    }

    if (path === 'automation' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('automations').delete().eq('id', id)
      if (error) return fail(error.message)
      return ok({ action: 'deleted', automation_id: id })
    }

    if (path === 'trigger' && req.method === 'POST') {
      const { event, table, payload } = body
      if (!event || !table) return fail('event and table are required')

      const { data: matches, error } = await supabase
        .from('automations')
        .select('*')
        .eq('trigger_event', event)
        .eq('trigger_table', table)
        .eq('is_enabled', true)

      if (error) return fail(error.message)
      if (!matches || matches.length === 0) return ok({ triggered: 0, message: 'No matching automations found' })

      const results: { automation_id: string; name: string; actions_executed: number; results: unknown[] }[] = []

      for (const auto of matches) {
        const actionResults: unknown[] = []
        const actions = Array.isArray(auto.actions) ? auto.actions : []

        for (const act of actions as Array<{ type: string; [key: string]: unknown }>) {
          try {
            if (act.type === 'create_task') {
              const { data } = await supabase.from('bot_tasks').insert({
                title: (act.title as string) || `Auto: ${auto.name}`,
                bot_agent: (act.bot_agent as string) || 'automation',
                description: (act.description as string) || null,
                priority: (act.priority as string) || 'medium',
                meta: { automation_id: auto.id, trigger_payload: payload || {} },
              }).select('id').single()
              actionResults.push({ type: 'create_task', success: true, bot_task_id: data?.id })
            } else if (act.type === 'update_status') {
              const targetTable = (act.target_table as string) || table
              const targetId = (act.target_id as string) || payload?.id
              if (targetId) {
                await supabase.from(targetTable).update({ status: act.new_status }).eq('id', targetId)
                actionResults.push({ type: 'update_status', success: true, target: `${targetTable}/${targetId}` })
              }
            } else if (act.type === 'create_interaction') {
              const customerId = (act.customer_id as string) || payload?.customer_id
              if (customerId) {
                await supabase.from('interactions').insert({
                  customer_id: customerId,
                  type: (act.interaction_type as string) || 'note',
                  subject: (act.subject as string) || `Automation: ${auto.name}`,
                  notes: (act.notes as string) || null,
                }).select('id').single()
                actionResults.push({ type: 'create_interaction', success: true })
              }
            } else if (act.type === 'create_card') {
              const boardName = (act.board_name as string) || 'Clawd Bot Command Center'
              let { data: board } = await supabase.from('boards').select('id').eq('name', boardName).maybeSingle()
              if (board) {
                let { data: inbox } = await supabase.from('lists').select('id').eq('board_id', board.id).eq('name', 'Inbox').maybeSingle()
                if (inbox) {
                  const { data: maxPos } = await supabase.from('cards').select('position').eq('list_id', inbox.id).order('position', { ascending: false }).limit(1).maybeSingle()
                  await supabase.from('cards').insert({
                    board_id: board.id, list_id: inbox.id,
                    title: (act.title as string) || `Auto: ${auto.name}`,
                    description: (act.description as string) || '',
                    priority: (act.priority as string) || 'medium',
                    position: (maxPos?.position ?? -1) + 1,
                  })
                  actionResults.push({ type: 'create_card', success: true })
                }
              }
            } else {
              actionResults.push({ type: act.type, success: false, reason: 'unknown action type' })
            }
          } catch (e) {
            actionResults.push({ type: act.type, success: false, error: (e as Error).message })
          }
        }

        results.push({ automation_id: auto.id, name: auto.name, actions_executed: actionResults.length, results: actionResults })
      }

      return ok({ triggered: results.length, results })
    }

    // ─── MEETINGS ─────────────────────────────────────────────
    if (path === 'meetings' && req.method === 'GET') {
      const { data } = await supabase.from('meetings').select('*').order('created_at', { ascending: false }).limit(100)
      return ok({ meetings: data })
    }

    if (path === 'meeting' && req.method === 'POST') {
      const { id, title, host_id, scheduled_at, category, status } = body
      if (id && body._delete) {
        await supabase.from('meetings').delete().eq('id', id)
        await logActivity(supabase, 'meeting', id, 'deleted')
        return ok({ action: 'deleted', meeting_id: id })
      }
      if (id) {
        const updates: Record<string, unknown> = {}
        if (title) updates.title = title
        if (host_id !== undefined) updates.host_id = host_id
        if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at
        if (category !== undefined) updates.category = category
        if (status) updates.status = status
        const { data, error } = await supabase.from('meetings').update(updates).eq('id', id).select().single()
        if (error) return fail(error.message)
        await logActivity(supabase, 'meeting', id, 'updated', title || data.title)
        return ok({ action: 'updated', meeting: data, room_url: `https://stu25.com/meet/${data.room_code}` })
      }
      const { data, error } = await supabase.from('meetings').insert({
        title: title || 'Meeting',
        host_id: host_id || null,
        scheduled_at: scheduled_at || null,
        category: category || null,
        status: status || 'waiting',
      }).select().single()
      if (error) return fail(error.message)
      await logActivity(supabase, 'meeting', data.id, 'created', data.title)
      return ok({ action: 'created', meeting: data, room_url: `https://stu25.com/meet/${data.room_code}` })
    }

    if (path === 'meeting' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('meetings').delete().eq('id', id)
      if (error) return fail(error.message)
      await logActivity(supabase, 'meeting', id, 'deleted')
      return ok({ action: 'deleted', meeting_id: id })
    }

    // ─── GENERATE (mock AI services) ─────────────────────────
    if (path === 'generate-resume' && req.method === 'POST') {
      const resumeJson = {
        name: body.name || 'Client Name',
        email: body.email || 'client@example.com',
        summary: 'Professional summary generated from conversation.',
        experience: [{ title: 'Position', company: 'Company', duration: '2020-2024' }],
        skills: ['Skill 1', 'Skill 2', 'Skill 3'],
        style: body.resume_style || 'modern',
      }
      return ok({ pdf_base64: 'MOCK_PDF_BASE64_RESUME_PLACEHOLDER', resume_json: resumeJson })
    }

    if (path === 'generate-contract' && req.method === 'POST') {
      const contractJson = {
        parties: { provider: 'STU25', client: body.client_name || 'Client Name' },
        terms: body.terms || { price: 400, deposit: 200, revisions_policy: '2 free revisions' },
        template: body.contract_template || 'resume_service_v1',
        clauses: [
          'Services will be delivered within 7 business days.',
          'Payment is due upon signing.',
          'Two (2) free revisions included.',
        ],
      }
      return ok({ pdf_base64: 'MOCK_PDF_BASE64_CONTRACT_PLACEHOLDER', contract_json: contractJson })
    }

    if (path === 'generate-email' && req.method === 'POST') {
      const name = body.customer_name || 'Valued Customer'
      const portalLink = body.portal_link || '#'
      return ok({
        subject: `Your documents are ready — ${name}`,
        body_html: `<p>Hi ${name},</p><p>Your resume and contract are ready for review. Please click the link below to sign your contract:</p><p><a href="${portalLink}">${portalLink}</a></p><p>Best regards,<br/>STU25 Team</p>`,
        body_text: `Hi ${name}, your documents are ready. Sign your contract here: ${portalLink}`,
      })
    }

    if (path === 'analyze-thread' && req.method === 'POST') {
      const transcript = (body.transcript || '').toLowerCase()
      const hasName = transcript.includes('name')
      const hasEmail = transcript.includes('email') || transcript.includes('@')
      const hasPhone = transcript.includes('phone') || transcript.includes('call')
      const missing: string[] = []
      if (!hasName) missing.push('full_name')
      if (!hasEmail) missing.push('email')
      if (!hasPhone) missing.push('phone')
      const analysisStatus = missing.length === 0 ? 'ready_for_docs' : 'collecting_info'
      const summary = missing.length === 0
        ? 'All required information collected. Ready to generate documents.'
        : `Still collecting info. Missing: ${missing.join(', ')}`
      return ok({ status: analysisStatus, missing_fields: missing, summary })
    }

    // ─── TEMPLATES ─────────────────────────────────────────────
    if (path === 'templates' && req.method === 'GET') {
      const category = params.get('category')
      const type = params.get('type')
      let q = supabase.from('templates').select('*').order('created_at', { ascending: false }).limit(100)
      if (category) q = q.eq('category', category)
      if (type) q = q.eq('type', type)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ templates: data })
    }

    if (path === 'template' && req.method === 'POST') {
      const { id, name, description, type, body_html, placeholders, category } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (name) updates.name = name
        if (description !== undefined) updates.description = description
        if (type) updates.type = type
        if (body_html !== undefined) updates.body_html = body_html
        if (placeholders) updates.placeholders = placeholders
        if (category) updates.category = normalizeCategory(category)
        const { error } = await supabase.from('templates').update(updates).eq('id', id as string)
        if (error) return fail(error.message)
        await logActivity(supabase, 'template', id as string, 'updated', name as string)
        return ok({ action: 'updated', template_id: id })
      }
      if (!name) return fail('name is required')
      const { data, error } = await supabase.from('templates').insert({
        name, description: description || null, type: type || 'contract',
        body_html: body_html || '', placeholders: placeholders || [],
        category: normalizeCategory(category),
      }).select('id').single()
      if (error) return fail(error.message)
      await logActivity(supabase, 'template', data?.id, 'created', name as string)
      return ok({ action: 'created', template_id: data?.id })
    }

    if (path === 'template' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('templates').delete().eq('id', id as string)
      if (error) return fail(error.message)
      await logActivity(supabase, 'template', id as string, 'deleted')
      return ok({ action: 'deleted', template_id: id })
    }

    // ─── STATE (full overview) ───────────────────────────────
    if (path === 'state' && req.method === 'GET') {
      const [boards, customers, deals, projects, meetings, templates, content] = await Promise.all([
        supabase.from('boards').select('id, name, lists:lists(id, name, position, cards:cards(id, title, status, priority, position, source))').order('created_at', { ascending: true }),
        supabase.from('customers').select('id, full_name, status, email, category').order('created_at', { ascending: false }).limit(50),
        supabase.from('deals').select('id, title, stage, deal_value, status, category').order('created_at', { ascending: false }).limit(50),
        supabase.from('projects').select('id, title, status, priority, category').order('created_at', { ascending: false }).limit(50),
        supabase.from('meetings').select('id, title, room_code, status, scheduled_at, category').order('created_at', { ascending: false }).limit(50),
        supabase.from('templates').select('id, name, type, category, placeholders').order('created_at', { ascending: false }).limit(50),
        supabase.from('content_assets').select('id, title, type, status, source, category, customer_id, folder, url').order('created_at', { ascending: false }).limit(100),
      ])
      return ok({ boards: boards.data, customers: customers.data, deals: deals.data, projects: projects.data, meetings: meetings.data, templates: templates.data, content: content.data })
    }

    return fail('Unknown endpoint', 404)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return fail(msg, 500)
  }
})
