/**
 * Customer Scheduler — Gemini-powered NLP for customer CRUD
 * Parses natural language prompts into clawd-bot/customer API calls
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { prompt, history } = await req.json()
    if (!prompt) {
      return new Response(JSON.stringify({ type: 'message', message: 'Please provide a command.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const BOT_SECRET = Deno.env.get('BOT_SECRET')!

    // Fetch current customers for context
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: customers } = await supabase.from('customers').select('id, full_name, email, phone, company, status, category, source').order('created_at', { ascending: false }).limit(50)

    const customerList = (customers || []).map((c: any) => `- ${c.full_name} (${c.email || 'no email'}, status: ${c.status}, category: ${c.category || 'other'}, id: ${c.id})`).join('\n')

    const systemPrompt = `You are a CRM customer management assistant. Parse natural language commands into structured API actions.

Current customers in CRM:
${customerList || 'No customers yet.'}

Valid categories: digital-services, brick-and-mortar, digital-ecommerce, food-and-beverage, mobile-services, telegram, other
Valid statuses: lead, prospect, active, inactive, churned

You can perform these actions:
1. CREATE a customer: POST /clawd-bot/customer with { full_name, email?, phone?, company?, status?, category?, source?, notes?, address?, tags? }
2. UPDATE a customer: POST /clawd-bot/customer with { id, ...fields_to_update }
3. DELETE a customer: DELETE /clawd-bot/customer with { id }
4. SEARCH/LIST customers: GET /clawd-bot/customers with optional ?status=X&category=X
5. LOOKUP a specific customer: GET /clawd-bot/search?q=name_or_email

Respond with JSON in this exact format:
{
  "type": "executed",
  "actions": [
    {
      "method": "POST|GET|DELETE",
      "endpoint": "/clawd-bot/customer",
      "body": { ... },
      "description": "Human-readable description of what this does"
    }
  ]
}

If you need clarification, respond:
{ "type": "clarify", "message": "What would you like to know?" }

If the user asks something unrelated, respond:
{ "type": "message", "message": "I can help you create, update, search, or delete customers." }

IMPORTANT: Always resolve customer names to their IDs from the list above when updating/deleting. If a name isn't found, ask for clarification.`

    const messages = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      ...(history || []).map((h: any) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }],
      })),
      { role: 'user', parts: [{ text: prompt }] },
    ]

    // Call Gemini
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    const geminiRes = await fetch('https://api.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...(history || []).map((h: any) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text })),
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
      }),
    })

    const geminiData = await geminiRes.json()
    const rawText = geminiData.choices?.[0]?.message?.content || ''

    // Extract JSON from response
    let parsed: any
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { type: 'message', message: rawText }
    } catch {
      parsed = { type: 'message', message: rawText }
    }

    if (parsed.type === 'clarify' || parsed.type === 'message') {
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Execute actions
    if (parsed.type === 'executed' && Array.isArray(parsed.actions)) {
      const results: any[] = []

      for (const action of parsed.actions) {
        try {
          const url = `${SUPABASE_URL}/functions/v1${action.endpoint}`
          const fetchOpts: RequestInit = {
            method: action.method || 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-bot-secret': BOT_SECRET,
            },
          }
          if (action.method !== 'GET' && action.body) {
            fetchOpts.body = JSON.stringify(action.body)
          }

          const res = await fetch(url + (action.method === 'GET' && action.query ? `?${new URLSearchParams(action.query)}` : ''), fetchOpts)
          const data = await res.json()

          results.push({
            success: res.ok,
            description: action.description || `${action.method} ${action.endpoint}`,
            data: data?.data || data,
            error: res.ok ? undefined : (data?.error || 'Unknown error'),
          })
        } catch (e: any) {
          results.push({
            success: false,
            description: action.description || `${action.method} ${action.endpoint}`,
            error: e.message,
          })
        }
      }

      return new Response(JSON.stringify({ type: 'executed', actions: results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ type: 'message', message: `Error: ${e.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
