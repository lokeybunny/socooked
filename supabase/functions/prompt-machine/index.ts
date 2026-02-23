const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret',
}

const SYSTEM_PROMPT = `You are a senior-level AI Website Prompt Engineer specialized in v0.dev prompts.

You create high-tech, creative, minimalist, fun websites that are professional and conversion-optimized.

You ALWAYS include rich visual descriptions using DESIGN-INTENT language. Every section must describe the visual scene, mood, lighting, composition, and atmosphere — as if directing a photographer or art director.

CRITICAL IMAGERY RULES:
- NEVER use "Generate an image of..." or "AI GENERATE" or "MANDATORY AI GENERATE" command language.
- NEVER reference placeholder.svg, unsplash.com, pexels.com, or any stock photo URLs.
- Instead, DESCRIBE the visual as a creative direction: "A cinematic wide shot of a confident barber mid-fade, warm Edison bulb lighting, shallow depth of field"
- Every hero, feature card, gallery item, and about section MUST have a vivid design-intent visual description.
- ALL imagery descriptions MUST depict real, diverse people smiling — matched to the business niche. For example, a barbershop site should describe smiling clients in barber chairs, a dental site should describe smiling patients, etc.
- Every image description must specify smiling people relevant to the niche. No generic objects — always people, always smiling, always contextually appropriate.

BRAND DNA DEFAULTS (apply unless overridden):
- White or near-white backgrounds
- Dark text (#111 or similar)
- Bold headline typography (Inter, Plus Jakarta Sans, or similar modern sans-serif)
- Rounded corners (border-radius: 12-16px)
- Soft shadows (box-shadow with low opacity)
- Generous whitespace (py-20+ between sections)
- Subtle motion (fade-in on scroll, hover lifts)

Your output MUST contain these sections in this exact order:
1) PROJECT OVERVIEW
2) DESIGN STYLE
3) COLOR & TYPOGRAPHY
4) IMAGERY RULES
5) LAYOUT STRUCTURE
6) COMPONENTS
7) INTERACTIONS & ANIMATIONS
8) RESPONSIVENESS
9) TECH STACK
10) OUTPUT REQUIREMENTS

The IMAGERY RULES section must mandate design-intent visual descriptions for every section — no commands, no placeholders, no stock URLs.

The TECH STACK section must specify: React, Next.js (App Router), Tailwind CSS, shadcn/ui components.

Output ONLY:
V0_PROMPT:
<the full prompt>

CRITICAL: The VERY LAST LINE of every generated prompt MUST be exactly:
"Replace all image placeholders with real people smiling within this niche."

No commentary. No explanation. No preamble. Just V0_PROMPT: followed by the prompt, ending with the replacement directive above.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Auth check
  const botSecret = req.headers.get('x-bot-secret')
  const expectedSecret = Deno.env.get('BOT_SECRET')
  const authHeader = req.headers.get('authorization')

  // Allow bot secret OR valid supabase auth (for admin UI calls)
  const isBotAuth = botSecret && expectedSecret && botSecret === expectedSecret
  const isSupabaseAuth = authHeader?.startsWith('Bearer ')

  if (!isBotAuth && !isSupabaseAuth) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const openRouterKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!openRouterKey) {
    return new Response(JSON.stringify({ success: false, error: 'OPENROUTER_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const {
      user_request,
      business_name,
      niche,
      style_tags,
      must_include_pages,
      cta,
      notes,
      auto_submit,
      customer_id,
      category,
      chat_id: existingChatId,
    } = body

    if (!user_request) {
      return new Response(JSON.stringify({ success: false, error: 'user_request is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const defaultBrand = Deno.env.get('DEFAULT_BRAND_NAME') || 'Warren'

    // Build user message
    const userMessage = [
      `USER REQUEST: ${user_request}`,
      `BUSINESS NAME: ${business_name || defaultBrand}`,
      niche ? `NICHE: ${niche}` : 'NICHE: (infer from user request)',
      style_tags?.length ? `STYLE TAGS: ${style_tags.join(', ')}` : '',
      must_include_pages?.length ? `MUST INCLUDE PAGES: ${must_include_pages.join(', ')}` : '',
      cta ? `PRIMARY CTA: ${cta}` : '',
      notes ? `ADDITIONAL NOTES: ${notes}` : '',
    ].filter(Boolean).join('\n')

    const model = 'anthropic/claude-sonnet-4'

    // Call OpenRouter
    const generate = async (strict = false): Promise<string> => {
      const messages = [
        { role: 'system', content: strict
          ? SYSTEM_PROMPT + '\n\nCRITICAL: Your response MUST start with exactly "V0_PROMPT:" on the first line. No other text before it.'
          : SYSTEM_PROMPT
        },
        { role: 'user', content: userMessage },
      ]

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://stu25.com',
          'X-Title': 'STU25 Prompt Machine',
        },
        body: JSON.stringify({ model, messages, max_tokens: 4000 }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`OpenRouter error ${res.status}: ${errText}`)
      }

      const data = await res.json()
      return data.choices?.[0]?.message?.content || ''
    }

    // First attempt
    let rawOutput = await generate(false)

    // Validate starts with V0_PROMPT:
    if (!rawOutput.trim().startsWith('V0_PROMPT:')) {
      console.log('[prompt-machine] Retry: output did not start with V0_PROMPT:')
      rawOutput = await generate(true)
    }

    // Extract the prompt (everything after "V0_PROMPT:")
    let v0Prompt = rawOutput.trim()
    if (v0Prompt.startsWith('V0_PROMPT:')) {
      v0Prompt = v0Prompt.slice('V0_PROMPT:'.length).trim()
    }

    // Force-append the mandatory closing directive if not already present
    const mandatoryClosing = 'Replace all image placeholders with real people smiling within this niche.'
    if (!v0Prompt.trim().endsWith(mandatoryClosing)) {
      v0Prompt = v0Prompt.trimEnd() + '\n\n' + mandatoryClosing
    }

    // Auto-submit to v0-designer if requested
    let v0Result = null
    if (auto_submit) {
      console.log('[prompt-machine] Auto-submitting to v0-designer...')
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const botSecretValue = Deno.env.get('BOT_SECRET')!

      const v0Payload: Record<string, unknown> = {
        prompt: v0Prompt,
        category: category || 'digital-services',
      }
      if (customer_id) v0Payload.customer_id = customer_id
      if (existingChatId) v0Payload.chat_id = existingChatId

      const v0Res = await fetch(`${supabaseUrl}/functions/v1/v0-designer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bot-secret': botSecretValue,
          'x-internal': 'true',
        },
        body: JSON.stringify(v0Payload),
      })

      if (v0Res.ok) {
        v0Result = await v0Res.json()
        console.log('[prompt-machine] v0-designer response:', JSON.stringify(v0Result).substring(0, 300))
      } else {
        const errText = await v0Res.text()
        console.error('[prompt-machine] v0-designer error:', v0Res.status, errText)
        v0Result = { success: false, error: `v0-designer error: ${v0Res.status}`, details: errText }
      }
    }

    const result: Record<string, unknown> = {
      success: true,
      data: {
        v0_prompt: v0Prompt,
        image_strategy: {
          mode: 'placeholder',
          placeholder_pattern: '/placeholder.svg?height={h}&width={w}',
        },
      },
      meta: {
        model,
        generated_at: new Date().toISOString(),
      },
    }

    if (v0Result) {
      (result.data as Record<string, unknown>).v0_designer = v0Result

    }

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[prompt-machine] Error:', msg)
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
