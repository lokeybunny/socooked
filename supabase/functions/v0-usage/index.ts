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
    // Get current billing period usage (this month)
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const endDate = now.toISOString()

    const url = `https://api.v0.dev/v1/reports/usage?startDate=${encodeURIComponent(startOfMonth)}&endDate=${encodeURIComponent(endDate)}&limit=150`

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

    // Sum total cost this billing period
    let totalSpent = 0
    let messageCount = 0
    let imageCount = 0

    for (const event of events) {
      totalSpent += parseFloat(event.totalCost || '0')
      if (event.type === 'message') messageCount++
      if (event.type === 'image_generation') imageCount++
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        total_spent: Math.round(totalSpent * 100) / 100,
        message_count: messageCount,
        image_count: imageCount,
        event_count: events.length,
        period_start: startOfMonth,
        has_more: data.pagination?.hasMore || false,
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
