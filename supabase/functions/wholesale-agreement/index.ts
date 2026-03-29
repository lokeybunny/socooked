const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
            content: 'You are a real estate wholesale contract attorney. Generate professional, legally-formatted wholesale purchase agreements. Output only the final contract text — no commentary, no preamble, no instructions. CRITICAL: Never use placeholder brackets like [NAME], [ADDRESS], [DATE], [AMOUNT], [BUYER], [SELLER], [STATE], or any bracket notation. Every field must contain actual data from the user prompt. If data is missing, write N/A as plain text. The contract must be ready to print and sign immediately.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
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
