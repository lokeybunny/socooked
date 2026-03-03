/**
 * Moralis Light Audit
 * 
 * Triggered on every new market_cap_alerts INSERT.
 * Does a quick metadata-only fetch + RugCheck bundle check.
 * If j7tracker is found → triggers full moralis-audit automatically.
 * If bundled (insiders detected) → marks verdict as red.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const MORALIS_API_KEY = Deno.env.get('MORALIS_API_KEY')
    if (!MORALIS_API_KEY) throw new Error('MORALIS_API_KEY not configured')

    const body = await req.json()
    const record = body.record || body
    const ca_address = record.ca_address
    const alert_id = record.id

    if (!ca_address || !alert_id) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no ca_address or id' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[light-audit] Checking ${ca_address} (alert: ${alert_id})`)

    // Parallel fetch: Moralis metadata + RugCheck report
    const moralisHeaders = { 'X-API-Key': MORALIS_API_KEY, 'Accept': 'application/json' }
    
    const [metaRes, rugcheckRes] = await Promise.all([
      fetch(
        `https://solana-gateway.moralis.io/token/mainnet/${ca_address}/metadata`,
        { headers: moralisHeaders }
      ).catch(() => null),
      fetch(
        `https://api.rugcheck.xyz/v1/tokens/${ca_address}/report/summary`
      ).catch(() => null),
    ])

    const meta = metaRes?.ok ? await metaRes.json() : null
    const rugcheck = rugcheckRes?.ok ? await rugcheckRes.json() : null

    if (!meta && !rugcheck) {
      console.log(`[light-audit] No data for ${ca_address}, skipping`)
      return new Response(JSON.stringify({ skipped: true, reason: 'no data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const description = (meta?.description || '').toLowerCase()

    // Legacy j7tracker detection from metadata (now called LORE)
    const hasJ7Tracker = description.includes('j7tracker')

    // Detect Instagram & TikTok
    const hasInstagram = !!(
      meta?.links?.instagram ||
      description.includes('instagram.com') ||
      description.includes('ig:') ||
      description.includes('instagram:')
    )
    const hasTikTok = !!(
      meta?.links?.tiktok ||
      description.includes('tiktok.com') ||
      description.includes('tiktok:')
    )

    // RugCheck data
    const rugcheckScore = rugcheck?.score_normalised ?? null
    const rugcheckRisks = rugcheck?.risks || []
    const lpLockedPct = rugcheck?.lpLockedPct ?? null

    // Determine bundle/insider verdict from RugCheck
    // Score < 30 is very risky, < 50 is caution
    let rugVerdict: string | null = null
    if (rugcheckScore !== null) {
      if (rugcheckScore < 30) rugVerdict = 'red'
      else if (rugcheckScore < 50) rugVerdict = 'yellow'
      else rugVerdict = 'green'
    }

    // Update the alert with light audit findings
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const auditData: Record<string, unknown> = {
      has_instagram: hasInstagram,
      has_tiktok: hasTikTok,
      light_audit: true,
      rugcheck_score: rugcheckScore,
      rugcheck_risks: rugcheckRisks.map((r: any) => `${r.name}: ${r.value || r.description}`),
      lp_locked_pct: lpLockedPct,
      rug_verdict: rugVerdict,
    }

    const updateData: Record<string, unknown> = {
      is_j7tracker: hasJ7Tracker,
      token_name: meta?.name || null,
      token_symbol: meta?.symbol || null,
      audit_data: auditData,
    }

    // If RugCheck says red → set verdict to red immediately
    if (rugVerdict === 'red') {
      updateData.verdict = 'red'
      updateData.audit_status = 'completed'
    }

    await supabase.from('market_cap_alerts').update(updateData).eq('id', alert_id)

    console.log(`[light-audit] ${ca_address}: j7=${hasJ7Tracker}, ig=${hasInstagram}, tt=${hasTikTok}, rugScore=${rugcheckScore}, rugVerdict=${rugVerdict}`)

    // If legacy j7tracker found → trigger full audit
    if (hasJ7Tracker) {
      console.log(`[light-audit] LORE (legacy j7tracker) detected! Triggering full audit for ${ca_address}`)

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || ''

      await fetch(`${supabaseUrl}/functions/v1/moralis-audit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ ca_address, alert_id }),
      })
    }

    // Trigger LORE check for TP5+ alerts (engagement-based detection)
    const milestone = record.milestone || ''
    const tpMatch = milestone.match(/^TP#(\d+)/)
    if (tpMatch && parseInt(tpMatch[1], 10) >= 5) {
      console.log(`[light-audit] TP5+ detected, triggering LORE check for ${ca_address}`)
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || ''

      fetch(`${supabaseUrl}/functions/v1/lore-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ ca_address, alert_id }),
      }).catch(e => console.error('[light-audit] LORE check trigger error:', e.message))
    }

    return new Response(JSON.stringify({
      ca_address,
      alert_id,
      is_j7tracker: hasJ7Tracker,
      has_instagram: hasInstagram,
      has_tiktok: hasTikTok,
      rugcheck_score: rugcheckScore,
      rug_verdict: rugVerdict,
      lp_locked_pct: lpLockedPct,
      full_audit_triggered: hasJ7Tracker,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[light-audit] error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
