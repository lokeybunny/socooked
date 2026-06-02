// NOWPayments invoice creator — Solana only
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('NOWPAYMENTS_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'NOWPAYMENTS_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const price_amount = Number(body?.price_amount) || 500;
    const order_id = String(body?.order_id || `wgba-${Date.now()}`);
    const order_description = String(body?.order_description || 'Warren Guru Bundler Academy — Premium Membership');
    const origin = req.headers.get('origin') || 'https://warren.guru';

    const payload = {
      price_amount,
      price_currency: 'usd',
      pay_currency: 'sol',
      order_id,
      order_description,
      ipn_callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/nowpayments-ipn`,
      success_url: `${origin}/?payment=success&order=${encodeURIComponent(order_id)}`,
      cancel_url: `${origin}/?payment=cancel`,
      is_fee_paid_by_user: false,
    };

    const res = await fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'nowpayments_error', status: res.status, data }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      invoice_url: data.invoice_url,
      id: data.id,
      order_id: data.order_id,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
