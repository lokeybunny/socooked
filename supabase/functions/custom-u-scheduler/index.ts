/**
 * Custom-U Scheduler — Gemini-powered NLP for upload link management
 * Parses natural language prompts into clawd-bot upload-token / send-portal-link API calls
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: customers } = await supabase
      .from('customers')
      .select('id, full_name, email, company, category, upload_token')
      .order('full_name')
      .limit(100)

    const customerList = (customers || []).map((c: any) =>
      `- ${c.full_name} (email: ${c.email || 'none'}, company: ${c.company || 'none'}, category: ${c.category || 'other'}, upload_token: ${c.upload_token || 'none'}, id: ${c.id})`
    ).join('\n')

    const systemPrompt = `You are a Custom-U portal assistant. You manage upload links for customers — generating, revoking, regenerating, and sending portal links via email.

The Custom-U portal allows customers to upload files (photos, videos, documents) directly to our Google Drive through a personalized link at https://stu25.com/u/{token}.

Current customers:
${customerList || 'No customers yet.'}

You can perform these actions:
1. GENERATE an upload link for a customer: POST /clawd-bot/upload-token with { customer_id }
   - Creates a new upload token if customer doesn't have one
2. REVOKE an upload link: DELETE /clawd-bot/upload-token with { customer_id }
   - Removes their upload token so the link stops working
3. SEND portal link via email: POST /clawd-bot/send-portal-link with { customer_id }
   - Generates token if needed and emails the customer their portal link
4. LIST customers with active links: respond with a summary of customers who have upload_token set

Respond with JSON in this exact format:
{
  "type": "executed",
  "actions": [
    {
      "method": "POST|DELETE",
      "endpoint": "/clawd-bot/upload-token",
      "body": { "customer_id": "..." },
      "description": "Human-readable description"
    }
  ]
}

If you need clarification, respond:
{ "type": "clarify", "message": "What would you like to know?" }

If the user asks to list/show active links, respond:
{ "type": "message", "message": "<formatted list of customers with active tokens>" }

If the user asks something unrelated, respond:
{ "type": "message", "message": "I can help you generate, send, or revoke upload links for customers." }

IMPORTANT: Always resolve customer names to their IDs from the list above. If a name isn't found, ask for clarification.
When sending a portal link, use the send-portal-link endpoint (it auto-generates token if needed AND emails them).`

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
          if (action.body) {
            fetchOpts.body = JSON.stringify(action.body)
          }

          const res = await fetch(url, fetchOpts)
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
