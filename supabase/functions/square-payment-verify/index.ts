import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SQUARE_BASE = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";

/**
 * Square Payment Verify — runs daily via pg_cron
 * 
 * Checks guru_subscriptions created > 24h ago that are still in 'pending' status.
 * Verifies with Square if payment completed. If not paid:
 *   1. Mark subscription as 'expired'
 *   2. Deactivate the associated landing page
 *   3. Ban the client's auth account
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const SQUARE_ACCESS_TOKEN = Deno.env.get('SQUARE_ACCESS_TOKEN');
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Find subscriptions older than 24h that are still pending (trial period expired)
    const { data: pendingSubs } = await supabaseAdmin
      .from('guru_subscriptions')
      .select('*')
      .eq('status', 'pending')
      .lt('created_at', twentyFourHoursAgo);

    if (!pendingSubs || pendingSubs.length === 0) {
      return new Response(JSON.stringify({ message: 'No expired trials found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: Array<{ email: string; action: string }> = [];

    for (const sub of pendingSubs) {
      // If there's a Square order ID, verify with Square
      let isPaid = false;

      if (sub.square_order_id && SQUARE_ACCESS_TOKEN) {
        try {
          const res = await fetch(`${SQUARE_BASE}/orders/${sub.square_order_id}`, {
            headers: {
              Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
              'Square-Version': SQUARE_VERSION,
            },
          });
          if (res.ok) {
            const data = await res.json();
            const state = data.order?.state;
            if (state === 'COMPLETED') isPaid = true;
          }
        } catch (err) {
          console.error(`Square order check failed for ${sub.square_order_id}:`, err);
        }
      }

      if (isPaid) {
        // Update to active if Square confirms payment
        await supabaseAdmin
          .from('guru_subscriptions')
          .update({ status: 'active', started_at: new Date().toISOString() })
          .eq('id', sub.id);
        results.push({ email: sub.email, action: 'activated' });
        continue;
      }

      // Not paid after 24h — deactivate everything
      console.log(`[payment-verify] Trial expired for ${sub.email}, deactivating...`);

      // 1. Mark subscription as expired
      await supabaseAdmin
        .from('guru_subscriptions')
        .update({ status: 'expired', cancelled_at: new Date().toISOString() })
        .eq('id', sub.id);

      // 2. Find and deactivate associated landing page
      const { data: pages } = await supabaseAdmin
        .from('lw_landing_pages')
        .select('id, client_user_id')
        .eq('email', sub.email)
        .eq('is_active', true);

      for (const page of (pages || [])) {
        await supabaseAdmin
          .from('lw_landing_pages')
          .update({ is_active: false })
          .eq('id', page.id);

        // 3. Ban the client user
        if (page.client_user_id) {
          await supabaseAdmin.auth.admin.updateUserById(page.client_user_id, {
            ban_duration: '876000h',
          });
          console.log(`[payment-verify] Banned user ${page.client_user_id}`);
        }
      }

      // Send notification via Telegram
      try {
        const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
        const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
          await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: `⏰ *Trial Expired*\n📧 ${sub.email}\n❌ Landing page deactivated & login disabled\nNo payment received within 24h.`,
                parse_mode: 'Markdown',
              }),
            }
          );
        }
      } catch { /* ignore telegram errors */ }

      results.push({ email: sub.email, action: 'deactivated' });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('square-payment-verify error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
