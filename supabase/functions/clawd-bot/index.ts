import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  const path = url.pathname.split('/').pop()

  const botSecret = req.headers.get('x-bot-secret')
  const authHeader = req.headers.get('Authorization')
  const expectedSecret = Deno.env.get('BOT_SECRET')

  const isBot = botSecret && expectedSecret && botSecret === expectedSecret
  const isStaff = authHeader?.startsWith('Bearer ')

  if (!isBot && !isStaff) return json({ error: 'Unauthorized' }, 401)

  const supabase = isBot
    ? createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    : createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader! } }
      })

  if (isStaff) {
    const token = authHeader!.replace('Bearer ', '')
    const { error } = await supabase.auth.getClaims(token)
    if (error) return json({ error: 'Unauthorized' }, 401)
  }

  try {
    const body = req.method !== 'GET' ? await req.json() : {}
    const params = url.searchParams

    // ─── CUSTOMERS ───────────────────────────────────────────
    if (path === 'customers' && req.method === 'GET') {
      const status = params.get('status')
      const category = params.get('category')
      let q = supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(100)
      if (status) q = q.eq('status', status)
      if (category) q = q.eq('category', category)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 400)
      return json({ customers: data })
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
        if (category) updates.category = category
        if (meta) updates.meta = meta
        const { error } = await supabase.from('customers').update(updates).eq('id', id)
        if (error) return json({ error: error.message }, 400)
        return json({ action: 'updated', customer_id: id })
      }
      if (!full_name) return json({ error: 'full_name is required' }, 400)
      const { data, error } = await supabase.from('customers').insert({
        full_name, email: email || null, phone: phone || null, address: address || null,
        company: company || null, source: source || 'bot', status: status || 'lead',
        notes: notes || null, tags: tags || [], category: category || null, meta: meta || {},
      }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', customer_id: data?.id })
    }

    if (path === 'customer' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return json({ error: 'id is required' }, 400)
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    // ─── LEADS (shortcut) ────────────────────────────────────
    if (path === 'lead' && req.method === 'POST') {
      const { full_name, email, phone, address, company, source, source_url, notes, tags, category } = body
      if (!full_name) return json({ error: 'full_name is required' }, 400)
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
        return json({ action: 'updated', customer_id: existingId })
      }
      const { data, error } = await supabase.from('customers').insert({
        full_name, email: email || null, phone: phone || null, address: address || null,
        company: company || null, source: source || 'bot', status: 'lead',
        notes: notes || (source_url ? `Source: ${source_url}` : null), tags: tags || [], category: category || null,
      }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', customer_id: data?.id })
    }

    // ─── DEALS ───────────────────────────────────────────────
    if (path === 'deals' && req.method === 'GET') {
      const category = params.get('category')
      const status = params.get('status')
      let q = supabase.from('deals').select('*, customers(full_name)').order('created_at', { ascending: false }).limit(100)
      if (category) q = q.eq('category', category)
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 400)
      return json({ deals: data })
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
        if (error) return json({ error: error.message }, 400)
        return json({ action: 'updated', deal_id: id })
      }
      if (!title || !customer_id) return json({ error: 'title and customer_id are required' }, 400)
      const { data, error } = await supabase.from('deals').insert({
        title, customer_id, deal_value: deal_value || 0, stage: stage || 'new',
        pipeline: pipeline || 'default', probability: probability || 10,
        expected_close_date: expected_close_date || null, status: status || 'open',
        tags: tags || [], category: category || null,
      }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', deal_id: data?.id })
    }

    if (path === 'deal' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return json({ error: 'id is required' }, 400)
      const { error } = await supabase.from('deals').delete().eq('id', id)
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    // ─── PROJECTS ────────────────────────────────────────────
    if (path === 'projects' && req.method === 'GET') {
      const category = params.get('category')
      const status = params.get('status')
      let q = supabase.from('projects').select('*, customers(full_name)').order('created_at', { ascending: false }).limit(100)
      if (category) q = q.eq('category', category)
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 400)
      return json({ projects: data })
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
        if (error) return json({ error: error.message }, 400)
        return json({ action: 'updated', project_id: id })
      }
      if (!title) return json({ error: 'title is required' }, 400)
      const { data, error } = await supabase.from('projects').insert({
        title, description: description || null, customer_id: customer_id || null,
        status: status || 'planned', priority: priority || 'medium',
        start_date: start_date || null, due_date: due_date || null,
        tags: tags || [], category: category || null,
      }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', project_id: data?.id })
    }

    if (path === 'project' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return json({ error: 'id is required' }, 400)
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    // ─── TASKS (project tasks) ───────────────────────────────
    if (path === 'project-tasks' && req.method === 'GET') {
      const project_id = params.get('project_id')
      const category = params.get('category')
      let q = supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(100)
      if (project_id) q = q.eq('project_id', project_id)
      if (category) q = q.eq('category', category)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 400)
      return json({ tasks: data })
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
        if (error) return json({ error: error.message }, 400)
        return json({ action: 'updated', task_id: id })
      }
      if (!title || !project_id) return json({ error: 'title and project_id are required' }, 400)
      const { data, error } = await supabase.from('tasks').insert({
        title, description: description || null, project_id,
        status: status || 'todo', priority: priority || 'medium',
        due_date: due_date || null, tags: tags || [], category: category || null,
        checklist: checklist || [],
      }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', task_id: data?.id })
    }

    if (path === 'project-task' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return json({ error: 'id is required' }, 400)
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    // ─── CONTENT ASSETS ──────────────────────────────────────
    if (path === 'content' && req.method === 'GET') {
      const category = params.get('category')
      const type = params.get('type')
      let q = supabase.from('content_assets').select('*').order('created_at', { ascending: false }).limit(100)
      if (category) q = q.eq('category', category)
      if (type) q = q.eq('type', type)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 400)
      return json({ content: data })
    }

    if (path === 'content' && req.method === 'POST') {
      const { id, title, type, body: assetBody, status, tags, category, url, folder, scheduled_for } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (title) updates.title = title
        if (type) updates.type = type
        if (assetBody !== undefined) updates.body = assetBody
        if (status) updates.status = status
        if (tags) updates.tags = tags
        if (category) updates.category = category
        if (url !== undefined) updates.url = url
        if (folder !== undefined) updates.folder = folder
        if (scheduled_for !== undefined) updates.scheduled_for = scheduled_for
        const { error } = await supabase.from('content_assets').update(updates).eq('id', id)
        if (error) return json({ error: error.message }, 400)
        return json({ action: 'updated', content_id: id })
      }
      if (!title || !type) return json({ error: 'title and type are required' }, 400)
      const { data, error } = await supabase.from('content_assets').insert({
        title, type, body: assetBody || null, status: status || 'draft',
        tags: tags || [], category: category || null, url: url || null,
        folder: folder || null, scheduled_for: scheduled_for || null,
      }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', content_id: data?.id })
    }

    if (path === 'content' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return json({ error: 'id is required' }, 400)
      const { error } = await supabase.from('content_assets').delete().eq('id', id)
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    // ─── CONVERSATION THREADS ────────────────────────────────
    if (path === 'threads' && req.method === 'GET') {
      const customer_id = params.get('customer_id')
      const category = params.get('category')
      let q = supabase.from('conversation_threads').select('*, customers(full_name)').order('created_at', { ascending: false }).limit(100)
      if (customer_id) q = q.eq('customer_id', customer_id)
      if (category) q = q.eq('category', category)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 400)
      return json({ threads: data })
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
        if (error) return json({ error: error.message }, 400)
        return json({ action: 'updated', thread_id: id })
      }
      if (!customer_id) return json({ error: 'customer_id is required' }, 400)
      const { data, error } = await supabase.from('conversation_threads').insert({
        customer_id, channel: channel || 'chat', status: status || 'open',
        summary: summary || null, raw_transcript: raw_transcript || null, category: category || null,
      }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', thread_id: data?.id })
    }

    if (path === 'thread' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return json({ error: 'id is required' }, 400)
      const { error } = await supabase.from('conversation_threads').delete().eq('id', id)
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    // ─── DOCUMENTS ───────────────────────────────────────────
    if (path === 'documents' && req.method === 'GET') {
      const customer_id = params.get('customer_id')
      const category = params.get('category')
      let q = supabase.from('documents').select('*, customers(full_name)').order('created_at', { ascending: false }).limit(100)
      if (customer_id) q = q.eq('customer_id', customer_id)
      if (category) q = q.eq('category', category)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 400)
      return json({ documents: data })
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
        if (error) return json({ error: error.message }, 400)
        return json({ action: 'updated', document_id: id })
      }
      if (!title || !type || !customer_id) return json({ error: 'title, type, and customer_id are required' }, 400)
      const { data, error } = await supabase.from('documents').insert({
        title, type, customer_id, thread_id: thread_id || null,
        status: status || 'draft', file_url: file_url || null,
        storage_path: storage_path || null, category: category || null,
      }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', document_id: data?.id })
    }

    if (path === 'document' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return json({ error: 'id is required' }, 400)
      const { error } = await supabase.from('documents').delete().eq('id', id)
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    // ─── INVOICES ────────────────────────────────────────────
    if (path === 'invoices' && req.method === 'GET') {
      const customer_id = params.get('customer_id')
      const status = params.get('status')
      let q = supabase.from('invoices').select('*, customers(full_name)').order('created_at', { ascending: false }).limit(100)
      if (customer_id) q = q.eq('customer_id', customer_id)
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 400)
      return json({ invoices: data })
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
        if (error) return json({ error: error.message }, 400)
        return json({ action: 'updated', invoice_id: id })
      }
      if (!customer_id) return json({ error: 'customer_id is required' }, 400)
      const { data, error } = await supabase.from('invoices').insert({
        customer_id, deal_id: deal_id || null, line_items: line_items || [],
        tax_rate: tax_rate || 0, subtotal: subtotal || 0, amount: amount || 0,
        status: status || 'draft', due_date: due_date || null, notes: notes || null,
        currency: currency || 'USD',
      }).select('id, invoice_number').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', invoice_id: data?.id, invoice_number: data?.invoice_number })
    }

    if (path === 'invoice' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return json({ error: 'id is required' }, 400)
      const { error } = await supabase.from('invoices').delete().eq('id', id)
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    // ─── COMMUNICATIONS ─────────────────────────────────────
    if (path === 'communications' && req.method === 'GET') {
      const customer_id = params.get('customer_id')
      const type = params.get('type')
      let q = supabase.from('communications').select('*, customers(full_name)').order('created_at', { ascending: false }).limit(100)
      if (customer_id) q = q.eq('customer_id', customer_id)
      if (type) q = q.eq('type', type)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 400)
      return json({ communications: data })
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
        if (error) return json({ error: error.message }, 400)
        return json({ action: 'updated', communication_id: id })
      }
      if (!type) return json({ error: 'type is required' }, 400)
      const { data, error } = await supabase.from('communications').insert({
        type, customer_id: customer_id || null, direction: direction || 'outbound',
        subject: subject || null, body: commBody || null,
        from_address: from_address || null, to_address: to_address || null,
        phone_number: phone_number || null, status: status || 'sent',
        provider: provider || null, duration_seconds: duration_seconds || null,
        metadata: metadata || {},
      }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', communication_id: data?.id })
    }

    if (path === 'communication' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return json({ error: 'id is required' }, 400)
      const { error } = await supabase.from('communications').delete().eq('id', id)
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    // ─── SIGNATURES (read-only) ──────────────────────────────
    if (path === 'signatures' && req.method === 'GET') {
      const customer_id = params.get('customer_id')
      const document_id = params.get('document_id')
      let q = supabase.from('signatures').select('*, customers(full_name), documents(title)').order('signed_at', { ascending: false }).limit(100)
      if (customer_id) q = q.eq('customer_id', customer_id)
      if (document_id) q = q.eq('document_id', document_id)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 400)
      return json({ signatures: data })
    }

    // ─── INTERACTIONS ────────────────────────────────────────
    if (path === 'interactions' && req.method === 'GET') {
      const customer_id = params.get('customer_id')
      let q = supabase.from('interactions').select('*').order('occurred_at', { ascending: false }).limit(100)
      if (customer_id) q = q.eq('customer_id', customer_id)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 400)
      return json({ interactions: data })
    }

    if (path === 'interaction' && req.method === 'POST') {
      const { customer_id, type, direction, subject, notes, outcome, next_action } = body
      if (!customer_id || !type) return json({ error: 'customer_id and type are required' }, 400)
      const { data, error } = await supabase.from('interactions').insert({
        customer_id, type, direction: direction || 'outbound',
        subject: subject || null, notes: notes || null,
        outcome: outcome || null, next_action: next_action || null,
      }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', interaction_id: data?.id })
    }

    // ─── BOARDS / LISTS / CARDS ──────────────────────────────
    if (path === 'boards' && req.method === 'GET') {
      const { data } = await supabase.from('boards').select(`
        id, name, description, category, deadline, visibility,
        lists:lists(id, name, position,
          cards:cards(id, title, status, priority, position, source, description)
        )
      `).order('created_at', { ascending: true })
      return json({ boards: data })
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
        if (error) return json({ error: error.message }, 400)
        return json({ action: 'updated', board_id: id })
      }
      if (!name) return json({ error: 'name is required' }, 400)
      const { data, error } = await supabase.from('boards').insert({
        name, description: description || null, category: category || null,
        deadline: deadline || null, visibility: visibility || 'private',
        customer_id: customer_id || null,
      }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', board_id: data?.id })
    }

    if (path === 'board' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return json({ error: 'id is required' }, 400)
      const { error } = await supabase.from('boards').delete().eq('id', id)
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    if (path === 'list' && req.method === 'POST') {
      const { id, board_id, name, position } = body
      if (id) {
        const updates: Record<string, unknown> = {}
        if (name) updates.name = name
        if (position !== undefined) updates.position = position
        const { error } = await supabase.from('lists').update(updates).eq('id', id)
        if (error) return json({ error: error.message }, 400)
        return json({ action: 'updated', list_id: id })
      }
      if (!board_id || !name) return json({ error: 'board_id and name are required' }, 400)
      const { data, error } = await supabase.from('lists').insert({
        board_id, name, position: position || 0,
      }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', list_id: data?.id })
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
        return json({ action: 'updated', card_id: existing.id })
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
      return json({ action: 'created', card_id: card?.id })
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
        if (error) return json({ error: error.message }, 400)
        return json({ action: 'updated', card_id: id })
      }
      if (!board_id || !list_id || !title) return json({ error: 'board_id, list_id, and title are required' }, 400)
      const { data: maxPos } = await supabase.from('cards').select('position').eq('list_id', list_id).order('position', { ascending: false }).limit(1).maybeSingle()
      const { data, error } = await supabase.from('cards').insert({
        board_id, list_id, title, description: description || null,
        status: status || 'open', priority: priority || 'medium',
        due_date: due_date || null, source: source || null, source_url: source_url || null,
        customer_id: customer_id || null, deal_id: deal_id || null,
        position: (maxPos?.position ?? -1) + 1,
      }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', card_id: data?.id })
    }

    if (path === 'card' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return json({ error: 'id is required' }, 400)
      const { error } = await supabase.from('cards').delete().eq('id', id)
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    if (path === 'move' && req.method === 'POST') {
      const { card_id, to_list_id } = body
      const { error } = await supabase.from('cards').update({ list_id: to_list_id }).eq('id', card_id)
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    if (path === 'comment' && req.method === 'POST') {
      const { card_id, comment } = body
      const { error } = await supabase.from('card_comments').insert({ card_id, body: comment })
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    if (path === 'attach' && req.method === 'POST') {
      const { card_id, type, title: attTitle, url: attUrl } = body
      const { error } = await supabase.from('card_attachments').insert({ card_id, type: type || 'url', title: attTitle, url: attUrl })
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    // ─── BOT TASKS ───────────────────────────────────────────
    if (path === 'bot-tasks' && req.method === 'GET') {
      const status = params.get('status')
      let q = supabase.from('bot_tasks').select('*').order('created_at', { ascending: false }).limit(100)
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 400)
      return json({ bot_tasks: data })
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
        if (error) return json({ error: error.message }, 400)
        return json({ action: 'updated', bot_task_id: id })
      }
      if (!title || !bot_agent) return json({ error: 'title and bot_agent are required' }, 400)
      const { data, error } = await supabase.from('bot_tasks').insert({
        title, description: description || null, bot_agent,
        customer_id: customer_id || null, status: status || 'queued',
        priority: priority || 'medium', due_date: due_date || null, meta: meta || {},
      }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', bot_task_id: data?.id })
    }

    if (path === 'bot-task' && req.method === 'DELETE') {
      const { id } = body
      if (!id) return json({ error: 'id is required' }, 400)
      const { error } = await supabase.from('bot_tasks').delete().eq('id', id)
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    // ─── ACTIVITY LOG (read-only) ────────────────────────────
    if (path === 'activity' && req.method === 'GET') {
      const entity_type = params.get('entity_type')
      let q = supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(100)
      if (entity_type) q = q.eq('entity_type', entity_type)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 400)
      return json({ activity: data })
    }

    // ─── LABELS ──────────────────────────────────────────────
    if (path === 'labels' && req.method === 'GET') {
      const board_id = params.get('board_id')
      let q = supabase.from('labels').select('*')
      if (board_id) q = q.eq('board_id', board_id)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 400)
      return json({ labels: data })
    }

    if (path === 'label' && req.method === 'POST') {
      const { board_id, name, color } = body
      if (!board_id || !name) return json({ error: 'board_id and name are required' }, 400)
      const { data, error } = await supabase.from('labels').insert({ board_id, name, color: color || null }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      return json({ action: 'created', label_id: data?.id })
    }

    // ─── STATE (full overview) ───────────────────────────────
    if (path === 'state' && req.method === 'GET') {
      const [boards, customers, deals, projects] = await Promise.all([
        supabase.from('boards').select('id, name, lists:lists(id, name, position, cards:cards(id, title, status, priority, position, source))').order('created_at', { ascending: true }),
        supabase.from('customers').select('id, full_name, status, email, category').order('created_at', { ascending: false }).limit(50),
        supabase.from('deals').select('id, title, stage, deal_value, status, category').order('created_at', { ascending: false }).limit(50),
        supabase.from('projects').select('id, title, status, priority, category').order('created_at', { ascending: false }).limit(50),
      ])
      return json({ boards: boards.data, customers: customers.data, deals: deals.data, projects: projects.data })
    }

    return json({ error: 'Unknown endpoint' }, 404)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return json({ error: msg }, 500)
  }
})
