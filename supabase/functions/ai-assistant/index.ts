/**
 * AI Assistant — Multi-module orchestrator
 * Decomposes complex natural language prompts into sequential actions
 * across all CRM modules (email, invoice, web dev, image gen, customer, etc.)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { prompt, history, chat_id } = await req.json()
    if (!prompt) {
      return new Response(JSON.stringify({ type: 'message', message: 'Please provide a command.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const BOT_SECRET = Deno.env.get('BOT_SECRET')!
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fetch CRM context for the AI
    const { data: customers } = await supabase.from('customers')
      .select('id, full_name, email, phone, company, status, category')
      .order('created_at', { ascending: false }).limit(30)

    const customerCtx = (customers || []).map((c: any) =>
      `- ${c.full_name} (email: ${c.email || 'none'}, id: ${c.id}, category: ${c.category || 'other'})`
    ).join('\n')

    const systemPrompt = `You are CLAWDbot AI Assistant — an autonomous orchestrator that decomposes complex multi-step requests into sequential API actions across ALL CRM modules.

CURRENT CRM CUSTOMERS:
${customerCtx || 'No customers yet.'}

AVAILABLE MODULES & ENDPOINTS:
1. EMAIL — Send AI-composed emails
   endpoint: email-command | method: POST | body: { prompt, history? }
   Resolves customer names to emails from CRM. Crafts + sends HTML emails via Gmail.

2. INVOICE — Create/manage invoices
   endpoint: clawd-bot/invoice-command | method: POST | body: { prompt, history? }
   Creates invoices, sends them, marks paid, etc.

3. CUSTOMER — CRUD customers
   endpoint: customer-scheduler | method: POST | body: { prompt, history? }
   Add, update, search, delete customers.

4. WEB DEV — Generate websites via v0
   endpoint: clawd-bot/generate-website | method: POST | body: { prompt, customer_id? }
   Builds landing pages, websites. Returns preview_url and edit_url.

5. IMAGE GEN (BANANA) — Generate images
   endpoint: clawd-bot/generate-content | method: POST | body: { prompt, provider: "nano-banana" }
   Returns { url } with the generated image.

6. CALENDAR — Manage calendar events
   endpoint: clawd-bot/calendar-command | method: POST | body: { prompt, history? }

7. MEETING — Create/manage meetings
   endpoint: clawd-bot/meeting-command | method: POST | body: { prompt, history? }

8. SMM — Social media management
   endpoint: clawd-bot/smm-command | method: POST | body: { prompt, profile: "STU25", history? }

9. CALENDLY — Availability management
   endpoint: clawd-bot/availability-command | method: POST | body: { prompt, history? }

10. CUSTOM-U — Customer portal links
    endpoint: custom-u-scheduler | method: POST | body: { prompt, history? }

YOUR TASK:
Parse the user's complex request into an ordered list of steps. Each step calls one module.
Steps can reference results from previous steps using {{step_N_result}}.

RESPOND WITH JSON:
{
  "type": "plan",
  "summary": "Brief human-readable summary of what you'll do",
  "steps": [
    {
      "step": 1,
      "module": "image_gen|email|invoice|webdev|customer|calendar|meeting|smm|calendly|custom",
      "endpoint": "the endpoint path",
      "method": "POST",
      "body": { ... },
      "description": "Human-readable description",
      "depends_on": null or step number,
      "inject": { "field_name": "step_N.result_field" }
    }
  ]
}

RULES:
- Always resolve customer names to IDs from the list above
- Order steps logically (e.g., generate image BEFORE sending email that includes it)
- If a step depends on a previous result, set depends_on and inject fields
- If something is unclear, respond: { "type": "clarify", "message": "..." }
- Keep descriptions concise
- For image gen followed by email, inject the image URL into the email prompt

IMPORTANT: You must output ONLY valid JSON. No markdown, no commentary.`

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

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      if (geminiRes.status === 429) {
        return new Response(JSON.stringify({ type: 'message', message: '⏳ Rate limited. Please try again in a moment.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`AI error (${geminiRes.status}): ${errText.slice(0, 200)}`)
    }

    const geminiData = await geminiRes.json()
    let rawText = geminiData.choices?.[0]?.message?.content || ''

    // Parse JSON from response
    let parsed: any
    try {
      let cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
      const jsonStart = cleaned.search(/[\{\[]/)
      if (jsonStart === -1) throw new Error('No JSON')
      const startChar = cleaned[jsonStart]
      const endChar = startChar === '[' ? ']' : '}'
      const jsonEnd = cleaned.lastIndexOf(endChar)
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1)
        .replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
      parsed = JSON.parse(cleaned)
    } catch (_e) {
      parsed = { type: 'message', message: rawText || 'Could not parse the request.' }
    }

    // If clarification or message, return directly
    if (parsed.type === 'clarify' || parsed.type === 'message') {
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Execute the plan step by step
    if (parsed.type === 'plan' && Array.isArray(parsed.steps)) {
      const results: any[] = []
      const stepResults: Record<number, any> = {}

      for (const step of parsed.steps) {
        try {
          let body = step.body || {}

          // Inject results from previous steps
          if (step.inject && typeof step.inject === 'object') {
            for (const [field, ref] of Object.entries(step.inject)) {
              if (typeof ref === 'string') {
                const match = ref.match(/^step_(\d+)\.(.+)$/)
                if (match) {
                  const refStep = parseInt(match[1])
                  const refField = match[2]
                  const prevResult = stepResults[refStep]
                  if (prevResult) {
                    // Navigate nested fields
                    const val = refField.split('.').reduce((obj: any, key: string) => obj?.[key], prevResult)
                    if (val !== undefined) {
                      if (field === 'prompt' && typeof body.prompt === 'string') {
                        body.prompt = body.prompt.replace(`{{step_${refStep}_result}}`, String(val))
                      } else {
                        body[field] = val
                      }
                    }
                  }
                }
              }
            }
          }

          const url = `${SUPABASE_URL}/functions/v1/${step.endpoint}`
          const fetchOpts: RequestInit = {
            method: step.method || 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-bot-secret': BOT_SECRET,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
            },
          }
          if (step.method !== 'GET') {
            fetchOpts.body = JSON.stringify(body)
          }

          const res = await fetch(url, fetchOpts)
          const data = await res.json()
          const resultData = data?.data || data

          stepResults[step.step] = resultData

          results.push({
            step: step.step,
            module: step.module,
            success: res.ok,
            description: step.description,
            data: resultData,
            error: res.ok ? undefined : (resultData?.error || data?.error || 'Unknown error'),
          })
        } catch (e: any) {
          results.push({
            step: step.step,
            module: step.module,
            success: false,
            description: step.description,
            error: e.message,
          })
          stepResults[step.step] = { error: e.message }
        }
      }

      return new Response(JSON.stringify({
        type: 'executed',
        summary: parsed.summary,
        steps: results,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('[ai-assistant] error:', e)
    return new Response(JSON.stringify({ type: 'message', message: `Error: ${e.message}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
