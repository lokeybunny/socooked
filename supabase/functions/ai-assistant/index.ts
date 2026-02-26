/**
 * AI Assistant — Multi-module orchestrator
 * Decomposes complex natural language prompts into sequential actions
 * across all CRM modules (email, invoice, web dev, image gen, customer, etc.)
 * Calls each function DIRECTLY (no double-hop through clawd-bot).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// Direct function call helper — calls edge functions with proper auth
const FUNCTION_ALIASES: Record<string, string> = {
  'clawd-bot/generate-content': 'nano-banana/generate',
  'clawd-bot/invoice-command': 'invoice-scheduler',
  'clawd-bot/email-command': 'email-command',
  'image-generator': 'nano-banana/generate',
  'nano-banana': 'nano-banana/generate',
}

function safeLower(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizeFunctionPath(step: any): string {
  const raw = String(step?.function || step?.endpoint || '').trim()
  let fnPath = raw
    .replace(/^\/+functions\/v1\//i, '')
    .replace(/^functions\/v1\//i, '')
    .replace(/^\/+/, '')

  const normalized = safeLower(fnPath).replace(/\/+$/, '')
  if (FUNCTION_ALIASES[normalized]) return FUNCTION_ALIASES[normalized]

  const moduleName = safeLower(step?.module)
  if (!normalized || normalized === 'unknown') {
    if (moduleName === 'image_gen' || moduleName === 'image') return 'nano-banana/generate'
    if (moduleName === 'invoice') return 'invoice-scheduler'
    if (moduleName === 'email') return 'email-command'
  }

  return fnPath || 'unknown'
}

function getValueAtPath(obj: any, path: string): unknown {
  return path.split('.').reduce((acc: any, key: string) => acc?.[key], obj)
}

function extractImageUrl(result: any): string | null {
  return result?.output_url || result?.url || result?.image_url || result?.preview_url || null
}

function interpolateStepRefs(value: any, stepResults: Record<number, any>): any {
  if (typeof value === 'string') {
    return value.replace(/\{\{step_(\d+)_result(?:\.([a-zA-Z0-9_.-]+))?\}\}/g, (_m, stepStr, fieldPath) => {
      const prev = stepResults[Number(stepStr)]
      if (!prev) return ''
      if (!fieldPath) return JSON.stringify(prev)
      if (fieldPath === 'url') {
        return extractImageUrl(prev) || String(getValueAtPath(prev, fieldPath) || '')
      }
      const resolved = getValueAtPath(prev, fieldPath)
      if (resolved === undefined || resolved === null) return ''
      if (typeof resolved === 'object') return JSON.stringify(resolved)
      return String(resolved)
    })
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateStepRefs(item, stepResults))
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = interpolateStepRefs(v, stepResults)
    }
    return out
  }

  return value
}

async function callFunction(
  supabaseUrl: string,
  functionPath: string,
  body: Record<string, unknown>,
  botSecret: string,
  serviceRoleKey: string,
): Promise<{ ok: boolean; data: any; status: number }> {
  const url = `${supabaseUrl}/functions/v1/${functionPath}`
  console.log(`[ai-assistant] calling ${functionPath}`, JSON.stringify(body).slice(0, 200))

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-secret': botSecret,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  console.log(`[ai-assistant] ${functionPath} → ${res.status} ${text.slice(0, 300)}`)

  let data: any
  try {
    data = JSON.parse(text)
  } catch (_e) {
    data = { error: text.slice(0, 500) }
  }

  return { ok: res.ok, data: data?.data || data, status: res.status }
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
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const BOT_SECRET = Deno.env.get('BOT_SECRET')!
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // Fetch CRM context
    const { data: customers } = await supabase.from('customers')
      .select('id, full_name, email, phone, company, status, category')
      .order('created_at', { ascending: false }).limit(30)

    const customerCtx = (customers || []).map((c: any) =>
      `- ${c.full_name} (email: ${c.email || 'none'}, id: ${c.id}, category: ${c.category || 'other'})`
    ).join('\n')

    const primaryCustomer = (customers || []).find((c: any) => {
      const full = (c.full_name || '').toLowerCase()
      if (!full) return false
      if (prompt.toLowerCase().includes(full)) return true
      const nameTokens = full.split(/\s+/).filter((t: string) => t.length > 2)
      return nameTokens.some((token: string) => prompt.toLowerCase().includes(token))
    }) || null

    const systemPrompt = `You are CLAWDbot AI Assistant — an autonomous orchestrator that decomposes complex multi-step requests into sequential API actions across ALL CRM modules.

CURRENT CRM CUSTOMERS:
${customerCtx || 'No customers yet.'}

AVAILABLE MODULES (each calls a DIRECT edge function):

1. IMAGE_GEN — Generate images via Nano Banana (Gemini)
   function: nano-banana/generate
   body: { prompt: "descriptive image prompt", provider: "nano-banana" }
   Returns: { url: "...", content_asset_id: "..." }

2. EMAIL — Send AI-composed emails via Gmail
   function: email-command
   body: { prompt: "natural language email instruction" }
   The prompt should be self-contained, e.g.: "Send Warren Thompson (warren@email.com) an email with subject 'Your Website is Ready' telling him his website has been completed. Attach this image: [URL]"

3. INVOICE — Create/send invoices
   function: invoice-scheduler
   body: { prompt: "natural language invoice instruction" }
   e.g.: "Create a $500 invoice for Warren Thompson for web design services and send it"

4. WEBSITE — Generate websites via v0
   function: prompt-machine
   body: { prompt: "website description", auto_submit: true }
   Returns: { preview_url, edit_url }

5. CUSTOMER — CRUD customers
   function: customer-scheduler
   body: { prompt: "natural language customer instruction" }

6. CALENDAR — Manage calendar events
   function: clawd-bot/calendar-command
   body: { prompt: "..." }

7. MEETING — Create/manage meetings
   function: clawd-bot/meeting-command
   body: { prompt: "..." }

8. SMM — Social media management
   function: smm-api
   body: { action: "create-post", message: "...", platforms: ["x"] }

9. CALENDLY — Availability management
   function: clawd-bot/availability-command
   body: { prompt: "..." }

YOUR TASK:
Parse the user's complex request into an ordered list of steps. Each step calls one module.

RESPOND WITH JSON ONLY:
{
  "type": "plan",
  "summary": "Brief human-readable summary of the full workflow",
  "steps": [
    {
      "step": 1,
      "module": "IMAGE_GEN",
      "function": "nano-banana/generate",
      "body": { "prompt": "A guy laughing at the camera, photorealistic", "provider": "nano-banana" },
      "description": "Generate image of laughing man",
      "depends_on": null
    },
    {
      "step": 2,
      "module": "INVOICE",
      "function": "invoice-scheduler",
      "body": { "prompt": "Create a $500 invoice for Warren Thompson for web design services and mark it as paid" },
      "description": "Create $500 paid invoice for Warren",
      "depends_on": null
    },
    {
      "step": 3,
      "module": "EMAIL",
      "function": "email-command",
      "body": { "prompt": "Send Warren Thompson an email expressing how happy you are about receiving his payment. The subject should be 'Payment Received - Thank You!'. Include a fun image in the email." },
      "description": "Email Warren about the payment with the image",
      "depends_on": 1,
      "inject_from_step": { "1": "image_url" }
    }
  ]
}

CRITICAL RULES:
- Resolve customer names to IDs/emails from the customer list above
- Order steps logically (generate image BEFORE email that uses it)
- For IMAGE_GEN: use function "nano-banana/generate" only
- For INVOICE: use function "invoice-scheduler" only
- For EMAIL: use function "email-command" only
- Never use legacy endpoints like clawd-bot/generate-content or clawd-bot/invoice-command
- For IMAGE_GEN: the prompt should be descriptive (what the image looks like)
- For EMAIL: the prompt must be FULLY self-contained with recipient name, subject, and message intent — do NOT reference other steps
- For INVOICE: the prompt must include customer name, amount, and what it's for
- If depends_on is set and inject_from_step references a step, the orchestrator will inject the image URL or result automatically
- If something is unclear, respond: { "type": "clarify", "message": "..." }
- Output ONLY valid JSON. No markdown, no commentary, no code fences.`

    console.log('[ai-assistant] calling Gemini with prompt:', prompt.slice(0, 200))

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
      console.error('[ai-assistant] Gemini error:', geminiRes.status, errText.slice(0, 300))
      if (geminiRes.status === 429) {
        return new Response(JSON.stringify({ type: 'message', message: '⏳ Rate limited. Try again in a moment.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`AI error (${geminiRes.status}): ${errText.slice(0, 200)}`)
    }

    const geminiData = await geminiRes.json()
    let rawText = geminiData.choices?.[0]?.message?.content || ''
    console.log('[ai-assistant] Gemini plan:', rawText.slice(0, 500))

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
      console.error('[ai-assistant] JSON parse failed, raw:', rawText.slice(0, 500))
      parsed = { type: 'message', message: rawText || 'Could not parse the request.' }
    }

    if (parsed.type === 'clarify' || parsed.type === 'message') {
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Execute the plan step by step (DIRECT function calls)
    if (parsed.type === 'plan' && Array.isArray(parsed.steps)) {
      const results: any[] = []
      const stepResults: Record<number, any> = {}

      for (const step of parsed.steps) {
        try {
          const stepNumber = typeof step.step === 'number' ? step.step : (results.length + 1)
          let body = interpolateStepRefs({ ...(step.body || {}) }, stepResults)

          // Inject results from previous steps
          if (step.inject_from_step && typeof step.inject_from_step === 'object') {
            for (const [refStepStr, fieldHint] of Object.entries(step.inject_from_step)) {
              const refStep = parseInt(refStepStr)
              const prev = stepResults[refStep]
              if (prev) {
                const hinted = typeof fieldHint === 'string' ? getValueAtPath(prev, fieldHint) : undefined
                const hintedUrl = typeof hinted === 'string' ? hinted : null
                const imageUrl = hintedUrl || extractImageUrl(prev)

                if (imageUrl && typeof body.prompt === 'string') {
                  body.prompt = `${body.prompt}\n\nAttach/include this image: ${imageUrl}`
                }

                if (imageUrl) body.image_url = imageUrl
                if (prev.preview_url) body.preview_url = prev.preview_url
                if (prev.edit_url) body.edit_url = prev.edit_url
              }
            }
          }

          // Also handle legacy inject format
          if (step.inject && typeof step.inject === 'object') {
            for (const [field, ref] of Object.entries(step.inject)) {
              if (typeof ref === 'string') {
                const match = ref.match(/^step_(\d+)\.(.+)$/)
                if (match) {
                  const refStep = parseInt(match[1])
                  const refField = match[2]
                  const prev = stepResults[refStep]
                  if (prev) {
                    const val = getValueAtPath(prev, refField)
                    if (val !== undefined) body[field] = val
                  }
                }
              }
            }
          }

          const fnPath = normalizeFunctionPath(step)

          if (fnPath === 'nano-banana/generate' && !body.provider) {
            body.provider = 'nano-banana'
          }

          if (fnPath === 'email-command' && typeof body.prompt === 'string') {
            const promptLower = body.prompt.toLowerCase()
            const mentionsKnownCustomer = (customers || []).some((c: any) => {
              const full = (c.full_name || '').toLowerCase()
              return full && promptLower.includes(full)
            })
            const hasDirectEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(body.prompt)

            if (!mentionsKnownCustomer && !hasDirectEmail && primaryCustomer) {
              const recipientLabel = primaryCustomer.email
                ? `${primaryCustomer.full_name} (${primaryCustomer.email})`
                : `${primaryCustomer.full_name}`
              body.prompt = `Send this email to ${recipientLabel}. ${body.prompt}`
            }

            body.prompt = body.prompt
              .replace(/love taking (his|her|your) money/gi, 'express appreciation for receiving payment')
              .replace(/taking your money/gi, 'receiving your payment')
          }

          body = interpolateStepRefs(body, stepResults)

          const { ok: isOk, data: resultData, status } = await callFunction(
            SUPABASE_URL, fnPath, body, BOT_SECRET, SERVICE_KEY
          )

          stepResults[stepNumber] = resultData

          const nestedActionFailure = Array.isArray(resultData?.actions)
            ? resultData.actions.find((action: any) => action?.success === false)
            : null

          const explicitError =
            resultData?.error ||
            (resultData?.success === false ? (resultData?.error || 'Request failed') : undefined) ||
            (resultData?.type === 'clarify' ? resultData?.message : undefined) ||
            (nestedActionFailure?.error || undefined)

          const success = isOk && !explicitError

          results.push({
            step: stepNumber,
            module: step.module,
            success,
            description: step.description,
            data: resultData,
            error: success ? undefined : (explicitError || `HTTP ${status}`),
          })
        } catch (e: any) {
          const stepNumber = typeof step.step === 'number' ? step.step : (results.length + 1)
          console.error(`[ai-assistant] step ${stepNumber} error:`, e.message)
          results.push({
            step: stepNumber,
            module: step.module,
            success: false,
            description: step.description,
            error: e.message,
          })
          stepResults[stepNumber] = { error: e.message }
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
