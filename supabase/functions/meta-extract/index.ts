import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  if (!LOVABLE_API_KEY) {
    console.error('[meta-extract] LOVABLE_API_KEY not configured')
    return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json()
    const { message, message_id } = body
    console.log(`[meta-extract] Received message (len=${message?.length}): ${message?.slice(0, 80)}`)

    if (!message) {
      return new Response(JSON.stringify({ error: 'message is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Use AI to extract meta categories — simple JSON response, no tool_choice
    const aiRes = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content: `You are a Pump.fun memecoin meta category extractor. Given a Telegram message about crypto/memecoins or meta trending data, extract the meta category names mentioned.

Look for numbered lists, ranked items, or mentions of meta plays/categories. Extract the SHORT name of each meta (e.g. "Solana Surge", "Pump Fervor", "Pepeverse").

Return ONLY a valid JSON array of strings. Nothing else. Example: ["Solana Surge","Pump Fervor","Pepeverse"]
If no categories found, return: []`
          },
          { role: 'user', content: message }
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error('[meta-extract] AI error:', aiRes.status, errText.slice(0, 200))
      return new Response(JSON.stringify({ error: 'AI extraction failed' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const aiData = await aiRes.json()
    const rawContent = aiData.choices?.[0]?.message?.content || '[]'
    console.log(`[meta-extract] AI raw response: ${rawContent.slice(0, 300)}`)

    // Parse the JSON array from the response
    let categories: string[] = []
    try {
      // Strip markdown code fences if present
      const cleaned = rawContent.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      categories = JSON.parse(cleaned)
      if (!Array.isArray(categories)) categories = []
    } catch {
      console.error('[meta-extract] Failed to parse AI response as JSON:', rawContent.slice(0, 200))
      return new Response(JSON.stringify({ success: true, categories: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (categories.length === 0) {
      console.log('[meta-extract] No categories found in message')
      return new Response(JSON.stringify({ success: true, categories: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Insert each category as a separate mention
    const inserts = categories.map(cat => ({
      category_normalized: cat.toLowerCase().trim(),
      message_id: message_id || null,
      source_text_snippet: message.slice(0, 500),
      count: 1,
      telegram_channel_id: -1003804658600,
    }))

    const { error: insertErr } = await supabase.from('meta_mentions').insert(inserts)
    if (insertErr) console.error('[meta-extract] insert error:', insertErr)
    else console.log(`[meta-extract] ✅ Stored ${categories.length} categories: ${categories.join(', ')}`)

    return new Response(JSON.stringify({ success: true, categories }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[meta-extract] error:', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})