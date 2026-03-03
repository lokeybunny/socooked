import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Get non-KOL records missing token_name that haven't been marked as unresolvable
  const { data: records } = await supabase
    .from('market_cap_alerts')
    .select('id, ca_address, token_symbol, token_name')
    .is('token_name', null)
    .eq('is_kol', false)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!records || records.length === 0) {
    return new Response(JSON.stringify({ message: 'No records to backfill' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Dedupe CAs to minimize API calls
  const caCache = new Map<string, { symbol: string | null; name: string | null }>()
  let updated = 0
  let unresolvable = 0

  for (const record of records) {
    const ca = record.ca_address
    if (!caCache.has(ca)) {
      try {
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`)
        if (dexRes.ok) {
          const dexData = await dexRes.json()
          const pair = dexData?.pairs?.[0]
          if (pair?.baseToken) {
            caCache.set(ca, { symbol: pair.baseToken.symbol || null, name: pair.baseToken.name || null })
          } else {
            caCache.set(ca, { symbol: null, name: null })
          }
        } else {
          caCache.set(ca, { symbol: null, name: null })
        }
        await new Promise(r => setTimeout(r, 150))
      } catch {
        caCache.set(ca, { symbol: null, name: null })
      }
    }

    const resolved = caCache.get(ca)!
    if (resolved.name) {
      const updatePayload: Record<string, string> = { token_name: resolved.name }
      if (resolved.symbol && !record.token_symbol) updatePayload.token_symbol = resolved.symbol
      const { error } = await supabase.from('market_cap_alerts').update(updatePayload).eq('id', record.id)
      if (!error) updated++
    } else {
      // Mark as "unknown" so we don't retry forever
      await supabase.from('market_cap_alerts').update({ token_name: 'Unknown' }).eq('id', record.id)
      unresolvable++
    }
  }

  return new Response(JSON.stringify({ total: records.length, updated, unresolvable }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
