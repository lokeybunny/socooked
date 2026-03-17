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
    const billingData = billing?.data ?? {}

    const remainingRaw =
      billing?.remaining ??
      billingData?.remaining ??
      billingData?.credits?.remaining ??
      billingData?.balance ??
      billingData?.purchasedCredits ??
      null

    const limitRaw =
      billing?.limit ??
      billingData?.limit ??
      billingData?.credits?.limit ??
      null

    const resetRaw = billing?.reset ?? billingData?.reset ?? null
    const billingTypeRaw = billing?.billingType ?? billingData?.billingType ?? null

    return new Response(JSON.stringify({
      success: true,
      data: {
        remaining_credits: remainingRaw == null ? null : Number(remainingRaw),
        credit_limit: limitRaw == null ? null : Number(limitRaw),
        reset_at: resetRaw,
        billing_type: billingTypeRaw,
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
