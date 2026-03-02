import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions'
const BANANA2_MODEL = 'google/gemini-3-pro-image-preview'

function detectPlatform(url: string): string {
  if (!url) return 'unknown'
  const u = url.toLowerCase()
  if (u.includes('x.com') || u.includes('twitter.com')) return 'x'
  if (u.includes('instagram.com')) return 'instagram'
  if (u.includes('tiktok.com')) return 'tiktok'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  return 'web'
}

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fail(error: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  if (!LOVABLE_API_KEY) return fail('LOVABLE_API_KEY not configured', 500)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json()
    const { action } = body

    // ─── GET TOP 10 META (last 10 min) ───
    if (action === 'top_meta') {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

      const { data: recentMentions } = await supabase
        .from('meta_mentions')
        .select('category_normalized')
        .gte('created_at', tenMinAgo)

      // Aggregate
      const counts: Record<string, number> = {}
      for (const m of (recentMentions || [])) {
        const cat = m.category_normalized
        counts[cat] = (counts[cat] || 0) + 1
      }

      const totalMentions = Object.values(counts).reduce((a, b) => a + b, 0)

      // Get green status from hourly summaries
      const { data: todaySummaries } = await supabase
        .from('hourly_meta_summary')
        .select('category, is_green, hours_today, bullish_score')
        .gte('date_hour', todayStart)

      const greenMap: Record<string, { is_green: boolean; hours_today: number; bullish_score: number }> = {}
      for (const s of (todaySummaries || [])) {
        if (!greenMap[s.category] || s.bullish_score > greenMap[s.category].bullish_score) {
          greenMap[s.category] = { is_green: s.is_green, hours_today: s.hours_today, bullish_score: s.bullish_score }
        }
      }

      const top10 = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([category, mentions], i) => ({
          rank: i + 1,
          category,
          mentions,
          pct: totalMentions > 0 ? Math.round((mentions / totalMentions) * 100) : 0,
          is_green: greenMap[category]?.is_green || false,
          hours_today: greenMap[category]?.hours_today || 0,
          bullish_score: greenMap[category]?.bullish_score || 0,
        }))

      return ok({ top10, total_mentions: totalMentions, last_updated: new Date().toISOString() })
    }

    // ─── GENERATE NARRATIVE ───
    if (action === 'generate') {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

      // 1. Gather top metas (prioritize green)
      const { data: recentMentions } = await supabase
        .from('meta_mentions')
        .select('category_normalized')
        .gte('created_at', tenMinAgo)

      const counts: Record<string, number> = {}
      for (const m of (recentMentions || [])) {
        counts[m.category_normalized] = (counts[m.category_normalized] || 0) + 1
      }

      const { data: greenSummaries } = await supabase
        .from('hourly_meta_summary')
        .select('category, is_green, bullish_score')
        .eq('is_green', true)
        .order('bullish_score', { ascending: false })
        .limit(10)

      const greenCategories = (greenSummaries || []).map(s => s.category)
      const topMetas = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([cat]) => cat)

      // 2. Gather X feed tweets (last 2 hours)
      const { data: tweets } = await supabase
        .from('x_feed_tweets')
        .select('tweet_text, author_username, likes, retweets, source_url')
        .gte('created_at', twoHoursAgo)
        .order('likes', { ascending: false })
        .limit(20)

      // 3. Gather market cap alerts (last 2 hours)
      const { data: alerts } = await supabase
        .from('market_cap_alerts')
        .select('token_name, token_symbol, milestone, milestone_value, ca_address, source_url, audit_data')
        .gte('created_at', twoHoursAgo)
        .order('milestone_value', { ascending: false })
        .limit(15)

      // 4. Gather research findings (last 2 hours)
      const { data: findings } = await supabase
        .from('research_findings')
        .select('title, summary, source_url, raw_data')
        .eq('category', 'x')
        .gte('created_at', twoHoursAgo)
        .order('created_at', { ascending: false })
        .limit(10)

      // Build context — include full source URLs for AI to reference
      const tweetSources = (tweets || []).map(t => ({
        text: t.tweet_text?.slice(0, 200),
        user: t.author_username,
        engagement: `${t.likes || 0}❤ ${t.retweets || 0}🔁`,
        url: t.source_url || '',
      }))

      const findingSources = (findings || []).map(f => ({
        title: f.title,
        summary: f.summary?.slice(0, 150),
        url: f.source_url || '',
      }))

      // Collect all available source URLs
      const allSourceUrls = [
        ...tweetSources.filter(t => t.url).map(t => ({ url: t.url, platform: detectPlatform(t.url), label: `@${t.user}` })),
        ...findingSources.filter(f => f.url).map(f => ({ url: f.url, platform: detectPlatform(f.url), label: f.title?.slice(0, 30) || 'Source' })),
      ]

      const context = {
        green_metas: greenCategories,
        top_metas: topMetas,
        recent_tweets: tweetSources,
        market_cap_alerts: (alerts || []).map(a => ({
          name: a.token_name || 'Unknown',
          symbol: a.token_symbol || '???',
          milestone: a.milestone,
          value: a.milestone_value,
          ca: a.ca_address?.slice(0, 12) + '...',
          has_ig: !!(a.audit_data as any)?.has_instagram,
          has_tt: !!(a.audit_data as any)?.has_tiktok,
        })),
        findings: findingSources,
        available_source_urls: allSourceUrls.slice(0, 10),
      }

      // 5. Call AI to generate narrative
      const aiRes = await fetch(LOVABLE_AI_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: `You are DEV AI — the ultimate Pump.fun narrative strategist for 2026. You blend real-time market intelligence into VIRAL, LAUNCH-READY token narratives.

Your job: Synthesize the provided context (trending metas, live tweets, market cap alerts, research findings) into ONE ultra-viral Pump.fun-native narrative.

Rules:
- Prioritize GREEN (bullish) meta categories heavily
- Reference real recently pumping tokens as inspiration (without direct copy)
- Inject absurd humor, meme energy, and FOMO phrasing
- Feel authentic to Pump.fun degen culture
- Include a source suggestion (X, Instagram, TikTok, or organic)
- You MUST pick 1-3 real source URLs from the available_source_urls in the context. These are REAL links from X, Instagram, TikTok, or other platforms. Always include at least one source_url.
- Create an image generation prompt that would make a hilarious, viral meme coin image

You MUST use the generate_narrative tool to return structured output.`
            },
            {
              role: 'user',
              content: `Here is the current market context:\n\n${JSON.stringify(context, null, 2)}\n\nGenerate the BEST possible narrative for a Pump.fun dev to launch RIGHT NOW.`
            }
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'generate_narrative',
              description: 'Generate a launch-ready Pump.fun narrative',
              parameters: {
                type: 'object',
                properties: {
                  token_name: { type: 'string', description: 'Creative token name' },
                  token_symbol: { type: 'string', description: 'Token ticker symbol (3-6 chars, uppercase)' },
                  narrative: { type: 'string', description: 'The full narrative description (2-4 sentences, viral, funny, degen)' },
                  source_platform: { type: 'string', enum: ['X', 'Instagram', 'TikTok', 'Organic', 'Cross-Platform'], description: 'Best platform source for this narrative' },
                  source_reasoning: { type: 'string', description: 'Why this source/platform makes sense' },
                  meta_categories: { type: 'array', items: { type: 'string' }, description: 'Meta categories this narrative aligns with' },
                  image_prompt: { type: 'string', description: 'Detailed image generation prompt for a hilarious Pump.fun meme coin style image. Include: over-the-top cartoon style, glowing eyes, laser beams, absurd props, money raining, degen energy, neon colors, maximum virality, funny expressions, 2026 meme aesthetic' },
                  confidence: { type: 'number', description: 'Confidence score 1-10' },
                  deploy_window: { type: 'string', description: 'When to deploy: NOW, 1-2h, 2-4h, etc.' },
                  risk_level: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], description: 'Risk assessment' },
                  source_urls: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, platform: { type: 'string', enum: ['x', 'instagram', 'tiktok', 'youtube', 'web'] }, label: { type: 'string' } }, required: ['url', 'platform', 'label'] }, description: 'Pick 1-3 real source URLs from the available_source_urls in the context that inspired this narrative' },
                },
                required: ['token_name', 'token_symbol', 'narrative', 'source_platform', 'meta_categories', 'image_prompt', 'confidence', 'deploy_window', 'source_urls'],
                additionalProperties: false,
              }
            }
          }],
          tool_choice: { type: 'function', function: { name: 'generate_narrative' } },
        }),
      })

      if (!aiRes.ok) {
        const errText = await aiRes.text()
        console.error('[dev-ai] AI error:', aiRes.status, errText)
        if (aiRes.status === 429) return fail('Rate limited — try again in a moment', 429)
        if (aiRes.status === 402) return fail('Credits depleted — add funds', 402)
        return fail(`AI generation failed: ${errText.slice(0, 200)}`, 502)
      }

      const aiData = await aiRes.json()
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0]

      if (!toolCall?.function?.arguments) {
        return fail('AI did not return structured narrative', 502)
      }

      let narrative: any
      try {
        narrative = JSON.parse(toolCall.function.arguments)
      } catch {
        return fail('Failed to parse AI narrative output', 502)
      }

      // Save to DB
      const { data: saved } = await supabase.from('dev_ai_narratives').insert({
        token_name: narrative.token_name,
        token_symbol: narrative.token_symbol,
        narrative: narrative.narrative,
        source_platform: narrative.source_platform,
        image_prompt: narrative.image_prompt,
        meta_categories: narrative.meta_categories,
        context_data: {
          ...narrative,
          context_snapshot: {
            green_metas: greenCategories,
            top_metas: topMetas,
            tweet_count: tweets?.length || 0,
            alert_count: alerts?.length || 0,
          },
        },
      }).select('id').single()

      return ok({
        id: saved?.id,
        ...narrative,
      })
    }

    // ─── GENERATE IMAGE ───
    if (action === 'generate_image') {
      const { narrative_id, prompt } = body

      if (!prompt) return fail('prompt is required')

      const aiRes = await fetch(LOVABLE_AI_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: BANANA2_MODEL,
          messages: [{ role: 'user', content: prompt }],
          modalities: ['image', 'text'],
        }),
      })

      if (!aiRes.ok) {
        const errText = await aiRes.text()
        if (aiRes.status === 429) return fail('Rate limited', 429)
        if (aiRes.status === 402) return fail('Credits depleted', 402)
        return fail(`Image gen failed: ${errText.slice(0, 200)}`, 502)
      }

      const aiData = await aiRes.json()
      let imageUrl: string | null = null
      let base64Data: string | null = null

      // Parse response for image
      const msgContent = aiData.choices?.[0]?.message
      if (msgContent?.images && Array.isArray(msgContent.images)) {
        for (const img of msgContent.images) {
          if (img.type === 'image_url' && img.image_url?.url) {
            if (img.image_url.url.startsWith('data:')) {
              base64Data = img.image_url.url
            } else {
              imageUrl = img.image_url.url
            }
            break
          }
        }
      }

      // Fallback content check
      if (!imageUrl && !base64Data) {
        const content = msgContent?.content
        if (Array.isArray(content)) {
          for (const part of content) {
            if (part.type === 'image_url' && part.image_url?.url) {
              if (part.image_url.url.startsWith('data:')) base64Data = part.image_url.url
              else imageUrl = part.image_url.url
              break
            }
          }
        }
      }

      // Upload base64 to storage
      if (base64Data && !imageUrl) {
        const match = base64Data.match(/^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/)
        if (match) {
          const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
          const raw = match[2]
          const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0))
          const fileName = `dev-ai/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`
          const { data: upload, error: uploadErr } = await supabase.storage
            .from('content-uploads')
            .upload(fileName, bytes, { contentType: `image/${match[1]}`, upsert: true })
          if (!uploadErr && upload) {
            const { data: publicUrl } = supabase.storage.from('content-uploads').getPublicUrl(fileName)
            imageUrl = publicUrl.publicUrl
          }
        }
      }

      if (!imageUrl) {
        return fail('Image generation did not return an image', 502)
      }

      // Update narrative with image URL
      if (narrative_id) {
        await supabase.from('dev_ai_narratives')
          .update({ image_url: imageUrl })
          .eq('id', narrative_id)
      }

      return ok({ image_url: imageUrl })
    }

    // ─── GET HISTORY ───
    if (action === 'history') {
      const { data: narratives } = await supabase
        .from('dev_ai_narratives')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      return ok({ narratives: narratives || [] })
    }

    return fail('Unknown action. Use: top_meta, generate, generate_image, history', 404)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[dev-ai] error:', msg)
    return fail(msg, 500)
  }
})
