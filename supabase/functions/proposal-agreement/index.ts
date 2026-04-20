// Generates AI-drafted proposal text. Mirrors `wholesale-agreement` pattern.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { prompt } = await req.json()
    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured')

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content:
              'You are a senior proposal writer for a digital services / videography / web design / real estate firm. Generate clean, professional, ready-to-send client proposals. Output ONLY the final proposal text — no commentary, no preamble. Include sections: Executive Summary, Scope of Work, Deliverables, Timeline, Investment / Pricing (use the line items provided), Terms, Acceptance. NEVER use placeholder brackets like [NAME], [DATE], [AMOUNT] — use the real data from the prompt. If a value is missing, write N/A.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`AI gateway error: ${response.status} ${errText}`)
    }

    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content || ''

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
