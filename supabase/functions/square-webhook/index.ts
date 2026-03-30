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
    console.error(`Square ${method} ${path} error:`, JSON.stringify(data));
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

async function ensureSubscriptionPlan(token: string): Promise<{ planId: string; variationId: string }> {
  const searchRes = await squareFetch("/catalog/search", token, {
    object_types: ["SUBSCRIPTION_PLAN"],
    query: {
      exact_query: {
        attribute_name: "name",
        attribute_value: "Warren Guru Pro",
      },
    },
  });

  if (searchRes.objects?.length > 0) {
    const plan = searchRes.objects[0];
    const variation = plan.subscription_plan_data?.subscription_plan_variations?.[0];
    if (variation) {
      console.log("Found existing plan:", plan.id, "variation:", variation.id);
      return { planId: plan.id, variationId: variation.id };
    }
  }

  const idempotencyKey = crypto.randomUUID();
  const createRes = await squareFetch("/catalog/object", token, {
    idempotency_key: idempotencyKey,
    object: {
      type: "SUBSCRIPTION_PLAN_VARIATION",
      id: "#guru_pro_variation",
      subscription_plan_variation_data: {
        name: "Warren Guru Pro",
        phases: [
          {
            cadence: "DAILY",
            periods: 1,
            pricing: {
              type: "STATIC",
              price_money: { amount: 0, currency: "USD" },
            },
          },
          {
            cadence: "MONTHLY",
            periods: 3,
            pricing: {
              type: "STATIC",
              price_money: { amount: 59900, currency: "USD" },
            },
          },
          {
            cadence: "MONTHLY",
            pricing: {
              type: "STATIC",
              price_money: { amount: 79900, currency: "USD" },
            },
          },
        ],
      },
    },
  });

  const obj = createRes.catalog_object;
  console.log("Created subscription plan:", obj.id);
  return {
    planId: obj.id,
    variationId: obj.id,
  };
}

/** Generate a random 12-char password */
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pw = '';
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  for (const b of arr) pw += chars[b % chars.length];
  return pw;
}

/** Create auth account & email credentials via Gmail API */
async function createClientAccountAndEmail(
  sb: any,
  buyerEmail: string,
  buyerName: string | null,
) {
  const password = generatePassword();
  const displayName = buyerName || buyerEmail.split('@')[0];

  console.log(`[client-account] Creating account for ${buyerEmail}`);

  // Check if user already exists using email filter (avoids pagination issues)
  let userId: string;
  let existingUserId: string | null = null;

  // Try to find existing user by creating — if email exists, createUser will fail
  const { data: newUser, error: createError } = await sb.auth.admin.createUser({
    email: buyerEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: displayName, role: 'client' },
  });

  if (createError) {
    // User likely already exists — find them via admin API with per_page filter
    const { data: listData } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = listData?.users?.find((u: any) => u.email === buyerEmail);
    if (existing) {
      existingUserId = existing.id;
      await sb.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
      userId = existing.id;
      console.log(`[client-account] Updated existing user ${userId}`);
    } else {
      console.error(`[client-account] Create user error and user not found: ${createError.message}`);
      return;
    }
  } else {
    userId = newUser.user.id;
    console.log(`[client-account] Created new user ${userId}`);
  }

  // Find landing page linked to this email and store password + user id
  const { data: pages } = await sb
    .from('lw_landing_pages')
    .select('id, client_name')
    .eq('email', buyerEmail)
    .limit(1);

  if (pages && pages.length > 0) {
    await sb
      .from('lw_landing_pages')
      .update({ client_user_id: userId, client_password: password })
      .eq('id', pages[0].id);
    console.log(`[client-account] Linked user to landing page ${pages[0].id}`);
  }

  // Send login credentials email via Gmail API
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const loginUrl = 'https://socooked.lovable.app/auth';
  const emailHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <h2 style="color: #0f172a;">Welcome to Your Client Dashboard 🎉</h2>
  
  <p>Hi ${displayName},</p>
  
  <p>Thank you for your payment! Your client dashboard is now ready. Here are your login credentials:</p>
  
  <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <p style="margin: 4px 0;"><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
    <p style="margin: 4px 0;"><strong>Email:</strong> ${buyerEmail}</p>
    <p style="margin: 4px 0;"><strong>Password:</strong> ${password}</p>
  </div>
  
  <p>From your dashboard you can:</p>
  <ul>
    <li>View and manage your incoming leads</li>
    <li>Download call recordings</li>
    <li>Track your lead pipeline</li>
  </ul>
  
  <p>We recommend changing your password after your first login.</p>
  
  <br/>
  <p>Best regards,</p>
  <p><strong>Warren A Thompson</strong><br/>
  STU25 — Web &amp; Social Media Services<br/>
  <a href="mailto:warren@stu25.com">warren@stu25.com</a></p>
</div>`;

  try {
    const gmailRes = await fetch(
      `${SUPABASE_URL}/functions/v1/gmail-api?action=send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          to: buyerEmail,
          subject: 'Your Client Dashboard Login Credentials',
          body: emailHtml,
        }),
      }
    );
    const gmailData = await gmailRes.json();
    if (!gmailRes.ok) {
      console.error('[client-account] Gmail send error:', JSON.stringify(gmailData));
    } else {
      console.log(`[client-account] ✅ Credentials emailed to ${buyerEmail}`);
    }

    // Log communication
    await sb.from('communications').insert({
      type: 'email',
      direction: 'outbound',
      to_address: buyerEmail,
      subject: 'Client Dashboard Login Credentials',
      body: emailHtml,
      status: 'sent',
      provider: 'square-payment-account-create',
      metadata: { source: 'square-webhook', user_id: userId },
    });
  } catch (emailErr) {
    console.error('[client-account] Email send failed:', emailErr);
  }
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
    const eventType = body?.type;

    // ─── Square Webhook Event ───
    if (eventType && eventType.startsWith("payment.")) {
      console.log("Webhook event:", eventType, JSON.stringify(body).slice(0, 500));

      if (eventType === "payment.completed") {
        const payment = body.data?.object?.payment;
        if (!payment) {
          console.warn("No payment object in webhook");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const orderId = payment.order_id;
        const customerId = payment.customer_id;
        const buyerEmail = payment.buyer_email_address;
        const sourceCardId = payment.source_type === "CARD" ? payment.card_details?.card?.id : null;

        console.log("Payment completed:", { orderId, customerId, buyerEmail, sourceCardId });

        // ─── Check if this is a phone credits top-up ───
        if (orderId) {
          const { data: creditRecord } = await sb
            .from("guru_subscriptions")
            .select("*")
            .eq("square_order_id", orderId)
            .eq("plan", "phone_credits")
            .maybeSingle();

          if (creditRecord) {
            const meta = creditRecord.meta as Record<string, unknown> || {};
            const landingPageId = meta.landing_page_id as string;
            const creditAmountCents = (meta.amount_cents as number) || creditRecord.amount_cents || 0;

            console.log(`[square-webhook] Phone credits payment: $${(creditAmountCents / 100).toFixed(2)} for page ${landingPageId}`);

            // Update the guru_subscriptions record
            await sb
              .from("guru_subscriptions")
              .update({
                status: "completed",
                started_at: new Date().toISOString(),
                square_customer_id: customerId || null,
                meta: { ...meta, payment_id: payment.id, completed_at: new Date().toISOString() },
              })
              .eq("id", creditRecord.id);

            // Add credits to the landing page
            if (landingPageId && creditAmountCents > 0) {
              const { data: page } = await sb
                .from("lw_landing_pages")
                .select("vapi_credit_balance_cents")
                .eq("id", landingPageId)
                .single();

              const currentBalance = (page?.vapi_credit_balance_cents as number) || 0;
              await sb
                .from("lw_landing_pages")
                .update({ vapi_credit_balance_cents: currentBalance + creditAmountCents })
                .eq("id", landingPageId);

              console.log(`[square-webhook] Added ${creditAmountCents} cents to page ${landingPageId}. New balance: ${currentBalance + creditAmountCents}`);
            }

            // Telegram notification for credit purchase
            try {
              const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
              const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
              if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: `📞 *Phone Credits Purchased*\n📧 ${buyerEmail || creditRecord.email}\n💳 $${(creditAmountCents / 100).toFixed(2)}\n🏠 Page: ${landingPageId}`,
                    parse_mode: "Markdown",
                  }),
                });
              }
            } catch { /* ignore */ }

            return new Response(JSON.stringify({ ok: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        // Update subscription record (non-credit payments)
        if (orderId) {
          await sb
            .from("guru_subscriptions")
            .update({
              status: "active",
              square_customer_id: customerId || null,
              square_order_id: orderId,
              started_at: new Date().toISOString(),
              meta: {
                payment_id: payment.id,
                card_id: sourceCardId,
                amount: payment.amount_money,
              },
            })
            .eq("square_order_id", orderId);
        }

        // ─── Auto-create client dashboard account + landing page ───
        if (buyerEmail) {
          // Resolve buyer name from Square customer if available
          let buyerName: string | null = null;
          if (customerId) {
            try {
              const custData = await squareGet(`/customers/${customerId}`, SQUARE_ACCESS_TOKEN);
              const c = custData.customer;
              if (c) buyerName = [c.given_name, c.family_name].filter(Boolean).join(' ') || null;
            } catch { /* ignore */ }
          }

          // Auto-create seller landing page for this subscriber
          const displayName = buyerName || buyerEmail.split('@')[0];
          const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

          // Check if landing page already exists for this email
          const { data: existingPages } = await sb
            .from('lw_landing_pages')
            .select('id')
            .eq('email', buyerEmail)
            .limit(1);

          let landingPageId: string | null = null;

          if (!existingPages || existingPages.length === 0) {
            const { data: newPage } = await sb
              .from('lw_landing_pages')
              .insert({
                slug: slug + '-' + Date.now().toString(36),
                client_name: displayName,
                email: buyerEmail,
                headline: 'Get a Fair Cash Offer for Your Home Today',
                tagline: 'We Buy Houses Fast. Cash Offers in 24 Hours.',
                sub_headline: 'No inspections. No appraisals. No hassle. Close on your timeline.',
                is_active: true,
                meta: { source: 'square-payment', square_order_id: orderId },
              })
              .select('id')
              .single();

            if (newPage) {
              landingPageId = newPage.id;
              console.log(`[square-webhook] Auto-created landing page ${landingPageId} for ${buyerEmail}`);
            }
          } else {
            landingPageId = existingPages[0].id;
          }

          await createClientAccountAndEmail(sb, buyerEmail, buyerName);
        }

        // If we have a customer and card, create the subscription
        if (customerId && sourceCardId) {
          try {
            const { variationId } = await ensureSubscriptionPlan(SQUARE_ACCESS_TOKEN);
            const locationRes = await squareGet("/locations", SQUARE_ACCESS_TOKEN);
            const locationId = locationRes.locations?.[0]?.id;

            if (locationId && variationId) {
              const cardRes = await squareFetch("/cards", SQUARE_ACCESS_TOKEN, {
                idempotency_key: crypto.randomUUID(),
                source_id: payment.id,
                card: {
                  customer_id: customerId,
                },
              }).catch((e) => {
                console.warn("Card on file creation failed (may already exist):", e.message);
                return null;
              });

              const storedCardId = cardRes?.card?.id || sourceCardId;

              const subRes = await squareFetch("/subscriptions", SQUARE_ACCESS_TOKEN, {
                idempotency_key: crypto.randomUUID(),
                location_id: locationId,
                plan_variation_id: variationId,
                customer_id: customerId,
                card_id: storedCardId,
                start_date: new Date().toISOString().split("T")[0],
                timezone: "America/New_York",
              }).catch((e) => {
                console.error("Subscription creation failed:", e.message);
                return null;
              });

              if (subRes?.subscription) {
                console.log("Subscription created:", subRes.subscription.id);
                await sb
                  .from("guru_subscriptions")
                  .update({
                    status: "subscribed",
                    meta: {
                      payment_id: payment.id,
                      card_id: storedCardId,
                      subscription_id: subRes.subscription.id,
                      amount: payment.amount_money,
                    },
                  })
                  .eq("square_order_id", orderId);
              }
            }
          } catch (subErr) {
            console.error("Subscription setup error:", subErr);
          }
        }

        // Send Telegram notification
        try {
          const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
          const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
          if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            const amount = payment.amount_money
              ? `$${(payment.amount_money.amount / 100).toFixed(2)}`
              : "$599";
            const msg =
              `💰 *New Warren Guru Subscriber!*\n` +
              `📧 ${buyerEmail || "Unknown"}\n` +
              `💳 ${amount}\n` +
              `🆔 Order: \`${orderId || "N/A"}\``;

            await fetch(
              `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: TELEGRAM_CHAT_ID,
                  text: msg,
                  parse_mode: "Markdown",
                }),
              }
            );
          }
        } catch (tgErr) {
          console.warn("Telegram notify failed:", tgErr);
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Subscription cancellation/update events ───
    if (eventType === "subscription.updated") {
      const sub = body.data?.object?.subscription;
      if (sub?.status === "CANCELED") {
        await sb
          .from("guru_subscriptions")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
          })
          .contains("meta", { subscription_id: sub.id });
        console.log("Subscription cancelled:", sub.id);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Unknown event ───
    console.log("Unhandled event type:", eventType);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("square-webhook error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
