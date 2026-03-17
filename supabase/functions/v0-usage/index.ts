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
    const billingRes = await fetch('https://api.v0.dev/v1/user/billing', {
      headers: { 'Authorization': `Bearer ${v0Key}` },
    })

    if (!billingRes.ok) {
      const errText = await billingRes.text()
      console.error(`[v0-usage] Billing API error: ${billingRes.status} ${errText}`)
      return new Response(JSON.stringify({ error: `V0 billing API error: ${billingRes.status}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const billing = await billingRes.json()

    return new Response(JSON.stringify({
      success: true,
      data: {
        remaining_credits: Number(billing.remaining || 0),
        credit_limit: Number(billing.limit || 0),
        reset_at: billing.reset || null,
        billing_type: billing.billingType || null,
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
