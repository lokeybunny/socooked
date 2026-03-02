/**
 * Moralis Solana Token Audit
 * 
 * Takes a CA address, fetches token data via Moralis API,
 * and returns a structured 15-point audit verdict.
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

    const { ca_address, alert_id } = await req.json()
    if (!ca_address) throw new Error('ca_address required')

    const headers = { 'X-API-Key': MORALIS_API_KEY, 'Accept': 'application/json' }
    const base = 'https://solana-gateway.moralis.io'

    // Parallel fetch: token metadata, token score, holders, pairs
    const [metaRes, scoreRes, holdersRes, pairsRes] = await Promise.all([
      fetch(`${base}/token/mainnet/${ca_address}/metadata`, { headers }).catch(() => null),
      fetch(`https://deep-index.moralis.io/api/v2.2/erc20/${ca_address}/token-score?chain=solana`, { headers }).catch(() => null),
      fetch(`${base}/token/mainnet/${ca_address}/top-holders`, { headers }).catch(() => null),
      fetch(`${base}/token/mainnet/${ca_address}/pairs`, { headers }).catch(() => null),
    ])

    const meta = metaRes?.ok ? await metaRes.json() : {}
    const scoreData = scoreRes?.ok ? await scoreRes.json() : {}
    const holdersData = holdersRes?.ok ? await holdersRes.json() : {}
    const pairsData = pairsRes?.ok ? await pairsRes.json() : {}

    // Extract key data
    const tokenScore = scoreData?.score ?? scoreData?.tokenScore ?? null
    const scoreMetrics = scoreData?.metrics || scoreData?.score_metrics || {}
    const topHolders = holdersData?.result || holdersData?.holders || holdersData || []
    const pairs = pairsData?.result || pairsData?.pairs || pairsData || []

    // Description check for j7tracker
    const description = (meta?.description || meta?.metaplex?.metadataUri || '').toLowerCase()
    const hasJ7Tracker = description.includes('j7tracker')

    // Social links
    const hasSocials = !!(meta?.links?.twitter || meta?.links?.telegram || meta?.links?.website ||
      description.includes('t.me/') || description.includes('twitter.com') || description.includes('x.com'))

    // Instagram & TikTok detection from metadata links + description
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

    // Mutable check
    const isMutable = meta?.isMutable ?? meta?.metaplex?.isMutable ?? null

    // Top holder concentration
    const topHoldersList = Array.isArray(topHolders) ? topHolders.slice(0, 10) : []
    const top10Pct = topHoldersList.reduce((sum: number, h: any) => sum + (parseFloat(h.percentage_relative_to_total_supply || h.percentage || '0')), 0)
    const top3Pct = topHoldersList.slice(0, 3).reduce((sum: number, h: any) => sum + (parseFloat(h.percentage_relative_to_total_supply || h.percentage || '0')), 0)
    const totalHolders = holdersData?.total || holdersData?.totalHolders || topHoldersList.length

    // Liquidity from pairs
    const mainPair = Array.isArray(pairs) ? pairs[0] : null
    const liquidityUsd = mainPair?.liquidity_usd || mainPair?.liquidityUsd || 0

    // Spam flag
    const isSpam = meta?.possibleSpam || meta?.possible_spam || false

    // FDV
    const fdv = meta?.fully_diluted_valuation || meta?.fdv || 0
    const mc = meta?.market_cap || meta?.marketCap || 0

    // Build audit checks
    const checks: Record<string, { status: string; detail: string }> = {}
    
    // 1. Token Score
    checks['token_score'] = {
      status: tokenScore !== null ? (tokenScore >= 70 ? 'green' : tokenScore >= 50 ? 'yellow' : 'red') : 'unknown',
      detail: tokenScore !== null ? `Score: ${tokenScore}/100` : 'Score unavailable',
    }

    // 2. Liquidity vs MC
    checks['liquidity'] = {
      status: liquidityUsd > 0 ? (liquidityUsd >= mc * 2 ? 'green' : liquidityUsd >= mc ? 'yellow' : 'red') : 'unknown',
      detail: `Liquidity: $${Number(liquidityUsd).toLocaleString()}`,
    }

    // 3. Top 10 holder concentration
    checks['top10_holders'] = {
      status: top10Pct > 30 ? 'red' : top10Pct > 20 ? 'yellow' : 'green',
      detail: `Top 10 hold ${top10Pct.toFixed(1)}%`,
    }

    // 4. Top 3 holder concentration
    checks['top3_holders'] = {
      status: top3Pct > 15 ? 'red' : top3Pct > 10 ? 'yellow' : 'green',
      detail: `Top 3 hold ${top3Pct.toFixed(1)}%`,
    }

    // 5. Total holders
    checks['holder_count'] = {
      status: totalHolders > 100 ? 'green' : totalHolders > 30 ? 'yellow' : 'red',
      detail: `${totalHolders} holders`,
    }

    // 6. Mutability
    checks['mutability'] = {
      status: isMutable === false ? 'green' : isMutable === true ? 'red' : 'unknown',
      detail: isMutable === false ? 'Immutable ✓' : isMutable === true ? 'Mutable ⚠️' : 'Unknown',
    }

    // 7. Social links
    checks['socials'] = {
      status: hasSocials ? 'green' : 'red',
      detail: hasSocials ? 'Socials found' : 'No socials',
    }

    // 8. j7tracker
    checks['j7tracker'] = {
      status: hasJ7Tracker ? 'green' : 'neutral',
      detail: hasJ7Tracker ? 'j7tracker verified ✓' : 'No j7tracker',
    }

    // 9. Spam flag
    checks['spam'] = {
      status: isSpam ? 'red' : 'green',
      detail: isSpam ? 'SPAM flagged ⚠️' : 'Not spam',
    }

    // 10. FDV vs MC
    checks['fdv_ratio'] = {
      status: fdv > 0 && mc > 0 ? (fdv / mc > 10 ? 'red' : fdv / mc > 5 ? 'yellow' : 'green') : 'unknown',
      detail: fdv > 0 && mc > 0 ? `FDV/MC ratio: ${(fdv / mc).toFixed(1)}x` : 'FDV data unavailable',
    }

    // Calculate overall verdict
    const redCount = Object.values(checks).filter(c => c.status === 'red').length
    const yellowCount = Object.values(checks).filter(c => c.status === 'yellow').length
    let verdict = 'green'
    let reason = 'Passes most checks'
    if (redCount >= 3) { verdict = 'red'; reason = `${redCount} red flags detected` }
    else if (redCount >= 1 || yellowCount >= 3) { verdict = 'yellow'; reason = `${redCount} red, ${yellowCount} yellow flags` }
    else { reason = 'Clean token profile' }

    const auditResult = {
      ca_address,
      token_name: meta?.name || meta?.symbol || '',
      token_symbol: meta?.symbol || '',
      checks,
      verdict,
      reason,
      is_j7tracker: hasJ7Tracker,
      has_instagram: hasInstagram,
      has_tiktok: hasTikTok,
      top_holders: topHoldersList.slice(0, 3).map((h: any) => ({
        address: h.owner || h.address || '',
        pct: parseFloat(h.percentage_relative_to_total_supply || h.percentage || '0'),
      })),
      raw: { meta, scoreData, totalHolders, liquidityUsd, fdv, mc },
    }

    // Update DB if alert_id provided
    if (alert_id) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )
      await supabase.from('market_cap_alerts').update({
        audit_status: 'completed',
        audit_data: auditResult,
        verdict,
        is_j7tracker: hasJ7Tracker,
        token_name: auditResult.token_name,
        token_symbol: auditResult.token_symbol,
      }).eq('id', alert_id)
    }

    return new Response(JSON.stringify(auditResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[moralis-audit] error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
