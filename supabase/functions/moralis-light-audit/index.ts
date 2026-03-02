/**
 * Moralis Light Audit
 * 
 * Triggered on every new market_cap_alerts INSERT.
 * Does a quick metadata-only fetch to check for j7tracker, Instagram, TikTok.
 * If j7tracker is found → triggers full moralis-audit automatically.
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

    // Accept both direct calls and trigger payloads
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

    // Quick metadata-only fetch
    const headers = { 'X-API-Key': MORALIS_API_KEY, 'Accept': 'application/json' }
    const metaRes = await fetch(
      `https://solana-gateway.moralis.io/token/mainnet/${ca_address}/metadata`,
      { headers }
    ).catch(() => null)

    const meta = metaRes?.ok ? await metaRes.json() : null

    if (!meta) {
      console.log(`[light-audit] No metadata for ${ca_address}, skipping`)
      return new Response(JSON.stringify({ skipped: true, reason: 'no metadata' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const description = (meta.description || '').toLowerCase()

    // Detect j7tracker
    const hasJ7Tracker = description.includes('j7tracker')

    // Detect Instagram & TikTok
    const hasInstagram = !!(
      meta.links?.instagram ||
      description.includes('instagram.com') ||
      description.includes('ig:') ||
      description.includes('instagram:')
    )
    const hasTikTok = !!(
      meta.links?.tiktok ||
      description.includes('tiktok.com') ||
      description.includes('tiktok:')
    )

    // Update the alert with light audit findings
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const updateData: Record<string, unknown> = {
      is_j7tracker: hasJ7Tracker,
      token_name: meta.name || null,
      token_symbol: meta.symbol || null,
      audit_data: {
        has_instagram: hasInstagram,
        has_tiktok: hasTikTok,
        light_audit: true,
      },
    }

    await supabase.from('market_cap_alerts').update(updateData).eq('id', alert_id)

    console.log(`[light-audit] ${ca_address}: j7=${hasJ7Tracker}, ig=${hasInstagram}, tt=${hasTikTok}`)

    // If j7tracker found → trigger full audit
    if (hasJ7Tracker) {
      console.log(`[light-audit] j7tracker detected! Triggering full audit for ${ca_address}`)

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

    return new Response(JSON.stringify({
      ca_address,
      alert_id,
      is_j7tracker: hasJ7Tracker,
      has_instagram: hasInstagram,
      has_tiktok: hasTikTok,
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
