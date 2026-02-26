import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    console.log(`[invoice-cleanup] Deleting void invoices older than ${cutoff}`)

    const { data: stale, error: qErr } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('status', 'void')
      .lt('created_at', cutoff)
      .limit(200)

    if (qErr) throw new Error(qErr.message)
    if (!stale?.length) {
      console.log('[invoice-cleanup] No void invoices to clean.')
      return new Response(JSON.stringify({ cleaned: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ids = stale.map((i) => i.id)
    const { error: delErr } = await supabase
      .from('invoices')
      .delete()
      .in('id', ids)

    if (delErr) throw new Error(delErr.message)

    console.log(`[invoice-cleanup] Deleted ${ids.length} void invoices.`)

    await supabase.from('activity_log').insert({
      entity_type: 'invoice',
      action: 'deleted',
      meta: {
        name: `🧹 Auto-Cleanup: ${ids.length} void invoices removed`,
        message: `🧹 *Invoice Auto-Cleanup*\nRemoved *${ids.length}* void invoices older than 24 hours`,
      },
    })

    return new Response(JSON.stringify({ cleaned: ids.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[invoice-cleanup] error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
