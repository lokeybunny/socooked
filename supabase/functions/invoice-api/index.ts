import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret',
}

interface LineItem {
  description: string
  quantity: number
  unit_price: number
}

interface InvoicePayload {
  customer_id?: string
  customer_email?: string
  line_items: LineItem[]
  currency?: string
  due_date?: string
  notes?: string
  tax_rate?: number
  auto_send?: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Auth: accept BOT_SECRET or standard JWT
    const botSecret = req.headers.get('x-bot-secret')
    const authHeader = req.headers.get('authorization')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    let authorized = false

    if (botSecret) {
      const expectedSecret = Deno.env.get('BOT_SECRET')
      if (!expectedSecret) {
        return new Response(JSON.stringify({ error: 'BOT_SECRET not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (botSecret !== expectedSecret) {
        return new Response(JSON.stringify({ error: 'Invalid bot secret' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      authorized = true
    } else if (authHeader?.startsWith('Bearer ')) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      })
      const token = authHeader.replace('Bearer ', '')
      const { data, error } = await userClient.auth.getClaims(token)
      if (!error && data?.claims?.sub) authorized = true
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const url = new URL(req.url)
    const path = url.pathname.split('/').pop()

    // POST /invoice-api - Create invoice
    if (req.method === 'POST' && (!path || path === 'invoice-api')) {
      const body: InvoicePayload = await req.json()

      // Resolve customer
      let customerId = body.customer_id
      if (!customerId && body.customer_email) {
        const { data: cust } = await supabase
          .from('customers')
          .select('id')
          .eq('email', body.customer_email)
          .limit(1)
          .single()
        if (cust) customerId = cust.id
      }

      if (!customerId) {
        return new Response(JSON.stringify({ error: 'Customer not found. Provide customer_id or customer_email.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      if (!body.line_items || body.line_items.length === 0) {
        return new Response(JSON.stringify({ error: 'line_items required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const taxRate = body.tax_rate || 0
      const subtotal = body.line_items.reduce((s, li) => s + li.quantity * li.unit_price, 0)
      const total = subtotal + (subtotal * taxRate / 100)

      const insertData: Record<string, unknown> = {
        customer_id: customerId,
        line_items: body.line_items,
        subtotal,
        amount: total,
        tax_rate: taxRate,
        currency: body.currency || 'USD',
        due_date: body.due_date || null,
        notes: body.notes || null,
        status: body.auto_send ? 'sent' : 'draft',
        provider: 'clawd-bot',
      }

      if (body.auto_send) {
        insertData.sent_at = new Date().toISOString()
      }

      const { data: invoice, error } = await supabase
        .from('invoices')
        .insert([insertData])
        .select('*, customers(full_name, email)')
        .single()

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ success: true, invoice }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // GET /invoice-api?customer_id=xxx - List invoices
    if (req.method === 'GET') {
      const customerId = url.searchParams.get('customer_id')
      let query = supabase.from('invoices').select('*, customers(full_name, email)').order('created_at', { ascending: false })
      if (customerId) query = query.eq('customer_id', customerId)
      query = query.limit(50)

      const { data, error } = await query
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ invoices: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // PATCH /invoice-api?id=xxx - Update status
    if (req.method === 'PATCH') {
      const invoiceId = url.searchParams.get('id')
      if (!invoiceId) {
        return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const body = await req.json()
      const updates: Record<string, unknown> = {}
      if (body.status) {
        updates.status = body.status
        if (body.status === 'sent') updates.sent_at = new Date().toISOString()
        if (body.status === 'paid') updates.paid_at = new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('invoices')
        .update(updates)
        .eq('id', invoiceId)
        .select()
        .single()

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ success: true, invoice: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
