// Sends the "Deposit to start your video" email for a signed proposal.
// Triggered automatically by DB trigger on proposals.status -> 'signed',
// or manually via POST { id: <proposal_id> }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

async function getCellPretty(): Promise<string> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?key=eq.business_numbers&select=value`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const rows = await r.json();
    const d = String(rows?.[0]?.value?.cell || "").replace(/\D/g, "").slice(-10);
    if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  } catch { /* fallback */ }
  return "(480) 220-0405";
}

async function buildHtml(p: any) {
  const firstName = (p.client_name || "").split(" ")[0] || "there";
  const cellPretty = await getCellPretty();
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #059669; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">🎬 Thanks for Signing!</h1>
      </div>
      <div style="padding: 26px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 15px;">Hi ${firstName},</p>
        <p style="font-size: 15px; line-height: 1.6;">
          Thanks for signing the agreement for <strong>${p.title}</strong>. To kick off production,
          please submit your payment at the link below:
        </p>

        <div style="text-align: center; margin: 26px 0;">
          <a href="https://warren.guru/payme"
             style="display: inline-block; background: #059669; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
            Pay at warren.guru/payme
          </a>
        </div>

        <p style="font-size: 13px; color: #6b7280; line-height: 1.6; background: #fff; border: 1px solid #e5e7eb; padding: 12px 14px; border-radius: 6px;">
          <strong>Already paid?</strong> Please ignore this email — it was sent automatically right after you signed.
        </p>

        <p style="font-size: 14px; margin-top: 24px;">
          — Warren<br/>
          <span style="color: #6b7280; font-size: 13px;">${cellPretty} (cell)</span>
        </p>
      </div>
      <img src="${SUPABASE_URL}/functions/v1/proposal-deposit-track?id=${p.id}&t=${Date.now()}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;" />
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    // Accept either { id } (manual call) or { record: { entity_id } } (db webhook style)
    const proposalId: string | undefined =
      body.id || body.proposal_id || body?.record?.id || body?.record?.entity_id;
    if (!proposalId) {
      return new Response(JSON.stringify({ error: "id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: p, error } = await supabase
      .from("proposals")
      .select("*")
      .eq("id", proposalId)
      .maybeSingle();
    if (error || !p) {
      return new Response(JSON.stringify({ error: error?.message || "Proposal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!p.client_email) {
      return new Response(JSON.stringify({ error: "Proposal has no client_email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const meta: Record<string, any> = (p.meta as Record<string, any>) || {};
    if (meta.deposit_email_sent_at && !body.force) {
      // Idempotent: already sent (auto-trigger won't double-send; UI button uses force=true)
      return new Response(
        JSON.stringify({ skipped: true, reason: "already_sent", sent_at: meta.deposit_email_sent_at }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Skip the entire deposit + thank-you flow for "Pay on Delivery" proposals
    if ((meta as any).no_deposit === true || (meta as any).payment_model === "pay_on_delivery") {
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_deposit_proposal" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const subject = `Payment info for "${p.title}"`;
    const html = await buildHtml(p);

    const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/gmail-api?action=send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ to: p.client_email, subject, body: html, skipDuplicateCheck: true }),
    });
    const sendJson = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok || !sendJson.success) {
      return new Response(
        JSON.stringify({ error: sendJson.error || `Send failed (HTTP ${sendRes.status})` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sentAt = new Date().toISOString();
    await supabase
      .from("proposals")
      .update({
        meta: {
          ...meta,
          deposit_email_sent_at: sentAt,
          deposit_email_message_id: sendJson.id || null,
          deposit_email_auto: !!body?.record || !!body?.auto,
        },
      })
      .eq("id", proposalId);

    // Send thank-you + deposit-info text (channel-aware: iMessage if existing thread is iMessage, else SMS)
    let thankYouSmsSentAt: string | null = meta.thank_you_sms_sent_at || null;
    let thankYouChannel: string | null = (meta as any).thank_you_sms_channel || null;
    if (p.client_phone && !meta.thank_you_sms_sent_at) {
      try {
        // Resolve a real first name — never use generic "Direct Caller (...)" placeholder
        const digits = String(p.client_phone).replace(/\D/g, "").slice(-10);
        const isGenericName = (n: string) =>
          !n || /^direct caller/i.test(n) || /^unknown/i.test(n) || /^caller$/i.test(n) || /^\+?\d[\d\s().-]*$/.test(n);

        let resolvedName: string = isGenericName(p.client_name || "") ? "" : (p.client_name || "");
        if (!resolvedName && digits) {
          try {
            const { data: c } = await supabase
              .from("sms_contacts").select("name").eq("phone_last10", digits).not("name", "is", null).limit(1);
            if (c?.[0]?.name && !isGenericName(c[0].name)) resolvedName = c[0].name;
          } catch { /* ignore */ }
          if (!resolvedName) {
            try {
              const { data: cu } = await supabase
                .from("customers").select("full_name").ilike("phone", `%${digits}`).not("full_name", "is", null).limit(1);
              if (cu?.[0]?.full_name && !isGenericName(cu[0].full_name)) resolvedName = cu[0].full_name;
            } catch { /* ignore */ }
          }
          if (!resolvedName) {
            try {
              const { data: l } = await supabase
                .from("leads").select("name").ilike("phone", `%${digits}`).not("name", "is", null).limit(1);
              if (l?.[0]?.name && !isGenericName(l[0].name)) resolvedName = l[0].name;
            } catch { /* ignore */ }
          }
        }
        const firstName = (resolvedName || "").trim().split(/\s+/)[0] || "there";

        const smsBody = `Hi ${firstName}, this is Warren — thanks for signing the agreement for "${p.title}"! To kick off production, please submit payment at https://warren.guru/payme

If you've already paid, please ignore this message.`;

        let useImessage = false;
        try {
          const { data: lastMsgs } = await supabase
            .from("communications")
            .select("provider, created_at")
            .eq("type", "sms")
            .or(`phone_number.ilike.%${digits},to_address.ilike.%${digits},from_address.ilike.%${digits}`)
            .order("created_at", { ascending: false })
            .limit(10);
          if (Array.isArray(lastMsgs) && lastMsgs.length > 0) {
            // If any recent message was iMessage and the most-recent isn't an explicit SMS fallback, route to iMessage
            const anyImessage = lastMsgs.some((m: any) =>
              String(m.provider || "").toLowerCase().includes("imessage") &&
              !String(m.provider || "").toLowerCase().endsWith("-sms")
            );
            useImessage = anyImessage;
          }
        } catch (e) {
          console.error("[deposit-send] channel detect failed:", (e as any)?.message || e);
        }

        const endpoint = useImessage ? "voidfix-imessage" : "powerdial-sms";
        const sendUrl = `${SUPABASE_URL}/functions/v1/${endpoint}`;
        const sendPayload = useImessage
          ? { action: "send", to: p.client_phone, body: smsBody, source: "proposal-signed-deposit" }
          : { action: "send", to: p.client_phone, body: smsBody, source: "proposal-signed-deposit" };
        const smsRes = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ANON_KEY}`,
            apikey: ANON_KEY,
          },
          body: JSON.stringify(sendPayload),
        });
        if (smsRes.ok) {
          thankYouSmsSentAt = new Date().toISOString();
          thankYouChannel = useImessage ? "imessage" : "sms";
        } else {
          console.error("[deposit-send] text send non-OK", smsRes.status, await smsRes.text().catch(() => ""));
        }
      } catch (e) {
        console.error("thank-you text failed:", e);
      }
    }

    // Stamp meta so we don't double-send
    const { data: latestProposal } = await supabase
      .from("proposals")
      .select("meta")
      .eq("id", proposalId)
      .maybeSingle();
    const latestMeta: Record<string, any> = (latestProposal?.meta as Record<string, any>) || meta;

    const { error: updateError } = await supabase
      .from("proposals")
      .update({
        meta: {
          ...latestMeta,
          deposit_email_sent_at: latestMeta.deposit_email_sent_at || sentAt,
          deposit_email_message_id: latestMeta.deposit_email_message_id || sendJson.id || null,
          deposit_email_auto: latestMeta.deposit_email_auto ?? (!!body?.record || !!body?.auto),
          thank_you_sms_sent_at: thankYouSmsSentAt,
          thank_you_sms_channel: thankYouChannel,
        },
      })
      .eq("id", proposalId);
    if (updateError) console.error("proposal meta stamp failed:", updateError.message);

    return new Response(
      JSON.stringify({ success: true, message_id: sendJson.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
