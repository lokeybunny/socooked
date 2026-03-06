/**
 * Meeting Command — Gemini-powered NLP for meeting CRUD
 * Parses natural language prompts into clawd-bot/meeting API calls
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const rawBody = await req.text()
    let body: any = {}
    try {
      body = rawBody ? JSON.parse(rawBody) : {}
    } catch {
      body = { prompt: rawBody }
    }

    const { prompt, history } = body
    if (!prompt) {
      return new Response(JSON.stringify({ type: 'message', message: 'Please provide a meeting command.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const BOT_SECRET = Deno.env.get('BOT_SECRET')!

    // Fetch current meetings and customers for context
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const [{ data: meetings }, { data: customers }] = await Promise.all([
      supabase.from('meetings').select('id, title, room_code, scheduled_at, status, customer_id').order('created_at', { ascending: false }).limit(30),
      supabase.from('customers').select('id, full_name, email, phone').order('created_at', { ascending: false }).limit(50),
    ])

    const meetingList = (meetings || []).map((m: any) =>
      `- "${m.title}" (status: ${m.status}, scheduled: ${m.scheduled_at || 'none'}, room: ${m.room_code}, id: ${m.id})`
    ).join('\n')

    const customerList = (customers || []).map((c: any) =>
      `- ${c.full_name} (email: ${c.email || 'none'}, phone: ${c.phone || 'none'}, id: ${c.id})`
    ).join('\n')

    const systemPrompt = `You are a meeting management assistant. Parse natural language commands into structured API actions for creating, updating, listing, or deleting meetings.

Current meetings:
${meetingList || 'No meetings yet.'}

Current customers:
${customerList || 'No customers yet.'}

You can perform these actions:
1. CREATE a meeting room: POST /clawd-bot/meeting with { title?, scheduled_at?, category?, status?, customer_id? }
   - Returns a room_url like https://stu25.com/meet/ROOM_CODE
   - If user mentions a customer name, set title to "Meeting with <name>" AND include their customer_id from the list above.
   - NEVER set host_id — it references auth users, not customers.
   - The system will automatically email the customer and add the meeting to the calendar.
2. UPDATE a meeting: POST /clawd-bot/meeting with { id, title?, scheduled_at?, status?, category? }
3. DELETE a meeting: DELETE /clawd-bot/meeting with { id }
4. LIST meetings: GET /clawd-bot/meetings
5. CANCEL meetings: POST /clawd-bot/cancel-meetings with { customer_name?, customer_id?, date?, from?, to? }

Respond with JSON in this exact format:
{
  "type": "executed",
  "actions": [
    {
      "method": "POST|GET|DELETE",
      "endpoint": "/clawd-bot/meeting",
      "body": { ... },
      "description": "Human-readable description of what this does"
    }
  ]
}

If you need clarification, respond:
{ "type": "clarify", "message": "What would you like to know?" }

If the user asks something unrelated, respond:
{ "type": "message", "message": "I can help you create, update, list, or cancel meetings." }

IMPORTANT:
- Always resolve customer names to their IDs from the list above. Include customer_id in the body when creating a meeting for a known customer.
- Only use customer_id values from the customer list above. If a customer name is not found, set customer_id to null — NEVER fabricate a UUID.
- When creating a meeting for someone, set title to "Meeting with <customer name>".
- NEVER include host_id in the body — it references auth users (profiles table), NOT customers. Including it will cause a foreign key error.
- For scheduled_at, use ISO 8601 format (e.g. "2026-03-10T15:00:00Z").
- The user is in Pacific Time (America/Los_Angeles). Convert times to UTC: PST = UTC-8, PDT = UTC-7.
- Today is ${new Date().toISOString().split('T')[0]}.
- If user says "create a meeting room for Eddie", find Eddie in customers and create a meeting with their name as the title and their customer_id.`

    // Call Gemini via Lovable AI gateway
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    const geminiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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

    const geminiPayload = await geminiRes.text()
    if (!geminiRes.ok) {
      throw new Error(`Model request failed (${geminiRes.status}): ${geminiPayload.slice(0, 200)}`)
    }

    let rawText = ''
    try {
      const geminiData = JSON.parse(geminiPayload)
      rawText = geminiData.choices?.[0]?.message?.content || ''
    } catch {
      const lines = geminiPayload
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s*/, ''))
        .filter((line) => line && line !== '[DONE]')

      for (const line of lines) {
        try {
          const chunk = JSON.parse(line)
          rawText += chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content || ''
        } catch {
          // ignore malformed chunk
        }
      }

      if (!rawText.trim()) {
        throw new Error(`Model response was not valid JSON: ${geminiPayload.slice(0, 200)}`)
      }
    }

    // Extract JSON from response
    let parsed: any
    try {
      let cleaned = rawText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim()

      const jsonStart = cleaned.search(/[\{\[]/)
      if (jsonStart === -1) throw new Error('No JSON found')
      const startChar = cleaned[jsonStart]
      const endChar = startChar === '[' ? ']' : '}'
      const jsonEnd = cleaned.lastIndexOf(endChar)
      if (jsonEnd === -1) throw new Error('No closing bracket')

      cleaned = cleaned.substring(jsonStart, jsonEnd + 1)

      cleaned = cleaned
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/[\x00-\x1F\x7F]/g, '')

      parsed = JSON.parse(cleaned)
    } catch {
      parsed = { type: 'message', message: rawText || 'Sorry, I could not process that request.' }
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
