import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret',
}

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json()
    const { message, message_id } = body

    if (!message) {
      return new Response(JSON.stringify({ error: 'message is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Use AI to extract meta categories from the message
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
            content: `You are a Pump.fun memecoin meta category extractor. Given a Telegram message about crypto/memecoins, extract the meta categories mentioned.

Common 2026 Pump.fun meta categories include:
- cat-themed, dog-themed, goat meta, frog meta
- streamer/IRL live challenges
- charity/tip meta
- AI-agent coins
- celebrity-backed
- volume-bot meta
- prediction-market memes
- RWA-meme hybrids
- political memes
- anime/manga themed
- food/drink themed
- animal hybrids
- tech/science memes
- gaming/esports
- music/artist themed
- fashion/luxury
- nature/environment
- sports themed
- historical figures
- space/cosmic
- absurdist/shitpost

Return ONLY a JSON array of normalized category strings found in the message. If no clear meta categories are found, return an empty array. Normalize similar categories (e.g. "cats in hats" → "cat-themed", "goat coin" → "goat meta").

Example output: ["cat-themed", "AI-agent coins", "celebrity-backed"]`
          },
          { role: 'user', content: message }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'extract_categories',
            description: 'Extract meta categories from the message',
            parameters: {
              type: 'object',
              properties: {
                categories: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of normalized meta category names'
                }
              },
              required: ['categories'],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'extract_categories' } },
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error('[meta-extract] AI error:', aiRes.status, errText)
      return new Response(JSON.stringify({ error: 'AI extraction failed' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const aiData = await aiRes.json()
    let categories: string[] = []

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0]
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments)
        categories = args.categories || []
      } catch { /* ignore parse error */ }
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

    console.log(`[meta-extract] Extracted ${categories.length} categories: ${categories.join(', ')}`)

    return new Response(JSON.stringify({ success: true, categories }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[meta-extract] error:', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
