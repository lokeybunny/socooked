// NOWPayments — in-app Solana payment (no redirect).
// Actions:
//   default / 'create': creates a /v1/payment and returns pay_address, pay_amount, payment_id
//   'status': returns { payment_status } for a given payment_id
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const NP = 'https://api.nowpayments.io/v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('NOWPAYMENTS_API_KEY');
    if (!apiKey) {
      return json({ error: 'NOWPAYMENTS_API_KEY not configured' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'create');

    if (action === 'status') {
      const id = String(body?.payment_id || '');
      if (!id) return json({ error: 'payment_id required' }, 400);
      const r = await fetch(`${NP}/payment/${encodeURIComponent(id)}`, {
        headers: { 'x-api-key': apiKey },
      });
      const txt = await r.text();
      let data: any = null; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
      if (!r.ok) return json({ error: 'nowpayments_error', status: r.status, data }, 502);
      return json({
        payment_id: data.payment_id,
        payment_status: data.payment_status,
        actually_paid: data.actually_paid,
        pay_amount: data.pay_amount,
        outcome_amount: data.outcome_amount,
      });
    }

    // create payment
    const price_amount = Number(body?.price_amount) || 500;
    const price_currency = String(body?.price_currency || 'usd').toLowerCase();
    const order_id = String(body?.order_id || `wgba-${Date.now()}`);
    const order_description = String(body?.order_description || 'Warren Guru Bundler Academy — VIP Access');

    const payload = {
      price_amount,
      price_currency,
      pay_currency: 'sol',
      order_id,
      order_description,
      ipn_callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/nowpayments-ipn`,
      is_fee_paid_by_user: false,
    };

    const r = await fetch(`${NP}/payment`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const txt = await r.text();
    let data: any = null; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
    if (!r.ok) return json({ error: 'nowpayments_error', status: r.status, data }, 502);

    return json({
      payment_id: data.payment_id,
      pay_address: data.pay_address,
      pay_amount: data.pay_amount,
      pay_currency: data.pay_currency,
      price_amount: data.price_amount,
      price_currency: data.price_currency,
      order_id: data.order_id,
      expiration_estimate_date: data.expiration_estimate_date,
      network: data.network,
    });
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
