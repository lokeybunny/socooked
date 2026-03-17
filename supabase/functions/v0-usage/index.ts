const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const v0Key = Deno.env.get('V0_API_KEY')
  if (!v0Key) {
    return new Response(JSON.stringify({ error: 'V0_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const endDate = now.toISOString()

    let totalSpent = 0
    let messageCount = 0
    let imageCount = 0
    let eventCount = 0
    let cursor: string | null = null
    const limit = 150

    // Paginate through all usage events
    for (let page = 0; page < 20; page++) {
      let url = `https://api.v0.dev/v1/reports/usage?startDate=${encodeURIComponent(startOfMonth)}&endDate=${encodeURIComponent(endDate)}&limit=${limit}`
      if (cursor) url += `&starting_after=${encodeURIComponent(cursor)}`

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${v0Key}` },
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error(`[v0-usage] API error: ${res.status} ${errText}`)
        return new Response(JSON.stringify({ error: `V0 API error: ${res.status}` }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const data = await res.json()
      const events = data.data || []

      for (const event of events) {
        totalSpent += parseFloat(event.totalCost || '0')
        if (event.type === 'message') messageCount++
        if (event.type === 'image_generation') imageCount++
      }
      eventCount += events.length

      if (!data.pagination?.hasMore || events.length === 0) break
      cursor = events[events.length - 1]?.id || null
      if (!cursor) break
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        total_spent: Math.round(totalSpent * 100) / 100,
        message_count: messageCount,
        image_count: imageCount,
        event_count: eventCount,
        period_start: startOfMonth,
      },
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[v0-usage] Error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
