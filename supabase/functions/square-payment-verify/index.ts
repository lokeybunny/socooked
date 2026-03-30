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

    const results: Array<{ email: string; action: string }> = [];

    // ─── Check cancelling subscriptions whose period has ended ───
    const { data: cancellingSubs } = await supabaseAdmin
      .from('guru_subscriptions')
      .select('*')
      .eq('status', 'cancelling');

    for (const sub of (cancellingSubs || [])) {
      const periodEndsAt = (sub.meta as any)?.period_ends_at;
      if (!periodEndsAt) continue;

      const endDate = new Date(periodEndsAt);
      if (new Date() < endDate) continue; // Still has time left

      console.log(`[payment-verify] Subscription period ended for ${sub.email}, deactivating...`);

      // Mark as fully cancelled
      await supabaseAdmin
        .from('guru_subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', sub.id);

      // Deactivate landing pages
      const { data: pages } = await supabaseAdmin
        .from('lw_landing_pages')
        .select('id, client_user_id, client_name')
        .eq('email', sub.email)
        .eq('is_active', true);

      for (const page of (pages || [])) {
        await supabaseAdmin
          .from('lw_landing_pages')
          .update({ is_active: false })
          .eq('id', page.id);

        if (page.client_user_id) {
          await supabaseAdmin.auth.admin.updateUserById(page.client_user_id, {
            ban_duration: '876000h',
          });
          console.log(`[payment-verify] Banned user ${page.client_user_id} (subscription period ended)`);
        }
      }

      // Send final deactivation email
      try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        await fetch(`${SUPABASE_URL}/functions/v1/gmail-api?action=send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            to: sub.email,
            subject: 'Your Subscription Has Ended',
            body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
              <h2 style="color:#0f172a;">Subscription Ended</h2>
              <p>Hi,</p>
              <p>Your subscription billing period has ended. Your landing page and dashboard access have now been deactivated.</p>
              <p>If you'd like to reactivate, please visit <a href="https://socooked.lovable.app/warren-guru">our signup page</a> or contact us.</p>
              <br/><p>Best regards,</p>
              <p><strong>Warren A Thompson</strong><br/>STU25<br/><a href="mailto:warren@stu25.com">warren@stu25.com</a></p>
            </div>`,
          }),
        });
      } catch (e) { console.error('[payment-verify] Deactivation email failed:', e); }

      // Telegram notification
      try {
        const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
        const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: TELEGRAM_CHAT_ID,
              text: `❌ *Subscription Period Ended*\n📧 ${sub.email}\n🔒 Landing page deactivated & login banned`,
              parse_mode: 'Markdown',
            }),
          });
        }
      } catch { /* ignore */ }

      results.push({ email: sub.email, action: 'period_ended_deactivated' });
    }

    // ─── Check pending trial subscriptions ───
    if (!pendingSubs || pendingSubs.length === 0) {
      return new Response(JSON.stringify({ message: 'No expired trials found', cancelling_processed: (cancellingSubs || []).length, results }), {
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
        .select('id, client_user_id, client_name')
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

      // 4. Send payment reminder email to the user via Gmail API
      const displayName = sub.full_name || (pages?.[0] as any)?.client_name || sub.email.split('@')[0];
      try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const reminderHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <h2 style="color: #0f172a;">⏰ Your Free Trial Has Ended</h2>
  
  <p>Hi ${displayName},</p>
  
  <p>We hope you enjoyed your <strong>24-hour free trial</strong> and got a taste of what automated deal-finding can do for your business.</p>
  
  <p>During your trial, you received up to <strong>5 exclusive distressed property leads</strong> — imagine what you could do with <strong>50 leads every single week</strong>, delivered automatically to your dashboard.</p>
  
  <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px;">
    <p style="margin: 0; font-weight: bold; color: #92400e;">⚠️ Your account has been paused</p>
    <p style="margin: 8px 0 0 0; color: #78350f;">Your landing page and dashboard access are currently inactive. Complete your payment to reactivate everything instantly.</p>
  </div>
  
  <h3 style="color: #0f172a;">Here's what you're missing:</h3>
  <ul>
    <li>🏠 <strong>50 distressed property leads/week</strong> — matched to YOUR buying criteria</li>
    <li>📧 <strong>Automatic email reports</strong> delivered to your inbox</li>
    <li>📊 <strong>Full CRM dashboard</strong> — manage your pipeline, call notes, recordings</li>
    <li>🤖 <strong>AI-powered lead scoring</strong> — know which deals to chase first</li>
    <li>📞 <strong>Automated outbound calls</strong> via AI voice agent</li>
  </ul>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://socooked.lovable.app/warren-guru" 
       style="background: #2563eb; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
      💰 Complete Payment & Start Making Money
    </a>
  </div>
  
  <p style="color: #64748b; font-size: 13px;">Introductory rate: <strong>$599/month</strong> for the first 90 days (then $799/month).</p>
  
  <p>Don't let another week of deals pass you by. Your competitors are already using automation — it's time to level up.</p>
  
  <br/>
  <p>Let's get you making money,</p>
  <p><strong>Warren A Thompson</strong><br/>
  Warren Guru — Automated Land Wholesaling<br/>
  <a href="mailto:warren@stu25.com">warren@stu25.com</a></p>
</div>`;

        const gmailRes = await fetch(
          `${SUPABASE_URL}/functions/v1/gmail-api?action=send`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              to: sub.email,
              subject: '⏰ Your Free Trial Ended — Complete Payment to Keep Making Money',
              body: reminderHtml,
            }),
          }
        );
        
        if (gmailRes.ok) {
          console.log(`[payment-verify] ✅ Payment reminder sent to ${sub.email}`);
        } else {
          console.error(`[payment-verify] Gmail send failed:`, await gmailRes.text());
        }

        // Log communication
        await supabaseAdmin.from('communications').insert({
          type: 'email',
          direction: 'outbound',
          to_address: sub.email,
          subject: 'Trial Expired — Payment Reminder',
          body: reminderHtml,
          status: 'sent',
          provider: 'square-payment-verify',
          metadata: { source: 'trial-expiry', subscription_id: sub.id },
        });
      } catch (emailErr) {
        console.error('[payment-verify] Reminder email failed:', emailErr);
      }

      // 5. Send notification via Telegram
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
                text: `⏰ *Trial Expired*\n📧 ${sub.email}\n❌ Landing page deactivated & login disabled\n📩 Payment reminder email sent\nNo payment received within 24h.`,
                parse_mode: 'Markdown',
              }),
            }
          );
        }
      } catch { /* ignore telegram errors */ }

      results.push({ email: sub.email, action: 'deactivated_and_reminded' });
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
