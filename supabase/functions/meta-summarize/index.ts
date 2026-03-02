import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

    // Current hour label
    const dateHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString()

    // Get mentions from last hour
    const { data: recentMentions } = await supabase
      .from('meta_mentions')
      .select('category_normalized')
      .gte('created_at', oneHourAgo)

    if (!recentMentions || recentMentions.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No mentions in last hour' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Aggregate by category
    const hourCounts: Record<string, number> = {}
    for (const m of recentMentions) {
      const cat = m.category_normalized
      hourCounts[cat] = (hourCounts[cat] || 0) + 1
    }

    // Get existing summaries for today to calculate hours_today
    const { data: todaySummaries } = await supabase
      .from('hourly_meta_summary')
      .select('category, date_hour')
      .gte('date_hour', todayStart)

    // Count distinct hours per category today
    const hoursPerCategory: Record<string, Set<string>> = {}
    for (const s of (todaySummaries || [])) {
      if (!hoursPerCategory[s.category]) hoursPerCategory[s.category] = new Set()
      hoursPerCategory[s.category].add(s.date_hour)
    }

    // Upsert current hour summaries
    const upserts = Object.entries(hourCounts).map(([category, mentionsHour]) => {
      const existingHours = hoursPerCategory[category] || new Set()
      existingHours.add(dateHour) // Include current hour
      const hoursToday = existingHours.size
      const bullishScore = mentionsHour * hoursToday
      const isGreen = hoursToday >= 3

      return {
        date_hour: dateHour,
        category,
        mentions_hour: mentionsHour,
        hours_today: hoursToday,
        bullish_score: bullishScore,
        is_green: isGreen,
      }
    })

    // Delete existing entries for this hour, then insert fresh
    await supabase.from('hourly_meta_summary').delete().eq('date_hour', dateHour)
    const { error: insertErr } = await supabase.from('hourly_meta_summary').insert(upserts)
    if (insertErr) console.error('[meta-summarize] insert error:', insertErr)

    const greenCategories = upserts.filter(u => u.is_green).map(u => u.category)
    console.log(`[meta-summarize] Processed ${Object.keys(hourCounts).length} categories. Green: ${greenCategories.join(', ') || 'none'}`)

    return new Response(JSON.stringify({
      success: true,
      categories_processed: Object.keys(hourCounts).length,
      green_categories: greenCategories,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[meta-summarize] error:', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
