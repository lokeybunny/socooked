import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface CreditInfo {
  name: string
  balance: string | null
  unit: string
  status: 'ok' | 'low' | 'error' | 'unknown'
  details?: string
  raw?: unknown
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Auth: staff JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const results: CreditInfo[] = []

  // ─── OpenRouter ───────────────────────────────────────
  try {
    const orKey = Deno.env.get('OPENROUTER_API_KEY')
    if (orKey) {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { 'Authorization': `Bearer ${orKey}` },
      })
      if (res.ok) {
        const data = await res.json()
        const credits = data.data?.limit_remaining ?? data.data?.usage ?? null
        const limit = data.data?.limit ?? null
        const usage = data.data?.usage ?? 0
        results.push({
          name: 'OpenRouter',
          balance: limit != null ? `$${((limit - usage) / 100).toFixed(2)}` : (credits != null ? `$${(credits / 100).toFixed(2)}` : null),
          unit: 'USD credits',
          status: credits != null && credits < 100 ? 'low' : 'ok',
          details: limit != null ? `Used $${(usage / 100).toFixed(2)} of $${(limit / 100).toFixed(2)} limit` : undefined,
          raw: data.data,
        })
      } else {
        results.push({ name: 'OpenRouter', balance: null, unit: 'USD', status: 'error', details: `API returned ${res.status}` })
      }
    } else {
      results.push({ name: 'OpenRouter', balance: null, unit: 'USD', status: 'unknown', details: 'API key not configured' })
    }
  } catch (e) {
    results.push({ name: 'OpenRouter', balance: null, unit: 'USD', status: 'error', details: e.message })
  }

  // ─── Higgsfield ──────────────────────────────────────
  try {
    const hfKey = Deno.env.get('HIGGSFIELD_API_KEY')
    const hfSecret = Deno.env.get('HIGGSFIELD_CLIENT_SECRET')
    if (hfKey && hfSecret) {
      const res = await fetch('https://platform.higgsfield.ai/account/credits', {
        headers: { 'Authorization': `Key ${hfKey}:${hfSecret}` },
      })
      if (res.ok) {
        const data = await res.json()
        const credits = data.credits ?? data.balance ?? data.remaining ?? null
        results.push({
          name: 'Higgsfield AI',
          balance: credits != null ? `${credits}` : null,
          unit: 'credits',
          status: credits != null && credits < 10 ? 'low' : (credits != null ? 'ok' : 'unknown'),
          raw: data,
        })
      } else {
        // Try alternate endpoint
        const res2 = await fetch('https://platform.higgsfield.ai/v1/credits', {
          headers: { 'Authorization': `Key ${hfKey}:${hfSecret}` },
        })
        if (res2.ok) {
          const data2 = await res2.json()
          results.push({
            name: 'Higgsfield AI',
            balance: data2.credits?.toString() ?? data2.balance?.toString() ?? null,
            unit: 'credits',
            status: 'ok',
            raw: data2,
          })
        } else {
          results.push({ name: 'Higgsfield AI', balance: null, unit: 'credits', status: 'error', details: `Balance API not available (${res.status})` })
        }
      }
    } else {
      results.push({ name: 'Higgsfield AI', balance: null, unit: 'credits', status: 'unknown', details: 'API key not configured' })
    }
  } catch (e) {
    results.push({ name: 'Higgsfield AI', balance: null, unit: 'credits', status: 'error', details: e.message })
  }

  // ─── Deepgram ────────────────────────────────────────
  try {
    const dgKey = Deno.env.get('DEEPGRAM_API_KEY')
    if (dgKey) {
      // First get projects
      const projRes = await fetch('https://api.deepgram.com/v1/projects', {
        headers: { 'Authorization': `Token ${dgKey}` },
      })
      if (projRes.ok) {
        const projData = await projRes.json()
        const projectId = projData.projects?.[0]?.project_id
        if (projectId) {
          const balRes = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/balances`, {
            headers: { 'Authorization': `Token ${dgKey}` },
          })
          if (balRes.ok) {
            const balData = await balRes.json()
            const bal = balData.balances?.[0]
            results.push({
              name: 'Deepgram',
              balance: bal?.amount != null ? `$${bal.amount.toFixed(2)}` : null,
              unit: 'USD',
              status: bal?.amount != null && bal.amount < 5 ? 'low' : 'ok',
              details: bal?.units_used != null ? `${bal.units_used} units used` : undefined,
              raw: bal,
            })
          } else {
            results.push({ name: 'Deepgram', balance: null, unit: 'USD', status: 'error', details: `Balance API: ${balRes.status}` })
          }
        } else {
          results.push({ name: 'Deepgram', balance: null, unit: 'USD', status: 'error', details: 'No project found' })
        }
      } else {
        results.push({ name: 'Deepgram', balance: null, unit: 'USD', status: 'error', details: `Projects API: ${projRes.status}` })
      }
    } else {
      results.push({ name: 'Deepgram', balance: null, unit: 'USD', status: 'unknown', details: 'API key not configured' })
    }
  } catch (e) {
    results.push({ name: 'Deepgram', balance: null, unit: 'USD', status: 'error', details: e.message })
  }

  // ─── V0 (v0.dev) ─────────────────────────────────────
  try {
    const v0Key = Deno.env.get('V0_API_KEY')
    if (v0Key) {
      // v0 doesn't have a public credits API — report as configured
      results.push({
        name: 'V0 Designer',
        balance: null,
        unit: 'credits',
        status: 'ok',
        details: 'API key configured — check v0.dev dashboard for balance',
      })
    } else {
      results.push({ name: 'V0 Designer', balance: null, unit: 'credits', status: 'unknown', details: 'API key not configured' })
    }
  } catch (e) {
    results.push({ name: 'V0 Designer', balance: null, unit: 'credits', status: 'error', details: e.message })
  }

  // ─── Lovable AI (Nano Banana) ────────────────────────
  try {
    const lovableKey = Deno.env.get('LOVABLE_API_KEY')
    if (lovableKey) {
      results.push({
        name: 'Lovable AI (Nano Banana)',
        balance: null,
        unit: 'Cloud credits',
        status: 'ok',
        details: 'Uses Cloud & AI balance — check Lovable settings',
      })
    } else {
      results.push({ name: 'Lovable AI (Nano Banana)', balance: null, unit: 'Cloud credits', status: 'unknown', details: 'API key not configured' })
    }
  } catch (e) {
    results.push({ name: 'Lovable AI (Nano Banana)', balance: null, unit: 'Cloud credits', status: 'error', details: e.message })
  }

  // ─── Telegram Bot ────────────────────────────────────
  try {
    const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    if (tgToken) {
      results.push({
        name: 'Telegram Bot',
        balance: null,
        unit: 'free',
        status: 'ok',
        details: 'Free API — no credits needed',
      })
    } else {
      results.push({ name: 'Telegram Bot', balance: null, unit: 'free', status: 'unknown', details: 'Bot token not configured' })
    }
  } catch (e) {
    results.push({ name: 'Telegram Bot', balance: null, unit: 'free', status: 'error', details: e.message })
  }

  // ─── RingCentral ─────────────────────────────────────
  try {
    const rcId = Deno.env.get('RINGCENTRAL_CLIENT_ID')
    if (rcId) {
      results.push({
        name: 'RingCentral',
        balance: null,
        unit: 'subscription',
        status: 'ok',
        details: 'Subscription-based — check RingCentral dashboard',
      })
    } else {
      results.push({ name: 'RingCentral', balance: null, unit: 'subscription', status: 'unknown', details: 'Not configured' })
    }
  } catch (e) {
    results.push({ name: 'RingCentral', balance: null, unit: 'subscription', status: 'error', details: e.message })
  }

  // ─── Instagram ───────────────────────────────────────
  try {
    const igToken = Deno.env.get('INSTAGRAM_ACCESS_TOKEN')
    if (igToken) {
      results.push({
        name: 'Instagram API',
        balance: null,
        unit: 'free',
        status: 'ok',
        details: 'Meta API — rate-limited, no credits',
      })
    } else {
      results.push({ name: 'Instagram API', balance: null, unit: 'free', status: 'unknown', details: 'Access token not configured' })
    }
  } catch (e) {
    results.push({ name: 'Instagram API', balance: null, unit: 'free', status: 'error', details: e.message })
  }

  return new Response(JSON.stringify({ success: true, data: results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
