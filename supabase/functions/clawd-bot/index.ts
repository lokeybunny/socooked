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
  const params = url.searchParams

  // ─── PUBLIC ROUTE: site-configs GET (no auth needed, v0 sites fetch this) ─
  if (path === 'site-configs' && req.method === 'GET') {
    const site_id = params.get('site_id')
    const published_only = params.get('published') === 'true'
    if (!site_id) return fail('site_id query param required')
    const pubSupabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    let q = pubSupabase.from('site_configs').select('*').eq('site_id', site_id).order('section')
    if (published_only) q = q.eq('is_published', true)
    const { data, error } = await q
    if (error) return fail(error.message, 500)
    const config: Record<string, any> = {}
    for (const row of (data || [])) config[row.section] = { ...row.content, _version: row.version, _id: row.id }
    return ok({ site_id, config })
  }

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
  const VALID_CATEGORIES = ['digital-services', 'brick-and-mortar', 'digital-ecommerce', 'food-and-beverage', 'mobile-services', 'telegram', 'other']
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
    // params already defined above
    // For DELETE requests, also check query param ?id=
    if (req.method === 'DELETE' && !body.id) {
      const qId = params.get('id')
      if (qId) body.id = qId
    }

    // Audit log for bot calls
    if (isBot && path) {
      await auditLog(supabase, path, body)
    }

    // ─── /higs — Higgsfield model reminder ─────────────────────
    if (path === 'higs' && req.method === 'GET') {
      return ok({
        message: 'Here is a reminder of the Higgsfield prompts:',
        models: [
          { id: 'higgsfield-ai/soul/standard', note: 'Default image model' },
          { id: 'higgsfield-ai/soul/turbo', note: 'Fast image model' },
          { id: 'higgsfield-ai/dop/standard', note: 'Default video model' },
          { id: 'higgsfield-ai/dop/turbo', note: 'Fast video model' },
          { id: 'flux', note: 'Flux image model' },
          { id: 'iris', note: 'Iris image model' },
        ],
      })
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
        if (full_name !== undefined) updates.full_name = full_name
        if (email !== undefined) updates.email = email
        if (phone !== undefined) updates.phone = phone
        if (address !== undefined) updates.address = address
        if (company !== undefined) updates.company = company
        if (source !== undefined) updates.source = source
        if (status !== undefined) updates.status = status
        if (notes !== undefined) updates.notes = notes
        if (tags !== undefined) updates.tags = tags
        if (category !== undefined) updates.category = normalizeCategory(category)
        if (meta !== undefined) updates.meta = meta
        if (Object.keys(updates).length === 0) return fail('No fields to update. Send at least one field besides id.')
        const { data: updated, error } = await supabase.from('customers').update(updates).eq('id', id).select('id, full_name').maybeSingle()
        if (error) return fail(error.message)
        if (!updated) return fail(`Customer with id ${id} not found`, 404)
        await logActivity(supabase, 'customer', id, 'updated', updated.full_name)
        return ok({ action: 'updated', customer_id: id, updated_fields: Object.keys(updates), current_name: updated.full_name })
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
      const { id, title, type, body: assetBody, status, tags, category, url, folder, scheduled_for, source, customer_id, file_id } = body
      const VALID_SOURCES = ['dashboard', 'google-drive', 'instagram', 'sms', 'client-direct', 'higgsfield', 'ai-generated', 'telegram', 'other']
      const ALLOWED_TELEGRAM_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/gif']
      const ALLOWED_TELEGRAM_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif']

      const getExt = (value: string | null | undefined): string | null => {
        if (!value) return null
        const cleaned = value.split('?')[0].split('#')[0]
        const ext = cleaned.split('.').pop()?.toLowerCase()
        return ext || null
      }

      // Auto-download Telegram file if file_id provided and no url
      let resolvedUrl = url as string | null | undefined
      let telegramDetectedMime: string | null = null
      let telegramDetectedExt: string | null = null

      if (!resolvedUrl && file_id) {
        try {
          const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
          if (!TG_TOKEN) return fail('Telegram integration is not configured', 500)

          const fileInfoRes = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getFile?file_id=${file_id}`)
          const fileInfo = await fileInfoRes.json()
          if (!fileInfo.ok || !fileInfo.result?.file_path) {
            return fail('Invalid Telegram file_id. Unable to fetch file path.', 422)
          }

          const tgFilePath = String(fileInfo.result.file_path)
          telegramDetectedExt = getExt(tgFilePath)
          const dlUrl = `https://api.telegram.org/file/bot${TG_TOKEN}/${tgFilePath}`
          const fileRes = await fetch(dlUrl)
          if (!fileRes.ok) {
            return fail('Failed to download Telegram file.', 422)
          }

          const blob = await fileRes.blob()
          const contentTypeRaw = (fileRes.headers.get('content-type') || '').toLowerCase()
          const contentType = contentTypeRaw.split(';')[0].trim()
          telegramDetectedMime = contentType || null

          const extMap: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'video/mp4': 'mp4',
            'audio/mpeg': 'mp3',
          }

          const ext = telegramDetectedExt || extMap[contentType] || 'bin'
          const safeTitle = ((title as string) || 'telegram-file').replace(/[^a-zA-Z0-9-_ ]/g, '').substring(0, 80)
          const storagePath = `telegram/${safeTitle}/${Date.now()}.${ext}`

          const { error: upErr } = await supabase.storage
            .from('content-uploads')
            .upload(storagePath, blob, {
              contentType: contentType || 'application/octet-stream',
              cacheControl: '3600',
              upsert: false,
            })

          if (upErr) return fail(`Failed to store Telegram file: ${upErr.message}`, 500)

          const { data: pubData } = supabase.storage.from('content-uploads').getPublicUrl(storagePath)
          resolvedUrl = pubData.publicUrl
        } catch (e) {
          console.log('[content] telegram file download failed:', e)
          return fail('Telegram file download failed. Ensure file_id is valid.', 422)
        }
      }

      if (id) {
        const updates: Record<string, unknown> = {}
        if (title) updates.title = title
        if (type) updates.type = String(type).toLowerCase()
        if (assetBody !== undefined) updates.body = assetBody
        if (status) updates.status = status
        if (tags) updates.tags = tags
        if (category) updates.category = normalizeCategory(category)
        if (resolvedUrl !== undefined) updates.url = resolvedUrl
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

      const normalizedType = String(type).toLowerCase()
      const normalizedSource = source ? (VALID_SOURCES.includes(source as string) ? source : 'other') : 'dashboard'
      // Auto-assign telegram category for telegram-sourced content
      const effectiveCategory = (normalizedSource === 'telegram' && !category) ? 'telegram' : normalizeCategory(category)
      const isTelegramImage = normalizedSource === 'telegram' && normalizedType === 'image'

      if (isTelegramImage) {
        const urlExt = getExt(resolvedUrl)
        const mimeAllowed = !!telegramDetectedMime && ALLOWED_TELEGRAM_IMAGE_MIME.includes(telegramDetectedMime)
        const extAllowed = (!!telegramDetectedExt && ALLOWED_TELEGRAM_IMAGE_EXT.includes(telegramDetectedExt)) || (!!urlExt && ALLOWED_TELEGRAM_IMAGE_EXT.includes(urlExt))

        if (!file_id && !resolvedUrl) {
          return fail('Telegram image uploads require file_id (or a direct image url).', 400)
        }
        if (!resolvedUrl) {
          return fail('Telegram image could not be stored. Ensure file_id points to a valid .jpg, .png, or .gif.', 422)
        }
        if (!(mimeAllowed || extAllowed)) {
          return fail('Only .jpg, .png, and .gif images are accepted for Telegram uploads.', 415)
        }
      }

      const { data, error } = await supabase.from('content_assets').insert({
        title,
        type: normalizedType,
        body: assetBody || null,
        status: status || 'draft',
        tags: tags || [],
        category: effectiveCategory,
        url: resolvedUrl || null,
        folder: folder || null,
        scheduled_for: scheduled_for || null,
        source: normalizedSource,
        customer_id: customer_id || null,
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

    // ─── ASSIGN CONTENT TO CUSTOMER ──────────────────────────
    if (path === 'assign-content' && req.method === 'POST') {
      const { content_id, customer_id } = body
      if (!content_id) return fail('content_id is required')
      // customer_id can be null to unassign
      const updates: Record<string, unknown> = { customer_id: customer_id || null }
      const { data, error } = await supabase.from('content_assets').update(updates).eq('id', content_id).select('id, title, customer_id').maybeSingle()
      if (error) return fail(error.message)
      if (!data) return fail('Content asset not found', 404)
      const action = customer_id ? 'content_assigned' : 'content_unassigned'
      await logActivity(supabase, 'content', content_id, action, data.title)
      await auditLog(supabase, 'assign-content', { content_id, customer_id, action })
      return ok({ action, content: data })
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

    // POST /clawd-bot/send-invoice — builds styled HTML invoice & emails via gmail-api
    if (path === 'send-invoice' && req.method === 'POST') {
      const { invoice_id } = body
      if (!invoice_id) return fail('invoice_id is required')

      const invoiceApiUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/invoice-api?action=send-invoice`
      const res = await fetch(invoiceApiUrl, {
        method: 'POST',
        headers: {
          'x-bot-secret': Deno.env.get('BOT_SECRET') || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoice_id }),
      })
      const result = await res.json()
      if (!res.ok) return fail(result.error || 'Failed to send invoice email', res.status)
      return ok(result.data || result)
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
      const { id, customer_id, type, direction, subject, notes, outcome, next_action } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (type) updates.type = type
        if (direction) updates.direction = direction
        if (subject !== undefined) updates.subject = subject
        if (notes !== undefined) updates.notes = notes
        if (outcome !== undefined) updates.outcome = outcome
        if (next_action !== undefined) updates.next_action = next_action
        const { error } = await supabase.from('interactions').update(updates).eq('id', id)
        if (error) return fail(error.message)
        return ok({ action: 'updated', interaction_id: id })
      }
      if (!customer_id || !type) return fail('customer_id and type are required')
      const { data, error } = await supabase.from('interactions').insert({
        customer_id, type, direction: direction || 'outbound',
        subject: subject || null, notes: notes || null,
        outcome: outcome || null, next_action: next_action || null,
      }).select('id').single()
      if (error) return fail(error.message)
      return ok({ action: 'created', interaction_id: data?.id })
    }

    if (path === 'interaction' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('interactions').delete().eq('id', id)
      if (error) return fail(error.message)
      return ok({ action: 'deleted', interaction_id: id })
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
      const bot_agent = params.get('bot_agent')
      let q = supabase.from('bot_tasks').select('*').order('created_at', { ascending: false }).limit(100)
      if (status) q = q.eq('status', status)
      if (bot_agent) q = q.eq('bot_agent', bot_agent)
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

    // ─── CANCEL MEETINGS (smart: by customer name, date range, or both) ─
    if (path === 'cancel-meetings' && req.method === 'POST') {
      const { customer_name, customer_id, from, to, date } = body as {
        customer_name?: string; customer_id?: string;
        from?: string; to?: string; date?: string;
      }

      // Build query — always join customer name for response
      let q = supabase.from('meetings').select('*, customers(full_name)').neq('status', 'cancelled')

      // Filter by customer
      if (customer_id) {
        q = q.eq('customer_id', customer_id)
      } else if (customer_name) {
        // Look up customer(s) by name (case-insensitive partial match)
        const { data: customers } = await supabase.from('customers').select('id, full_name').ilike('full_name', `%${customer_name}%`)
        if (!customers || customers.length === 0) return fail(`No customer found matching "${customer_name}"`)
        const ids = customers.map((c: any) => c.id)
        q = q.in('customer_id', ids)
      }

      // Filter by date range
      if (date) {
        // Single day: match scheduled_at within that calendar day
        q = q.gte('scheduled_at', `${date}T00:00:00Z`).lt('scheduled_at', `${date}T23:59:59Z`)
      } else if (from && to) {
        q = q.gte('scheduled_at', `${from}T00:00:00Z`).lte('scheduled_at', `${to}T23:59:59Z`)
      } else if (from) {
        q = q.gte('scheduled_at', `${from}T00:00:00Z`)
      } else if (to) {
        q = q.lte('scheduled_at', `${to}T23:59:59Z`)
      }

      const { data: meetings, error: fetchErr } = await q
      if (fetchErr) return fail(fetchErr.message, 500)
      if (!meetings || meetings.length === 0) return ok({ action: 'no_matches', cancelled: [], message: 'No meetings found matching criteria' })

      // Cancel all matched meetings
      const cancelledIds = meetings.map((m: any) => m.id)
      const { error: updateErr } = await supabase.from('meetings').update({ status: 'cancelled' }).in('id', cancelledIds)
      if (updateErr) return fail(updateErr.message, 500)

      // Also cancel any linked bookings
      const roomCodes = meetings.map((m: any) => m.room_code).filter(Boolean)
      if (roomCodes.length > 0) {
        await supabase.from('bookings').update({ status: 'cancelled' }).in('room_code', roomCodes)
      }

      // Log activity for each
      for (const m of meetings) {
        await logActivity(supabase, 'meeting', m.id, 'cancelled', m.title)
      }

      const summary = meetings.map((m: any) => ({
        id: m.id,
        title: m.title,
        scheduled_at: m.scheduled_at,
        customer: m.customers?.full_name || 'No customer',
        room_url: `https://stu25.com/meet/${m.room_code}`,
      }))

      return ok({ action: 'cancelled', count: cancelledIds.length, cancelled: summary })
    }

    // ─── BOOKINGS (bot can book/cancel/reschedule on behalf of users) ─
    if (path === 'bookings' && req.method === 'GET') {
      const status = params.get('status')
      const guest_email = params.get('guest_email')
      let q = supabase.from('bookings').select('*').order('booking_date', { ascending: true }).limit(100)
      if (status) q = q.eq('status', status)
      if (guest_email) q = q.eq('guest_email', guest_email)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ bookings: data })
    }

    if (path === 'book-meeting' && req.method === 'POST') {
      const bookAction = (body.action as string) || 'book'

      // Cancel via bot
      if (bookAction === 'cancel') {
        const booking_id = body.booking_id as string
        if (!booking_id) return fail('booking_id is required')
        // Proxy to book-meeting edge function
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/book-meeting`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({ action: 'cancel', booking_id }),
        })
        const data = await res.json()
        return ok(data)
      }

      // Reschedule via bot
      if (bookAction === 'reschedule') {
        const { booking_id, new_date, new_time } = body as any
        if (!booking_id || !new_date || !new_time) return fail('booking_id, new_date, new_time required')
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/book-meeting`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({ action: 'reschedule', booking_id, new_date, new_time }),
        })
        const data = await res.json()
        return ok(data)
      }

      // Book via bot
      const { guest_name, guest_email, guest_phone, booking_date, start_time, duration_minutes } = body as any
      if (!guest_name || !guest_email || !booking_date || !start_time) {
        return fail('guest_name, guest_email, booking_date, start_time are required')
      }
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/book-meeting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({
          guest_name, guest_email, guest_phone: guest_phone || null,
          booking_date, start_time, duration_minutes: duration_minutes || 30,
        }),
      })
      const data = await res.json()
      await logActivity(supabase, 'booking', data?.booking?.id || null, 'created', `Booking for ${guest_name}`)
      return ok(data)
    }

    if (path === 'availability' && req.method === 'GET') {
      const { data, error } = await supabase.from('availability_slots').select('*').order('day_of_week')
      if (error) return fail(error.message)
      const DAY_MAP = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
      const enriched = (data || []).map((s: any) => ({ ...s, day_name: DAY_MAP[s.day_of_week] }))
      return ok({ slots: enriched })
    }

    // ─── AVAILABILITY: UPDATE SLOTS ─────────────────────────────
    // POST /availability — Bulk set schedule. Body: { slots: [{ day_of_week, start_time, end_time }] }
    //   Replaces ALL existing slots with the provided set.
    // POST /availability/disable — Disable days. Body: { days: [0-6] } or { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
    // POST /availability/enable  — Enable days.  Body: { days: [0-6] } or { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
    // POST /availability/override — Temporary override for specific dates. Body: { date: "YYYY-MM-DD", start_time?, end_time?, disabled?: bool }
    // DELETE /availability — Delete all slots (nuclear reset)

    if (path === 'availability' && req.method === 'POST') {
      const { slots } = body as { slots: { day_of_week: number; start_time: string; end_time: string }[] }
      if (!slots || !Array.isArray(slots)) return fail('slots array is required')
      // Replace all: deactivate existing, insert new
      await supabase.from('availability_slots').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000')
      const toInsert = slots.map(s => ({ day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time, is_active: true }))
      const { data, error } = await supabase.from('availability_slots').insert(toInsert).select()
      if (error) return fail(error.message)
      await logActivity(supabase, 'availability', null, 'updated', `Schedule replaced with ${slots.length} slot(s)`)
      return ok({ slots: data, replaced: true })
    }

    if (path === 'availability/disable' && req.method === 'POST') {
      const { days, from, to } = body as { days?: number[]; from?: string; to?: string }
      if (days && Array.isArray(days)) {
        // Disable specific days of week
        const { error } = await supabase.from('availability_slots').update({ is_active: false }).in('day_of_week', days)
        if (error) return fail(error.message)
        const DAY_MAP = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
        const dayNames = days.map(d => DAY_MAP[d]).join(', ')
        await logActivity(supabase, 'availability', null, 'disabled', `Disabled: ${dayNames}`)
        return ok({ disabled_days: days, message: `Disabled ${dayNames}` })
      }
      if (from && to) {
        // Disable by date range — find which days of week fall in range and disable
        const start = new Date(from)
        const end = new Date(to)
        const daysToDisable = new Set<number>()
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          daysToDisable.add(d.getDay())
        }
        const dayArr = [...daysToDisable]
        const { error } = await supabase.from('availability_slots').update({ is_active: false }).in('day_of_week', dayArr)
        if (error) return fail(error.message)
        await logActivity(supabase, 'availability', null, 'disabled', `Disabled ${from} to ${to}`)
        return ok({ disabled_days: dayArr, from, to })
      }
      return fail('Provide either days[] or from/to date range')
    }

    if (path === 'availability/enable' && req.method === 'POST') {
      const { days, from, to, start_time, end_time } = body as { days?: number[]; from?: string; to?: string; start_time?: string; end_time?: string }
      const sTime = start_time || '09:00'
      const eTime = end_time || '17:00'
      if (days && Array.isArray(days)) {
        // Re-enable existing or create new slots for these days
        const { data: existing } = await supabase.from('availability_slots').select('day_of_week').in('day_of_week', days)
        const existingDays = new Set((existing || []).map((e: any) => e.day_of_week))
        // Activate existing
        if (existingDays.size > 0) {
          await supabase.from('availability_slots').update({ is_active: true }).in('day_of_week', [...existingDays])
        }
        // Create missing
        const missing = days.filter(d => !existingDays.has(d))
        if (missing.length > 0) {
          await supabase.from('availability_slots').insert(missing.map(d => ({ day_of_week: d, start_time: sTime, end_time: eTime, is_active: true })))
        }
        const DAY_MAP = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
        await logActivity(supabase, 'availability', null, 'enabled', `Enabled: ${days.map(d => DAY_MAP[d]).join(', ')}`)
        return ok({ enabled_days: days })
      }
      if (from && to) {
        const start = new Date(from)
        const end = new Date(to)
        const daysToEnable = new Set<number>()
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          daysToEnable.add(d.getDay())
        }
        const dayArr = [...daysToEnable]
        const { data: existing } = await supabase.from('availability_slots').select('day_of_week').in('day_of_week', dayArr)
        const existingDays = new Set((existing || []).map((e: any) => e.day_of_week))
        if (existingDays.size > 0) {
          await supabase.from('availability_slots').update({ is_active: true }).in('day_of_week', [...existingDays])
        }
        const missing = dayArr.filter(d => !existingDays.has(d))
        if (missing.length > 0) {
          await supabase.from('availability_slots').insert(missing.map(d => ({ day_of_week: d, start_time: sTime, end_time: eTime, is_active: true })))
        }
        await logActivity(supabase, 'availability', null, 'enabled', `Enabled ${from} to ${to}`)
        return ok({ enabled_days: dayArr, from, to })
      }
      return fail('Provide either days[] or from/to date range')
    }

    if (path === 'availability' && req.method === 'DELETE') {
      const { error } = await supabase.from('availability_slots').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (error) return fail(error.message)
      await logActivity(supabase, 'availability', null, 'deleted', 'All availability slots cleared')
      return ok({ message: 'All availability slots deleted' })
    }

    // ─── SMART BOOK (AI-style: resolve customer, find next slot, book) ─
    if (path === 'smart-book' && req.method === 'POST') {
      const { guest_name, guest_email, guest_phone, customer_name, customer_email, duration_minutes: reqDuration, preferred_date, preferred_time, notes: bookNotes } = body as any

      const name = guest_name || customer_name
      const email = guest_email || customer_email
      if (!name) return fail('guest_name (or customer_name) is required')

      // 1. Resolve or create customer
      let customerId: string | null = null
      if (email) {
        const { data: existing } = await supabase.from('customers').select('id, full_name, email').or(`email.eq.${email},full_name.ilike.%${name}%`).limit(1).maybeSingle()
        if (existing) {
          customerId = existing.id
        }
      }
      if (!customerId) {
        const { data: byName } = await supabase.from('customers').select('id').ilike('full_name', `%${name}%`).limit(1).maybeSingle()
        customerId = byName?.id || null
      }
      if (!customerId && email) {
        const { data: created } = await supabase.from('customers').insert({
          full_name: name, email, phone: guest_phone || null, source: 'bot', status: 'lead',
        }).select('id').single()
        customerId = created?.id || null
      }

      // 2. Get availability slots
      const { data: slots } = await supabase.from('availability_slots').select('*').eq('is_active', true).order('day_of_week')

      // 3. Get existing bookings to avoid conflicts
      const { data: existingBookings } = await supabase.from('bookings').select('booking_date, start_time, end_time, status').in('status', ['confirmed', 'pending']).gte('booking_date', new Date().toISOString().split('T')[0]).order('booking_date')

      // 4. Find next available slot
      const duration = (reqDuration as number) || 30
      const today = new Date()
      // If preferred_date provided, start from there; otherwise start from tomorrow
      const startDate = preferred_date ? new Date(`${preferred_date}T00:00:00`) : new Date(today.getTime() + 24 * 60 * 60 * 1000)
      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

      let foundDate: string | null = null
      let foundTime: string | null = null

      for (let d = 0; d < 30; d++) {
        const checkDate = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000)
        const dayOfWeek = checkDate.getDay()
        const dateStr = checkDate.toISOString().split('T')[0]

        // Find availability for this day
        const daySlots = (slots || []).filter((s: any) => s.day_of_week === dayOfWeek)
        if (daySlots.length === 0) continue

        // Check each slot window for an opening
        for (const slot of daySlots) {
          const [sh, sm] = (slot.start_time as string).split(':').map(Number)
          const [eh, em] = (slot.end_time as string).split(':').map(Number)
          const slotStartMin = sh * 60 + sm
          const slotEndMin = eh * 60 + em

          // Try every 30-min increment within this slot
          for (let startMin = slotStartMin; startMin + duration <= slotEndMin; startMin += 30) {
            const tryTime = `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`
            const tryEndMin = startMin + duration
            const tryEnd = `${String(Math.floor(tryEndMin / 60)).padStart(2, '0')}:${String(tryEndMin % 60).padStart(2, '0')}`

            // If preferred_time, try to match it first
            if (preferred_time && d === 0 && tryTime !== preferred_time) continue

            // Check for conflicts with existing bookings
            const hasConflict = (existingBookings || []).some((b: any) => {
              if (b.booking_date !== dateStr) return false
              const [bsh, bsm] = b.start_time.split(':').map(Number)
              const [beh, bem] = b.end_time.split(':').map(Number)
              const bStart = bsh * 60 + bsm
              const bEnd = beh * 60 + bem
              return startMin < bEnd && tryEndMin > bStart
            })

            if (!hasConflict) {
              foundDate = dateStr
              foundTime = tryTime
              break
            }
          }
          if (foundDate) break
        }
        // If preferred_time didn't work on first day, retry without it
        if (!foundDate && preferred_time && d === 0) continue
        if (foundDate) break
      }

      if (!foundDate || !foundTime) {
        return fail('No available slots found in the next 30 days. Please configure availability_slots or adjust the request.')
      }

      // 5. Book the meeting via book-meeting edge function
      const bookRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/book-meeting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({
          guest_name: name,
          guest_email: email || `${name.toLowerCase().replace(/\s+/g, '.')}@pending.stu25.com`,
          guest_phone: guest_phone || null,
          booking_date: foundDate,
          start_time: foundTime,
          duration_minutes: duration,
        }),
      })
      const bookData = await bookRes.json()

      // 6. Link customer to meeting if we have one
      if (customerId && bookData.booking?.meeting_id) {
        await supabase.from('meetings').update({ customer_id: customerId }).eq('id', bookData.booking.meeting_id)
      }

      await logActivity(supabase, 'booking', bookData.booking?.id || null, 'smart_booked', `Smart-booked for ${name}`)

      // Format for bot response
      const fDate = new Date(`${foundDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      const [fh, fm] = foundTime.split(':').map(Number)
      const ampm = fh >= 12 ? 'PM' : 'AM'
      const fTime = `${fh % 12 || 12}:${String(fm).padStart(2, '0')} ${ampm}`

      return ok({
        action: 'smart_booked',
        customer_id: customerId,
        booking: bookData.booking,
        room_url: bookData.room_url,
        manage_url: bookData.booking?.id ? `https://stu25.com/manage-booking/${bookData.booking.id}` : null,
        scheduled: {
          date: foundDate,
          date_formatted: fDate,
          time: foundTime,
          time_formatted: `${fTime} (PST)`,
          duration,
        },
        message: `✅ Meeting booked with ${name} on ${fDate} at ${fTime} PST (${duration} min). Room: ${bookData.room_url}`,
      })
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

    // ─── TRANSCRIPTIONS ─────────────────────────────────────
    if (path === 'transcriptions' && req.method === 'GET') {
      const customer_id = params.get('customer_id')
      const source_type = params.get('source_type')
      let q = supabase.from('transcriptions').select('*, customers(full_name)').order('created_at', { ascending: false }).limit(100)
      if (customer_id) q = q.eq('customer_id', customer_id)
      if (source_type) q = q.eq('source_type', source_type)
      const { data, error } = await q
      if (error) return fail(error.message)
      return ok({ transcriptions: data })
    }

    if (path === 'transcription' && req.method === 'POST') {
      const { id, source_id, source_type, transcript, summary, customer_id, phone_from, phone_to, direction, duration_seconds, audio_url, occurred_at, category } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (transcript !== undefined) updates.transcript = transcript
        if (summary !== undefined) updates.summary = summary
        if (customer_id !== undefined) updates.customer_id = customer_id
        if (category !== undefined) updates.category = category
        const { error } = await supabase.from('transcriptions').update(updates).eq('id', id)
        if (error) return fail(error.message)
        return ok({ action: 'updated', transcription_id: id })
      }
      if (!source_id || !source_type || !transcript) return fail('source_id, source_type, and transcript are required')
      const { data, error } = await supabase.from('transcriptions').insert({
        source_id, source_type, transcript, summary: summary || null,
        customer_id: customer_id || null, phone_from: phone_from || null,
        phone_to: phone_to || null, direction: direction || null,
        duration_seconds: duration_seconds || null, audio_url: audio_url || null,
        occurred_at: occurred_at || null, category: category || null,
      }).select('id').single()
      if (error) return fail(error.message)
      await logActivity(supabase, 'transcription', data?.id, 'created')
      return ok({ action: 'created', transcription_id: data?.id })
    }

    if (path === 'transcription' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('transcriptions').delete().eq('id', id)
      if (error) return fail(error.message)
      return ok({ action: 'deleted', transcription_id: id })
    }

    // ─── CHECKLISTS ──────────────────────────────────────────
    if (path === 'checklists' && req.method === 'GET') {
      const card_id = params.get('card_id')
      if (!card_id) return fail('card_id query param is required')
      const { data, error } = await supabase.from('checklists').select('*, checklist_items(*)').eq('card_id', card_id).order('created_at', { ascending: true })
      if (error) return fail(error.message)
      return ok({ checklists: data })
    }

    if (path === 'checklist' && req.method === 'POST') {
      const { id, card_id, title } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (title) updates.title = title
        const { error } = await supabase.from('checklists').update(updates).eq('id', id)
        if (error) return fail(error.message)
        return ok({ action: 'updated', checklist_id: id })
      }
      if (!card_id) return fail('card_id is required')
      const { data, error } = await supabase.from('checklists').insert({
        card_id, title: title || 'Checklist',
      }).select('id').single()
      if (error) return fail(error.message)
      return ok({ action: 'created', checklist_id: data?.id })
    }

    if (path === 'checklist' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      await supabase.from('checklist_items').delete().eq('checklist_id', id)
      const { error } = await supabase.from('checklists').delete().eq('id', id)
      if (error) return fail(error.message)
      return ok({ action: 'deleted', checklist_id: id })
    }

    // ─── CHECKLIST ITEMS ─────────────────────────────────────
    if (path === 'checklist-item' && req.method === 'POST') {
      const { id, checklist_id, content, is_done, position } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (content !== undefined) updates.content = content
        if (is_done !== undefined) updates.is_done = is_done
        if (position !== undefined) updates.position = position
        const { error } = await supabase.from('checklist_items').update(updates).eq('id', id)
        if (error) return fail(error.message)
        return ok({ action: 'updated', checklist_item_id: id })
      }
      if (!checklist_id || !content) return fail('checklist_id and content are required')
      const { data, error } = await supabase.from('checklist_items').insert({
        checklist_id, content, is_done: is_done || false, position: position || 0,
      }).select('id').single()
      if (error) return fail(error.message)
      return ok({ action: 'created', checklist_item_id: data?.id })
    }

    if (path === 'checklist-item' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('checklist_items').delete().eq('id', id)
      if (error) return fail(error.message)
      return ok({ action: 'deleted', checklist_item_id: id })
    }

    // ─── CARD LABELS (assign/remove) ─────────────────────────
    if (path === 'card-label' && req.method === 'POST') {
      const { card_id, label_id } = body
      if (!card_id || !label_id) return fail('card_id and label_id are required')
      const { error } = await supabase.from('card_labels').insert({ card_id, label_id })
      if (error) return fail(error.message)
      return ok({ action: 'assigned', card_id, label_id })
    }

    if (path === 'card-label' && req.method === 'DELETE') {
      const { card_id, label_id } = body
      if (!card_id || !label_id) return fail('card_id and label_id are required')
      const { error } = await supabase.from('card_labels').delete().eq('card_id', card_id).eq('label_id', label_id)
      if (error) return fail(error.message)
      return ok({ action: 'removed', card_id, label_id })
    }

    // ─── LIST (delete) ───────────────────────────────────────
    if (path === 'list' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      await supabase.from('cards').delete().eq('list_id', id)
      const { error } = await supabase.from('lists').delete().eq('id', id)
      if (error) return fail(error.message)
      return ok({ action: 'deleted', list_id: id })
    }



    // ─── CUSTOMER SEARCH ─────────────────────────────────────
    if (path === 'search' && req.method === 'GET') {
      const q = params.get('q')
      if (!q) return fail('q query param is required')
      const { data, error } = await supabase.from('customers').select('*')
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,company.ilike.%${q}%`)
        .order('created_at', { ascending: false }).limit(50)
      if (error) return fail(error.message)
      return ok({ customers: data })
    }

    // ─── UPLOAD TOKENS (Custom-U portal) ─────────────────────
    if (path === 'upload-token' && req.method === 'POST') {
      const { customer_id } = body
      if (!customer_id) return fail('customer_id is required')
      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      const { error } = await supabase.from('customers').update({ upload_token: token }).eq('id', customer_id)
      if (error) return fail(error.message)
      return ok({ action: 'generated', customer_id, upload_token: token, portal_url: `https://stu25.com/u/${token}` })
    }

    if (path === 'upload-token' && req.method === 'DELETE') {
      const { customer_id } = body
      if (!customer_id) return fail('customer_id is required')
      const { error } = await supabase.from('customers').update({ upload_token: null }).eq('id', customer_id)
      if (error) return fail(error.message)
      return ok({ action: 'revoked', customer_id })
    }

    // ─── AVAILABILITY SLOTS ─────────────────────────────────
    if (path === 'availability' && req.method === 'GET') {
      const { data, error } = await supabase
        .from('availability_slots')
        .select('*')
        .order('day_of_week', { ascending: true })
      if (error) return fail(error.message, 500)
      return ok(data)
    }

    if (path === 'availability' && req.method === 'POST') {
      // Accepts { slots: [{ day_of_week, start_time, end_time, is_active }] }
      // Or single: { day_of_week, start_time, end_time, is_active }
      const slots = body.slots || [body]
      
      // Validate
      for (const s of slots) {
        if (s.day_of_week === undefined || s.start_time === undefined || s.end_time === undefined) {
          return fail('Each slot requires day_of_week (0-6), start_time, end_time')
        }
      }

      // If body.replace_all is true, delete existing slots first
      if (body.replace_all) {
        const { error: delErr } = await supabase.from('availability_slots').delete().gte('id', '00000000-0000-0000-0000-000000000000')
        if (delErr) return fail(delErr.message, 500)
      }

      const toInsert = slots.map((s: any) => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        is_active: s.is_active !== undefined ? s.is_active : true,
      }))

      const { data, error } = await supabase.from('availability_slots').insert(toInsert).select()
      if (error) return fail(error.message, 500)
      await logActivity(supabase, 'availability', null, 'updated', 'Availability schedule')
      if (isBot) await auditLog(supabase, 'availability', { slots: toInsert })
      return ok({ action: 'availability_set', slots: data })
    }

    if (path === 'availability' && req.method === 'DELETE') {
      const { id, day_of_week } = body
      if (id) {
        const { error } = await supabase.from('availability_slots').delete().eq('id', id)
        if (error) return fail(error.message, 500)
      } else if (day_of_week !== undefined) {
        const { error } = await supabase.from('availability_slots').delete().eq('day_of_week', day_of_week)
        if (error) return fail(error.message, 500)
      } else {
        return fail('Provide id or day_of_week to delete')
      }
      return ok({ action: 'availability_deleted' })
    }

    // ─── SEND PORTAL LINK (Custom-U) ─────────────────────────
    if (path === 'send-portal-link' && req.method === 'POST') {
      const { customer_id } = body
      if (!customer_id) return fail('customer_id is required')

      // Fetch customer
      const { data: cust, error: custErr } = await supabase
        .from('customers')
        .select('id, full_name, email, upload_token')
        .eq('id', customer_id)
        .maybeSingle()
      if (custErr) return fail(custErr.message, 500)
      if (!cust) return fail('Customer not found', 404)

      const recipientEmail = cust.email
      if (!recipientEmail) return fail('Customer has no email address on file. Add an email first.', 400)

      // Generate token if customer doesn't have one yet
      let token = cust.upload_token
      if (!token) {
        token = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
        const { error: tokErr } = await supabase.from('customers').update({ upload_token: token }).eq('id', customer_id)
        if (tokErr) return fail(tokErr.message, 500)
      }

      const portalUrl = `https://stu25.com/u/${token}`
      const customerFirst = cust.full_name.split(' ')[0]

      // Build a clean HTML email
      const emailBody = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="color:#111;margin-bottom:8px;">Your Upload Portal Is Ready</h2>
  <p style="color:#333;font-size:15px;line-height:1.6;">
    Hi ${customerFirst},
  </p>
  <p style="color:#333;font-size:15px;line-height:1.6;">
    We've created a personal upload portal just for you. You can use this link anytime to send us photos, videos, documents, or any other media files you'd like us to work with.
  </p>
  <p style="text-align:center;margin:28px 0;">
    <a href="${portalUrl}" style="background-color:#111;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
      Open Your Upload Portal
    </a>
  </p>
  <p style="color:#333;font-size:15px;line-height:1.6;">
    <strong>Please bookmark or save this link</strong> — it will be your main portal for sharing media with us throughout our business journey together.
  </p>
  <p style="color:#888;font-size:13px;margin-top:24px;">
    Direct link: <a href="${portalUrl}" style="color:#2563eb;">${portalUrl}</a>
  </p>
</div>`

      // Send via gmail-api proxy
      const baseUrl = Deno.env.get('SUPABASE_URL')
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      const gmailRes = await fetch(`${baseUrl}/functions/v1/gmail-api?action=send`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmail,
          subject: `Your Personal Upload Portal — ${cust.full_name}`,
          body: emailBody,
        }),
      })

      const gmailData = await gmailRes.json()
      if (!gmailRes.ok) return fail(gmailData.error || 'Failed to send portal email', gmailRes.status)

      await logActivity(supabase, 'custom-u', customer_id as string, 'portal_link_sent', cust.full_name)
      if (isBot) await auditLog(supabase, 'send-portal-link', { customer_id, email: recipientEmail })

      return ok({
        action: 'portal_link_sent',
        customer_id,
        customer_name: cust.full_name,
        email: recipientEmail,
        portal_url: portalUrl,
        token_generated: !cust.upload_token,
      })
    }

    // ─── LABEL (update/delete) ───────────────────────────────
    if (path === 'label' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      await supabase.from('card_labels').delete().eq('label_id', id)
      const { error } = await supabase.from('labels').delete().eq('id', id)
      if (error) return fail(error.message)
      return ok({ action: 'deleted', label_id: id })
    }

    // ─── COMMENTS (list/delete) ──────────────────────────────
    if (path === 'comments' && req.method === 'GET') {
      const card_id = params.get('card_id')
      if (!card_id) return fail('card_id query param is required')
      const { data, error } = await supabase.from('card_comments').select('*, profiles(full_name)').eq('card_id', card_id).order('created_at', { ascending: true })
      if (error) return fail(error.message)
      return ok({ comments: data })
    }

    if (path === 'comment' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('card_comments').delete().eq('id', id)
      if (error) return fail(error.message)
      return ok({ action: 'deleted', comment_id: id })
    }

    // ─── ATTACHMENTS (list/delete) ───────────────────────────
    if (path === 'attachments' && req.method === 'GET') {
      const card_id = params.get('card_id')
      if (!card_id) return fail('card_id query param is required')
      const { data, error } = await supabase.from('card_attachments').select('*').eq('card_id', card_id).order('created_at', { ascending: true })
      if (error) return fail(error.message)
      return ok({ attachments: data })
    }

    if (path === 'attach' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('card_attachments').delete().eq('id', id)
      if (error) return fail(error.message)
      return ok({ action: 'deleted', attachment_id: id })
    }

    // ─── EMAIL (proxy to gmail-api) ─────────────────────────
    if (path === 'email' && req.method === 'GET') {
      const action = params.get('action') || 'inbox'
      const msgId = params.get('id')
      const baseUrl = Deno.env.get('SUPABASE_URL')
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      let gmailUrl = `${baseUrl}/functions/v1/gmail-api?action=${action}`
      if (msgId) gmailUrl += `&id=${msgId}`
      const gmailRes = await fetch(gmailUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      })
      const gmailData = await gmailRes.json()
      if (!gmailRes.ok) return fail(gmailData.error || 'Gmail API error', gmailRes.status)
      if (isBot) await auditLog(supabase, 'email-read', { action, id: msgId })
      return ok(gmailData)
    }

    if (path === 'email' && req.method === 'POST') {
      const { to, subject, body: emailBody, action: emailAction } = body
      const act = emailAction || 'send'
      if (act === 'send' && (!to || !subject)) return fail('to and subject are required')
      const baseUrl = Deno.env.get('SUPABASE_URL')
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      const gmailUrl = `${baseUrl}/functions/v1/gmail-api?action=${act}`
      const gmailRes = await fetch(gmailUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body: emailBody }),
      })
      const gmailData = await gmailRes.json()
      if (!gmailRes.ok) return fail(gmailData.error || 'Gmail send error', gmailRes.status)
      if (isBot) await auditLog(supabase, 'email-send', { to, subject, action: act })
      await logActivity(supabase, 'email', null, act === 'save-draft' ? 'draft_saved' : 'sent', `Email to ${to}`)
      return ok(gmailData)
    }

    // ─── V0 DESIGNER (proxy to v0-designer function) ────────
    if ((path === 'generate-website' || path === 'edit-website' || path === 'v0-designer') && req.method === 'POST') {
      const { prompt, customer_id, category, chat_id } = body
      if (!prompt) return fail('prompt is required')

      const isEdit = !!chat_id
      const actionLabel = isEdit ? 'Web Design Edit' : 'Web Design'

      // Create a bot_task for tracking
      const { data: task } = await supabase.from('bot_tasks').insert({
        title: `${actionLabel}: ${(prompt as string).substring(0, 80)}`,
        bot_agent: 'web-designer',
        status: 'queued',
        priority: 'high',
        customer_id: customer_id || null,
        meta: { prompt, assigned_by: 'clawd-main', ...(chat_id ? { chat_id } : {}) },
      }).select('id').single()

      // Call v0-designer edge function
      const baseUrl = Deno.env.get('SUPABASE_URL')
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      const v0Res = await fetch(`${baseUrl}/functions/v1/v0-designer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'x-internal': 'true',
        },
        body: JSON.stringify({
          prompt,
          customer_id: customer_id || null,
          category: category || 'digital-services',
          bot_task_id: task?.id,
          ...(chat_id ? { chat_id } : {}),
        }),
      })

      const v0Data = await v0Res.json()
      if (!v0Res.ok) return fail(v0Data.error || 'V0 Designer error', v0Res.status)
      if (isBot) await auditLog(supabase, isEdit ? 'edit-website' : 'generate-website', { prompt, customer_id, chat_id })
      await logActivity(supabase, 'bot_task', task?.id || null, isEdit ? 'v0_design_edit_requested' : 'v0_design_requested', `${actionLabel}: ${(prompt as string).substring(0, 80)}`)
      return ok(v0Data.data || v0Data)
    }

    // ─── SITE CONFIGS (write/delete — read is public, handled above auth) ─

    if (path === 'site-config' && req.method === 'POST') {
      const { site_id, section, content, customer_id, is_published } = body
      if (!site_id || !section) return fail('site_id and section are required')
      // Upsert by site_id + section
      const { data: existing } = await supabase.from('site_configs').select('id, version').eq('site_id', site_id).eq('section', section).maybeSingle()
      let result
      if (existing) {
        const { data, error } = await supabase.from('site_configs').update({
          content: content || {},
          is_published: is_published ?? true,
          version: existing.version + 1,
          ...(customer_id ? { customer_id } : {}),
        }).eq('id', existing.id).select().single()
        if (error) return fail(error.message, 500)
        result = data
      } else {
        const { data, error } = await supabase.from('site_configs').insert({
          site_id, section,
          content: content || {},
          customer_id: customer_id || null,
          is_published: is_published ?? true,
        }).select().single()
        if (error) return fail(error.message, 500)
        result = data
      }
      if (isBot) await auditLog(supabase, 'site-config', { site_id, section })
      return ok(result)
    }

    if (path === 'site-config' && req.method === 'DELETE') {
      const { id, site_id, section } = body
      if (id) {
        const { error } = await supabase.from('site_configs').delete().eq('id', id)
        if (error) return fail(error.message, 500)
      } else if (site_id && section) {
        const { error } = await supabase.from('site_configs').delete().eq('site_id', site_id).eq('section', section)
        if (error) return fail(error.message, 500)
      } else {
        return fail('id or (site_id + section) required')
      }
      if (isBot) await auditLog(supabase, 'site-config-delete', { id, site_id, section })
      return ok({ deleted: true })
    }

    // ─── PUBLISH WEBSITE (deploy v0 chat to Vercel production) ─
    if (path === 'publish-website' && req.method === 'POST') {
      const { chat_id } = body
      if (!chat_id) return fail('chat_id is required')

      const v0Key = Deno.env.get('V0_API_KEY')
      if (!v0Key) return fail('V0_API_KEY not configured', 500)

      // Step 1: Get chat details to find projectId and latest versionId
      const chatRes = await fetch(`https://api.v0.dev/v1/chats/${chat_id}`, {
        headers: { 'Authorization': `Bearer ${v0Key}` },
      })
      if (!chatRes.ok) {
        const errText = await chatRes.text()
        return fail(`Failed to fetch chat: ${chatRes.status} ${errText}`, 502)
      }
      const chatData = await chatRes.json()
      const projectId = chatData.projectId
      const versionId = chatData.latestVersion?.id
      if (!projectId || !versionId) {
        return fail(`Chat missing projectId or versionId. projectId=${projectId}, versionId=${versionId}`, 400)
      }

      // Step 2: Create deployment
      const deployRes = await fetch(`https://api.v0.dev/v1/deployments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${v0Key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId, chatId: chat_id, versionId }),
      })

      if (!deployRes.ok) {
        const errText = await deployRes.text()
        return fail(`Deployment failed: ${deployRes.status} ${errText}`, 502)
      }

      const deployData = await deployRes.json()
      console.log(`[clawd-bot] Published website: ${JSON.stringify(deployData)}`)

      // Step 3: Update api_previews with production URL
      const prodUrl = deployData.webUrl || deployData.apiUrl || null
      if (prodUrl) {
        await supabase.from('api_previews')
          .update({ preview_url: prodUrl, status: 'published', meta: { chat_id, deployment_id: deployData.id, inspector_url: deployData.inspectorUrl } })
          .eq('source', 'v0-designer')
          .filter('meta->>chat_id', 'eq', chat_id)
      }

      if (isBot) await auditLog(supabase, 'publish-website', { chat_id, deployment_id: deployData.id })
      await logActivity(supabase, 'api_preview', null, 'v0_design_published', `Published: chat ${chat_id}`)

      return ok({
        deployment_id: deployData.id,
        web_url: deployData.webUrl,
        inspector_url: deployData.inspectorUrl,
        chat_id,
        project_id: projectId,
        version_id: versionId,
      })
    }

    if (path === 'previews' && req.method === 'GET') {
      const customer_id = params.get('customer_id')
      const source = params.get('source')
      let q = supabase.from('api_previews').select('*, customers(full_name, email)').order('created_at', { ascending: false }).limit(100)
      if (customer_id) q = q.eq('customer_id', customer_id)
      if (source) q = q.eq('source', source)
      const { data, error } = await q
      if (error) return fail(error.message, 500)
      return ok({ previews: data })
    }

    // ─── LEARN (trigger cortex learning loop) ──────────────
    if (path === 'learn' && req.method === 'POST') {
      const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/cortex-learn`
      const learnRes = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bot-secret': Deno.env.get('BOT_SECRET') || '',
        },
      })
      const learnData = await learnRes.json()
      return ok(learnData.data || learnData, learnRes.status >= 400 ? learnRes.status : 200)
    }

    // ─── SCHEDULE EMAILS ──────────────────────────────────────
    if (path === 'schedule-emails' && req.method === 'POST') {
      const { to, subject, body_template, start_at, interval_minutes, count, customer_id } = body as any
      if (!to || !subject || !body_template || !count) {
        return fail('to, subject, body_template, and count are required')
      }
      const startTime = start_at ? new Date(start_at as string) : new Date()
      const interval = Number(interval_minutes) || 60
      const totalCount = Math.min(Number(count), 50) // cap at 50

      // Resolve customer if not provided
      let resolvedCustomerId = customer_id || null
      if (!resolvedCustomerId && to) {
        const { data: cust } = await supabase.from('customers').select('id').eq('email', to).maybeSingle()
        resolvedCustomerId = cust?.id || null
      }

      const events = []
      for (let i = 0; i < totalCount; i++) {
        const sendAt = new Date(startTime.getTime() + i * interval * 60 * 1000)
        
        // Allow body_template to be an array (different body per email) or a single string
        const emailBody = Array.isArray(body_template) 
          ? (body_template[i] || body_template[body_template.length - 1])
          : body_template

        const emailMeta = JSON.stringify({ to, subject, body: emailBody })

        events.push({
          title: `📧 Scheduled: ${subject}`,
          description: emailMeta,
          start_time: sendAt.toISOString(),
          end_time: new Date(sendAt.getTime() + 5 * 60 * 1000).toISOString(),
          source: 'scheduled-email',
          color: '#scheduled',
          category: 'email',
          customer_id: resolvedCustomerId,
          source_id: `sched-${Date.now()}-${i}`,
        })
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('calendar_events')
        .insert(events)
        .select('id, start_time')
      
      if (insertErr) return fail(insertErr.message)

      await logActivity(supabase, 'scheduled-email', null, 'created', `${totalCount} emails to ${to}`)

      return ok({
        action: 'scheduled',
        total: totalCount,
        to,
        subject,
        interval_minutes: interval,
        first_send: events[0]?.start_time,
        last_send: events[events.length - 1]?.start_time,
        event_ids: inserted?.map((e: any) => e.id) || [],
      })
    }

    // ─── SCHEDULED EMAILS LIST ──────────────────────────────
    if (path === 'scheduled-emails' && req.method === 'GET') {
      const status = params.get('status') // 'pending' or 'sent'
      let q = supabase.from('calendar_events').select('*')
        .eq('source', 'scheduled-email')
        .order('start_time', { ascending: true })
        .limit(100)
      if (status === 'sent') q = q.eq('color', '#sent')
      if (status === 'pending') q = q.neq('color', '#sent')
      const { data, error } = await q
      if (error) return fail(error.message)
      
      const emails = (data || []).map((e: any) => {
        let meta = {}
        try { meta = JSON.parse(e.description || '{}') } catch {}
        return {
          id: e.id,
          ...meta,
          scheduled_for: e.start_time,
          status: e.color === '#sent' ? 'sent' : 'pending',
          customer_id: e.customer_id,
        }
      })
      return ok({ scheduled_emails: emails })
    }

    // ─── CANCEL SCHEDULED EMAILS ────────────────────────────
    if (path === 'cancel-scheduled-emails' && req.method === 'POST') {
      const { event_ids, cancel_all_for } = body as any
      if (event_ids && Array.isArray(event_ids)) {
        const { error } = await supabase.from('calendar_events')
          .delete()
          .in('id', event_ids)
          .eq('source', 'scheduled-email')
          .neq('color', '#sent')
        if (error) return fail(error.message)
        return ok({ action: 'cancelled', count: event_ids.length })
      }
      if (cancel_all_for) {
        // Cancel all pending for a given email address
        const { data: pending } = await supabase.from('calendar_events')
          .select('id, description')
          .eq('source', 'scheduled-email')
          .neq('color', '#sent')
        const toDelete = (pending || []).filter((e: any) => {
          try { return JSON.parse(e.description).to === cancel_all_for } catch { return false }
        }).map((e: any) => e.id)
        if (toDelete.length > 0) {
          await supabase.from('calendar_events').delete().in('id', toDelete)
        }
        return ok({ action: 'cancelled', count: toDelete.length, email: cancel_all_for })
      }
      return fail('event_ids array or cancel_all_for email required')
    }

    // ─── DELETE CALENDAR EVENT ────────────────────────────
    if (path === 'calendar-event' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return fail('id is required')
      const { error } = await supabase.from('calendar_events').delete().eq('id', id)
      if (error) return fail(error.message)
      await logActivity(supabase, 'calendar_event', id, 'deleted')
      return ok({ action: 'deleted', event_id: id })
    }

    // ─── STATE (full overview) ───────────────────────────────
    if (path === 'state' && req.method === 'GET') {
      const [boards, customers, deals, projects, meetings, templates, content, transcriptions, botTasks, apiPreviews, soulConfig] = await Promise.all([
        supabase.from('boards').select('id, name, lists:lists(id, name, position, cards:cards(id, title, status, priority, position, source))').order('created_at', { ascending: true }),
        supabase.from('customers').select('id, full_name, status, email, phone, category, upload_token').order('created_at', { ascending: false }).limit(50),
        supabase.from('deals').select('id, title, stage, deal_value, status, category').order('created_at', { ascending: false }).limit(50),
        supabase.from('projects').select('id, title, status, priority, category').order('created_at', { ascending: false }).limit(50),
        supabase.from('meetings').select('id, title, room_code, status, scheduled_at, category').order('created_at', { ascending: false }).limit(50),
        supabase.from('templates').select('id, name, type, category, placeholders').order('created_at', { ascending: false }).limit(50),
        supabase.from('content_assets').select('id, title, type, status, source, category, customer_id, folder, url').order('created_at', { ascending: false }).limit(100),
        supabase.from('transcriptions').select('id, source_type, customer_id, summary, direction, created_at').order('created_at', { ascending: false }).limit(50),
        supabase.from('bot_tasks').select('id, title, bot_agent, status, priority, created_at').order('created_at', { ascending: false }).limit(50),
        supabase.from('api_previews').select('id, title, source, status, customer_id, preview_url, edit_url, created_at').order('created_at', { ascending: false }).limit(50),
        supabase.from('site_configs').select('content').eq('site_id', 'cortex').eq('section', 'soul').single(),
      ])
      const soul = soulConfig.data?.content || null
      return ok({ boards: boards.data, customers: customers.data, deals: deals.data, projects: projects.data, meetings: meetings.data, templates: templates.data, content: content.data, transcriptions: transcriptions.data, bot_tasks: botTasks.data, api_previews: apiPreviews.data, soul })
    }

    // ─── CONTENT GENERATION: Route to Nano Banana or Higgsfield ───
    if (path === 'generate-content' && req.method === 'POST') {
      const promptLower = ((body.prompt as string) || '').toLowerCase()
      const explicitProvider = ((body.provider as string) || '').toLowerCase()
      const useNanoBanana = explicitProvider === 'nano-banana' || /nano[\s\-_]*banana|nano\b|\bbanana\b/i.test(promptLower)

      if (useNanoBanana) {
        // Route to Nano Banana (Gemini image generation)
        const nbUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/nano-banana/generate`
        const nbRes = await fetch(nbUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-bot-secret': Deno.env.get('BOT_SECRET') || '',
          },
          body: JSON.stringify(body),
        })
        const nbData = await nbRes.json()
        if (!nbRes.ok) return fail(nbData.error || 'Nano Banana generation failed', nbRes.status)
        await logActivity(supabase, 'content_asset', nbData.data?.bot_task_id || null, 'nano_banana_generate', body.prompt ? (body.prompt as string).substring(0, 80) : 'Content generation')
        return ok(nbData.data)
      }

      // Default: Higgsfield (BLOCKED if nano/banana keywords detected)
      // Double-check: if nano/banana keywords somehow reach here, reject
      const recheckNano = /nano|banana/i.test(((body.prompt as string) || ''))
      if (recheckNano) return fail('🍌 This prompt contains nano/banana keywords. Routed to Nano Banana — not Higgsfield. Please retry.', 400)

      const hfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/higgsfield-api/generate`
      const hfRes = await fetch(hfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bot-secret': Deno.env.get('BOT_SECRET') || '',
        },
        body: JSON.stringify(body),
      })
      const hfData = await hfRes.json()
      if (!hfRes.ok) return fail(hfData.error || 'Higgsfield generation failed', hfRes.status)
      await logActivity(supabase, 'content_asset', hfData.data?.bot_task_id || null, 'higgsfield_generate', body.prompt ? (body.prompt as string).substring(0, 80) : 'Content generation')
      return ok(hfData.data)
    }

    if (path === 'poll-content' && req.method === 'POST') {
      const hfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/higgsfield-api/poll`
      const hfRes = await fetch(hfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bot-secret': Deno.env.get('BOT_SECRET') || '',
        },
        body: JSON.stringify(body),
      })
      const hfData = await hfRes.json()
      return ok(hfData.data)
    }

    if (path === 'cancel-content' && req.method === 'POST') {
      const hfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/higgsfield-api/cancel`
      const hfRes = await fetch(hfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bot-secret': Deno.env.get('BOT_SECRET') || '',
        },
        body: JSON.stringify(body),
      })
      const hfData = await hfRes.json()
      return ok(hfData.data)
    }

    // ─── STORE TELEGRAM FILE (download from TG API → Supabase storage → content_asset) ─
    if (path === 'store-telegram-file' && req.method === 'POST') {
      const { file_id, file_url, title, type, customer_id, category, content_id } = body
      const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
      if (!TELEGRAM_BOT_TOKEN) return fail('TELEGRAM_BOT_TOKEN not configured', 500)

      let downloadUrl = file_url as string | undefined

      // If file_id provided, resolve download URL via Telegram Bot API
      if (!downloadUrl && file_id) {
        const fileInfoRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${file_id}`)
        const fileInfo = await fileInfoRes.json()
        if (!fileInfo.ok || !fileInfo.result?.file_path) return fail('Could not resolve Telegram file: ' + JSON.stringify(fileInfo), 400)
        downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`
      }

      if (!downloadUrl) return fail('Either file_id or file_url is required')

      // Download the file
      const fileRes = await fetch(downloadUrl)
      if (!fileRes.ok) return fail(`Failed to download file: ${fileRes.status}`)
      const blob = await fileRes.blob()
      const contentType = fileRes.headers.get('content-type') || 'application/octet-stream'

      // Determine extension from content type or file path
      const extMap: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg' }
      const ext = extMap[contentType] || 'bin'
      const safeTitle = ((title as string) || 'telegram-file').replace(/[^a-zA-Z0-9-_ ]/g, '').substring(0, 80)
      const timestamp = Date.now()
      const storagePath = `telegram/${safeTitle}/${timestamp}.${ext}`

      // Upload to Supabase storage
      const { error: uploadErr } = await supabase.storage.from('content-uploads').upload(storagePath, blob, {
        contentType,
        cacheControl: '3600',
        upsert: false,
      })
      if (uploadErr) return fail(`Storage upload failed: ${uploadErr.message}`, 500)

      const { data: urlData } = supabase.storage.from('content-uploads').getPublicUrl(storagePath)
      const publicUrl = urlData.publicUrl

      // Detect type if not provided
      let assetType = type as string || 'image'
      if (!type) {
        if (contentType.startsWith('image/')) assetType = 'image'
        else if (contentType.startsWith('video/')) assetType = 'video'
        else if (contentType.startsWith('audio/')) assetType = 'audio'
        else assetType = 'doc'
      }

      // Update existing content_asset or create new one
      if (content_id) {
        const { error } = await supabase.from('content_assets').update({ url: publicUrl }).eq('id', content_id)
        if (error) return fail(error.message, 500)
        return ok({ action: 'updated', content_id, url: publicUrl })
      }

      const { data: newAsset, error: insertErr } = await supabase.from('content_assets').insert({
        title: title || 'Telegram File',
        type: assetType,
        status: 'published',
        url: publicUrl,
        folder: 'telegram',
        source: 'telegram',
        category: normalizeCategory(category) || 'telegram',
        customer_id: customer_id || null,
      }).select('id').single()
      if (insertErr) return fail(insertErr.message, 500)

      await logActivity(supabase, 'content', newAsset?.id, 'created', title as string || 'Telegram File')
      return ok({ action: 'created', content_id: newAsset?.id, url: publicUrl, type: assetType })
    }

    // ─── SOURCE-ASSET: Resolve Telegram content to signed URL ──
    if (path === 'source-asset') {
      if (req.method === 'GET') {
        const search = params.get('search') || ''
        const asset_id = params.get('id')
        const limit = Math.min(parseInt(params.get('limit') || '10'), 50)

        let query = supabase
          .from('content_assets')
          .select('id, title, type, url, folder, customer_id, source, created_at')
          .in('source', ['telegram', 'dashboard'])
          .eq('status', 'published')
          .order('created_at', { ascending: false })

        if (asset_id) {
          query = query.eq('id', asset_id)
        } else if (search) {
          query = query.ilike('title', `%${search}%`)
        }

        const { data: assets, error: assetsErr } = await query.limit(limit)
        if (assetsErr) return fail(assetsErr.message, 500)
        if (!assets || assets.length === 0) return fail('No matching source assets found', 404)

        // Return assets with their public URLs ready for Higgsfield/Gmail
        const results = assets.map((a: any) => ({
          id: a.id,
          title: a.title,
          type: a.type,
          url: a.url,
          folder: a.folder,
          source: a.source,
          customer_id: a.customer_id,
          created_at: a.created_at,
        }))

        await auditLog(supabase, 'source-asset:search', { search, asset_id, results_count: results.length })
        return ok(results)
      }
      return fail('Method not allowed', 405)
    }

    // ─── SMM: Upload-Post API proxy with bot_task tracking ────
    if (path === 'smm-post' && req.method === 'POST') {
      let { user, type, platforms, title, description, first_comment, media_url, scheduled_date, add_to_queue, timezone, platform_overrides, customer_id, customer_name } = body as any
      if (!user) return fail('user (profile username or @handle) is required')
      if (!platforms || !Array.isArray(platforms) || platforms.length === 0) return fail('platforms[] is required')
      if (!title) return fail('title is required')

      // Strip leading @ if present
      user = user.replace(/^@/, '')

      // Resolve social handle → Upload-Post profile username
      // The "user" field might be a social handle (e.g. "w4rr3n") rather than the Upload-Post profile username (e.g. "STU25")
      // We query the profiles list and check if any profile's connected accounts match the handle
      try {
        const projectUrl = Deno.env.get('SUPABASE_URL')!
        const profilesRes = await fetch(`${projectUrl}/functions/v1/smm-api?action=list-profiles`, {
          headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        })
        if (profilesRes.ok) {
          const profilesData = await profilesRes.json()
          const profilesList = profilesData?.profiles || profilesData?.users || (Array.isArray(profilesData) ? profilesData : [])
          
          // Check if user exactly matches a profile username (case-insensitive)
          const directMatch = profilesList.find((p: any) => 
            (p.username || p.id || '').toLowerCase() === user.toLowerCase()
          )
          
          if (!directMatch) {
            // User might be a social handle — search connected accounts
            for (const profile of profilesList) {
              const accounts = profile.accounts || profile.social_accounts || profile.connected_accounts || []
              const platforms_list = profile.platforms || []
              
              // Check account usernames/handles
              const handleMatch = accounts.some((acc: any) => {
                const accHandle = (acc.username || acc.handle || acc.name || '').toLowerCase().replace(/^@/, '')
                return accHandle === user.toLowerCase()
              }) || platforms_list.some((pl: any) => {
                const plHandle = (pl.username || pl.handle || pl.name || '').toLowerCase().replace(/^@/, '')
                return plHandle === user.toLowerCase()
              })
              
              if (handleMatch) {
                const resolvedUser = profile.username || profile.id
                console.log(`[smm-post] Resolved social handle @${user} → profile username "${resolvedUser}"`)
                user = resolvedUser
                break
              }
            }
          }
        }
      } catch (e: any) {
        console.warn(`[smm-post] Profile resolution failed, using "${user}" as-is:`, e.message)
      }

      const postType = type || 'text'
      const action = postType === 'video' ? 'upload-video'
        : postType === 'photos' ? 'upload-photos'
        : postType === 'document' ? 'upload-document'
        : 'upload-text'

      // Create bot_task for tracking
      const taskTitle = `📱 ${title.substring(0, 60)}${title.length > 60 ? '...' : ''}`
      const { data: botTask } = await supabase.from('bot_tasks').insert({
        title: taskTitle,
        description: description || title,
        bot_agent: 'social-media',
        priority: 'medium',
        status: 'queued',
        customer_id: customer_id || null,
        meta: { type: postType, platforms, user, customer_name: customer_name || null, action, scheduled: !!scheduled_date, queued: !!add_to_queue },
      }).select('id').single()

      // Build payload for smm-api edge function
      const smmBody: Record<string, any> = { user, title }
      platforms.forEach((p: string) => {
        if (!smmBody['platform[]']) smmBody['platform[]'] = []
        if (Array.isArray(smmBody['platform[]'])) smmBody['platform[]'].push(p)
      })
      if (description) smmBody.description = description
      if (first_comment) smmBody.first_comment = first_comment
      if (scheduled_date) smmBody.scheduled_date = scheduled_date
      if (add_to_queue) smmBody.add_to_queue = true
      if (timezone) smmBody.timezone = timezone
      if (media_url) {
        if (postType === 'video') smmBody.video = media_url
        else if (postType === 'document') smmBody.document = media_url
      }
      if (platform_overrides) {
        Object.entries(platform_overrides).forEach(([platform, overrides]: [string, any]) => {
          if (overrides.title) smmBody[`${platform}_title`] = overrides.title
          if (overrides.first_comment) smmBody[`${platform}_first_comment`] = overrides.first_comment
        })
      }
      if (!scheduled_date && !add_to_queue) smmBody.async_upload = true

      // Call smm-api edge function
      try {
        const projectUrl = Deno.env.get('SUPABASE_URL')!
        const smmRes = await fetch(`${projectUrl}/functions/v1/smm-api?action=${action}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify(smmBody),
        })
        const smmData = await smmRes.json()
        console.log(`[smm-post] API response status=${smmRes.status}:`, JSON.stringify(smmData).substring(0, 500))

        if (!smmRes.ok) {
          if (botTask?.id) await supabase.from('bot_tasks').update({ status: 'failed', meta: { error: smmData } }).eq('id', botTask.id)
          // Notify Telegram about the failure
          try {
            const tgProjectUrl = Deno.env.get('SUPABASE_URL')!
            await fetch(`${tgProjectUrl}/functions/v1/telegram-notify`, {
              method: 'POST',
              headers: {
                'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                entity_type: 'smm',
                action: 'failed',
                meta: {
                  message: `❌ *SMM Post Failed*\nProfile: *${user}*\nPlatforms: ${platforms.join(', ')}\nError: ${JSON.stringify(smmData).substring(0, 200)}`,
                },
                created_at: new Date().toISOString(),
              }),
            })
          } catch (tgErr) { console.error('[smm-post] telegram fail notify error:', tgErr) }
          return fail(`Upload-Post API error: ${JSON.stringify(smmData)}`, 502)
        }

        // Update task with result
        if (botTask?.id) {
          await supabase.from('bot_tasks').update({
            status: scheduled_date || add_to_queue ? 'queued' : 'in_progress',
            meta: { type: postType, platforms, user, customer_name: customer_name || null, request_id: smmData.request_id, job_id: smmData.job_id, response: smmData },
          }).eq('id', botTask.id)
        }

        await logActivity(supabase, 'bot_task', botTask?.id, 'smm_post_created', taskTitle)

        // Explicit Telegram notification on successful post
        try {
          const statusLabel = scheduled_date ? '🕐 Scheduled' : add_to_queue ? '📥 Queued' : '🚀 Posted'
          const reqId = smmData.request_id ? `\nRequest ID: \`${smmData.request_id}\`` : ''
          const jobId = smmData.job_id ? `\nJob ID: \`${smmData.job_id}\`` : ''
          const tgProjectUrl = Deno.env.get('SUPABASE_URL')!
          await fetch(`${tgProjectUrl}/functions/v1/telegram-notify`, {
            method: 'POST',
            headers: {
              'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              entity_type: 'smm',
              action: 'created',
              meta: {
                message: `📱 *SMM ${statusLabel}*\nProfile: *${user}*\nPlatforms: *${platforms.join(', ')}*\n📝 ${title.substring(0, 100)}${reqId}${jobId}`,
              },
              created_at: new Date().toISOString(),
            }),
          })
        } catch (tgErr) { console.error('[smm-post] telegram success notify error:', tgErr) }

        return ok({ bot_task_id: botTask?.id, ...smmData })
      } catch (e: any) {
        if (botTask?.id) await supabase.from('bot_tasks').update({ status: 'failed', meta: { error: e.message } }).eq('id', botTask.id)
        return fail(`SMM proxy error: ${e.message}`, 500)
      }
    }

    // ─── SMM: Check upload status ───────────────────────────────
    if (path === 'smm-status' && req.method === 'GET') {
      const request_id = params.get('request_id')
      const job_id = params.get('job_id')
      if (!request_id && !job_id) return fail('request_id or job_id is required')

      try {
        const statusParams = new URLSearchParams({ action: 'upload-status' })
        if (request_id) statusParams.set('request_id', request_id)
        if (job_id) statusParams.set('job_id', job_id)

        const projectUrl = Deno.env.get('SUPABASE_URL')!
        const res = await fetch(`${projectUrl}/functions/v1/smm-api?${statusParams}`, {
          headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        })
        const data = await res.json()
        return ok(data)
      } catch (e: any) {
        return fail(e.message, 500)
      }
    }

    // ─── SMM: List scheduled posts ──────────────────────────────
    if (path === 'smm-scheduled' && req.method === 'GET') {
      try {
        const projectUrl = Deno.env.get('SUPABASE_URL')!
        const res = await fetch(`${projectUrl}/functions/v1/smm-api?action=list-scheduled`, {
          headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        })
        const data = await res.json()
        return ok(data)
      } catch (e: any) {
        return fail(e.message, 500)
      }
    }

    // ─── SMM: Cancel scheduled post ─────────────────────────────
    if (path === 'smm-cancel' && req.method === 'POST') {
      const { job_id, bot_task_id } = body as any
      if (!job_id) return fail('job_id is required')

      try {
        const projectUrl = Deno.env.get('SUPABASE_URL')!
        const res = await fetch(`${projectUrl}/functions/v1/smm-api?action=cancel-scheduled&job_id=${job_id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        })

        if (bot_task_id) {
          await supabase.from('bot_tasks').update({ status: 'failed', meta: { job_id, cancelled: true } }).eq('id', bot_task_id)
        }

        await logActivity(supabase, 'bot_task', bot_task_id || null, 'smm_post_cancelled', `Cancelled scheduled post ${job_id}`)
        return ok({ cancelled: true, job_id })
      } catch (e: any) {
        return fail(e.message, 500)
      }
    }

    // ─── SMM: Upload history ────────────────────────────────────
    if (path === 'smm-history' && req.method === 'GET') {
      const page = params.get('page') || '1'
      const limit = params.get('limit') || '50'
      try {
        const projectUrl = Deno.env.get('SUPABASE_URL')!
        const res = await fetch(`${projectUrl}/functions/v1/smm-api?action=upload-history&page=${page}&limit=${limit}`, {
          headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        })
        const data = await res.json()
        return ok(data)
      } catch (e: any) {
        return fail(e.message, 500)
      }
    }

    // ─── SMM: Analytics ─────────────────────────────────────────
    if (path === 'smm-analytics' && req.method === 'GET') {
      const profile_username = params.get('profile_username')
      const smmPlatforms = params.get('platforms') || 'instagram,tiktok,facebook,linkedin,youtube'
      if (!profile_username) return fail('profile_username is required')
      try {
        const projectUrl = Deno.env.get('SUPABASE_URL')!
        const res = await fetch(`${projectUrl}/functions/v1/smm-api?action=analytics&profile_username=${profile_username}&platforms=${smmPlatforms}`, {
          headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        })
        const data = await res.json()
        return ok(data)
      } catch (e: any) {
        return fail(e.message, 500)
      }
    }

    // ─── SMM: AI Command (prompt-driven scheduler with auto-history) ──
    if (path === 'smm-command' && req.method === 'POST') {
      const { prompt, profile, history: manualHistory, reset } = body as {
        prompt?: string; profile?: string; history?: any[]; reset?: boolean
      }
      if (!prompt) return fail('prompt is required')
      const smmProfile = profile || 'STU25'
      const memoryKey = `smm-conv:${smmProfile}`

      try {
        // Load persisted conversation memory (last 20 turns)
        let conversationHistory: { role: string; text: string }[] = []
        if (!reset) {
          const { data: memRow } = await supabase
            .from('webhook_events')
            .select('payload')
            .eq('source', 'system')
            .eq('event_type', memoryKey)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (memRow?.payload && Array.isArray((memRow.payload as any).turns)) {
            conversationHistory = (memRow.payload as any).turns
          }
        }

        // Merge: manual history overrides, otherwise use persisted
        const mergedHistory = manualHistory?.length ? manualHistory : conversationHistory

        const projectUrl = Deno.env.get('SUPABASE_URL')!
        const res = await fetch(`${projectUrl}/functions/v1/smm-scheduler`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prompt, profile: smmProfile, history: mergedHistory }),
        })
        const data = await res.json()

        // Persist updated conversation (keep last 20 turns)
        const newTurns = [
          ...mergedHistory,
          { role: 'user', text: prompt },
          { role: 'assistant', text: data.type === 'executed'
            ? `Executed: ${(data.actions || []).map((a: any) => a.description).join(', ')}`
            : data.message || JSON.stringify(data) },
        ].slice(-20)

        const { data: existing } = await supabase
          .from('webhook_events')
          .select('id')
          .eq('source', 'system')
          .eq('event_type', memoryKey)
          .limit(1)
          .maybeSingle()

        if (existing?.id) {
          await supabase.from('webhook_events').update({
            payload: { turns: newTurns, updated_at: new Date().toISOString() },
            processed: true,
          }).eq('id', existing.id)
        } else {
          await supabase.from('webhook_events').insert({
            source: 'system',
            event_type: memoryKey,
            payload: { turns: newTurns, updated_at: new Date().toISOString() },
            processed: true,
          })
        }

        await logActivity(supabase, 'smm', null, 'smm-command', `SMM Command: ${(prompt as string).slice(0, 80)}`)

        // Explicitly notify Telegram on successful SMM executions
        if (data.type === 'executed' && Array.isArray(data.actions)) {
          const successActions = data.actions.filter((a: any) => a.success)
          if (successActions.length > 0) {
            const summaryLines = successActions.map((a: any) => `✅ ${a.description || a.action}`).join('\n')
            const failedActions = data.actions.filter((a: any) => !a.success)
            const failLines = failedActions.length
              ? '\n' + failedActions.map((a: any) => `❌ ${a.description || a.action}: ${a.error || 'unknown'}`).join('\n')
              : ''
            try {
              const projectUrl = Deno.env.get('SUPABASE_URL')!
              await fetch(`${projectUrl}/functions/v1/telegram-notify`, {
                method: 'POST',
                headers: {
                  'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  entity_type: 'smm',
                  action: 'created',
                  meta: {
                    message: `📱 *SMM via Cortex*\nProfile: *${smmProfile}*\n${summaryLines}${failLines}`,
                  },
                  created_at: new Date().toISOString(),
                }),
              })
            } catch (tgErr) {
              console.error('[smm-command] telegram notify error:', tgErr)
            }
          }
        }

        return ok({ ...data, conversation_turns: newTurns.length })
      } catch (e: any) {
        return fail(e.message, 500)
      }
    }

    // ─── SMM: Conversation context (read / clear) ───────────────
    if (path === 'smm-history-context' && req.method === 'GET') {
      const smmProfile = params.get('profile') || 'STU25'
      const memoryKey = `smm-conv:${smmProfile}`
      const { data: memRow } = await supabase
        .from('webhook_events')
        .select('payload')
        .eq('source', 'system')
        .eq('event_type', memoryKey)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const turns = memRow?.payload && Array.isArray((memRow.payload as any).turns)
        ? (memRow.payload as any).turns : []
      return ok({ profile: smmProfile, turns, turn_count: turns.length })
    }

    if (path === 'smm-history-context' && req.method === 'DELETE') {
      const smmProfile = (body.profile as string) || params.get('profile') || 'STU25'
      const memoryKey = `smm-conv:${smmProfile}`
      await supabase.from('webhook_events').delete().eq('source', 'system').eq('event_type', memoryKey)
      return ok({ action: 'cleared', profile: smmProfile })
    }

    return fail('Unknown endpoint', 404)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return fail(msg, 500)
  }
})
