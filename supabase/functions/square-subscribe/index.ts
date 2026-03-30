import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SQUARE_BASE = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";

async function squareFetch(
  path: string,
  token: string,
  body: Record<string, unknown>,
  method = "POST"
) {
  const res = await fetch(`${SQUARE_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Square API error:", JSON.stringify(data));
    throw new Error(`Square API error [${res.status}]: ${JSON.stringify(data)}`);
  }
  return data;
}

async function squareGet(path: string, token: string) {
  const res = await fetch(`${SQUARE_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Square GET error [${res.status}]: ${JSON.stringify(data)}`);
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SQUARE_ACCESS_TOKEN = Deno.env.get("SQUARE_ACCESS_TOKEN");
    if (!SQUARE_ACCESS_TOKEN) throw new Error("SQUARE_ACCESS_TOKEN not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const action = body.action || "create"; // default to original create behavior

    // ─── Get subscription status ───
    if (action === "status") {
      const { email } = body;
      if (!email) {
        return new Response(JSON.stringify({ error: "email required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: sub } = await sb
        .from("guru_subscriptions")
        .select("*")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!sub) {
        return new Response(JSON.stringify({ subscription: null, status: "none" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const subscriptionId = (sub.meta as any)?.subscription_id;
      let squareStatus = null;

      if (subscriptionId) {
        try {
          const res = await fetch(`${SQUARE_BASE}/subscriptions/${subscriptionId}`, {
            headers: {
              Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
              "Square-Version": SQUARE_VERSION,
            },
          });
          if (res.ok) {
            const data = await res.json();
            squareStatus = data.subscription?.status || null;
          }
        } catch { /* ignore */ }
      }

      return new Response(JSON.stringify({
        subscription: {
          id: sub.id,
          status: sub.status,
          plan: sub.plan,
          amount_cents: sub.amount_cents,
          started_at: sub.started_at,
          trial_ends_at: sub.trial_ends_at,
          cancelled_at: sub.cancelled_at,
          square_subscription_id: subscriptionId,
          square_status: squareStatus,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Cancel subscription ───
    if (action === "cancel") {
      const { email, landing_page_id } = body;
      if (!email) {
        return new Response(JSON.stringify({ error: "email required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find active subscription
      const { data: sub, error: subErr } = await sb
        .from("guru_subscriptions")
        .select("*")
        .eq("email", email)
        .in("status", ["active", "subscribed", "pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (subErr || !sub) {
        return new Response(JSON.stringify({ error: "No active subscription found for this email" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const subscriptionId = (sub.meta as any)?.subscription_id;
      const squareCustomerId = sub.square_customer_id;

      // Cancel on Square — by subscription_id if available
      if (subscriptionId) {
        try {
          const cancelRes = await fetch(`${SQUARE_BASE}/subscriptions/${subscriptionId}/cancel`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
              "Square-Version": SQUARE_VERSION,
            },
          });
          if (!cancelRes.ok) {
            const errData = await cancelRes.json();
            console.error("Square cancel error:", JSON.stringify(errData));
          } else {
            console.log(`[square-subscribe] Cancelled Square subscription ${subscriptionId}`);
          }
        } catch (e) {
          console.error("Square cancel request failed:", e);
        }
      } else if (squareCustomerId) {
        // Fallback: search for active subscriptions by customer ID
        try {
          const searchRes = await fetch(`${SQUARE_BASE}/subscriptions/search`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
              "Square-Version": SQUARE_VERSION,
            },
            body: JSON.stringify({
              query: {
                filter: {
                  customer_ids: [squareCustomerId],
                  location_ids: [],
                },
              },
            }),
          });
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const activeSubs = (searchData.subscriptions || []).filter(
              (s: any) => s.status === "ACTIVE" || s.status === "PENDING"
            );
            for (const activeSub of activeSubs) {
              try {
                await fetch(`${SQUARE_BASE}/subscriptions/${activeSub.id}/cancel`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
                    "Content-Type": "application/json",
                    "Square-Version": SQUARE_VERSION,
                  },
                });
                console.log(`[square-subscribe] Cancelled Square subscription ${activeSub.id} (found via customer search)`);
              } catch (e2) {
                console.error(`Failed to cancel sub ${activeSub.id}:`, e2);
              }
            }
          }
        } catch (e) {
          console.error("Square subscription search failed:", e);
        }
      } else {
        console.warn(`[square-subscribe] No subscription_id or square_customer_id found for ${email} — Square cancellation skipped`);
      }

      // Determine when the current billing period ends
      let periodEndsAt: string | null = null;

      // Try to get the subscription's charged_through_date from Square
      if (subscriptionId) {
        try {
          const subRes = await fetch(`${SQUARE_BASE}/subscriptions/${subscriptionId}`, {
            headers: {
              Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
              "Square-Version": SQUARE_VERSION,
            },
          });
          if (subRes.ok) {
            const subData = await subRes.json();
            periodEndsAt = subData.subscription?.charged_through_date || null;
          }
        } catch { /* ignore */ }
      }

      // Fallback: if no charged_through_date, use 30 days from now or started_at + 30 days
      if (!periodEndsAt) {
        const startDate = sub.started_at ? new Date(sub.started_at) : new Date();
        const now = new Date();
        // Calculate end of current billing cycle (monthly)
        const monthsSinceStart = Math.ceil(
          (now.getTime() - startDate.getTime()) / (30 * 24 * 60 * 60 * 1000)
        );
        const periodEnd = new Date(startDate);
        periodEnd.setDate(periodEnd.getDate() + monthsSinceStart * 30);
        periodEndsAt = periodEnd.toISOString();
      }

      // Update our DB — mark as cancelling, NOT cancelled yet
      // The user keeps access until periodEndsAt
      await sb
        .from("guru_subscriptions")
        .update({
          status: "cancelling",
          cancelled_at: new Date().toISOString(),
          meta: {
            ...(sub.meta as Record<string, unknown>),
            period_ends_at: periodEndsAt,
          },
        })
        .eq("id", sub.id);

      // DO NOT deactivate landing page or ban user yet — they keep access until period ends

      // Send cancellation confirmation email
      try {
        const formattedEnd = periodEndsAt
          ? new Date(periodEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : 'the end of your current billing period';

        await fetch(`${SUPABASE_URL}/functions/v1/gmail-api?action=send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            to: email,
            subject: "Your Subscription Cancellation Confirmation",
            body: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <h2 style="color: #0f172a;">Subscription Cancellation Confirmed</h2>
  <p>Hi,</p>
  <p>Your subscription has been cancelled. <strong>You will continue to have full access to your dashboard and leads until ${formattedEnd}.</strong></p>
  <p>After that date, your landing page and dashboard access will be deactivated.</p>
  <p>If you change your mind, please contact us before your access expires to reactivate.</p>
  <br/>
  <p>Best regards,</p>
  <p><strong>Warren A Thompson</strong><br/>
  STU25 — Web &amp; Social Media Services<br/>
  <a href="mailto:warren@stu25.com">warren@stu25.com</a></p>
</div>`,
          }),
        });
      } catch (emailErr) {
        console.error("[square-subscribe] Email failed:", emailErr);
      }

      // Telegram notification
      try {
        const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
        const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: TELEGRAM_CHAT_ID,
              text: `❌ *Subscription Cancelled*\n📧 ${email}\n🆔 ${subscriptionId || "N/A"}`,
              parse_mode: "Markdown",
            }),
          });
        }
      } catch { /* ignore */ }

      return new Response(JSON.stringify({ success: true, message: "Subscription cancelled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Create subscription (original behavior) ───
    const { email, name } = body;
    if (!email) throw new Error("Email is required");

    // 1. Get location ID
    const locRes = await squareGet("/locations", SQUARE_ACCESS_TOKEN);
    const locationId = locRes.locations?.[0]?.id;
    if (!locationId) throw new Error("No Square location found");

    // 2. Create payment link for $599 first month
    const idempotencyKey = crypto.randomUUID();
    const linkBody: Record<string, unknown> = {
      idempotency_key: idempotencyKey,
      quick_pay: {
        name: "Warren Guru — Pro Subscription (Month 1)",
        price_money: {
          amount: 59900,
          currency: "USD",
        },
        location_id: locationId,
      },
      checkout_options: {
        redirect_url: "https://warren.guru/thankyou?subscribed=true",
        ask_for_shipping_address: false,
      },
    };

    if (email && email.includes("@") && !email.includes("example")) {
      linkBody.pre_populated_data = { buyer_email: email };
    }

    const linkResult = await squareFetch(
      "/online-checkout/payment-links",
      SQUARE_ACCESS_TOKEN,
      linkBody
    );

    const paymentLink = linkResult.payment_link;
    if (!paymentLink?.url) throw new Error("Failed to create payment link");

    // 3. Record in DB
    const trialEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await sb.from("guru_subscriptions").insert({
      email,
      full_name: name || null,
      status: "pending",
      plan: "pro",
      amount_cents: 59900,
      square_payment_link_id: paymentLink.id,
      square_order_id: paymentLink.order_id || null,
      trial_ends_at: trialEnd,
      meta: {
        payment_link_url: paymentLink.url,
        location_id: locationId,
      },
    });

    return new Response(
      JSON.stringify({ url: paymentLink.url }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("square-subscribe error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
