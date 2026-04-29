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

function buildHtml(p: any, amount: number) {
  const firstName = (p.client_name || "").split(" ")[0] || "there";
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #059669; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">🎬 Let's Get Started!</h1>
      </div>
      <div style="padding: 28px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 15px;">Hi ${firstName},</p>
        <p style="font-size: 15px; line-height: 1.6;">
          Thank you for signing the agreement for <strong>${p.title}</strong>. To officially kick off
          production on your video, we just need a <strong>$${amount} deposit</strong> to lock in your slot
          and begin pre-production.
        </p>

        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h2 style="margin: 0 0 14px; font-size: 16px; color: #059669;">💸 Easy Payment Options</h2>

          <div style="margin-bottom: 14px;">
            <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Zelle</div>
            <div style="font-size: 16px; font-weight: bold; color: #1a1a1a;">Me@cozyhomestudio.com</div>
          </div>

          <div style="margin-bottom: 14px;">
            <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Cash App</div>
            <div style="font-size: 16px; font-weight: bold; color: #1a1a1a;">$ITSWARR</div>
          </div>

          <div style="border-top: 1px solid #e5e7eb; margin-top: 14px; padding-top: 14px;">
            <div style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Credit / Debit Card</div>
            <a href="https://warren.guru/payme" style="display:inline-block;background:#059669;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Pay $${amount} with Card →</a>
            <div style="font-size: 12px; color: #6b7280; margin-top: 6px;">https://warren.guru/payme</div>
          </div>
        </div>

        <p style="font-size: 14px; line-height: 1.6;">
          Once the $${amount} deposit comes through, we'll reach out within 24 hours to schedule your
          shoot date and walk you through next steps.
        </p>

        <p style="font-size: 14px; line-height: 1.6; margin-top: 20px;">
          Any questions? Just reply to this email or text us directly.
        </p>

        <p style="font-size: 14px; margin-top: 24px;">
          — Warren<br/>
          <span style="color: #6b7280; font-size: 13px;">(424) 465-1253 (cell) · (702) 701-6192 (office)</span>
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
    if (meta.deposit_email_sent_at) {
      // Idempotent: already sent
      return new Response(
        JSON.stringify({ skipped: true, reason: "already_sent", sent_at: meta.deposit_email_sent_at }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const amount = 150;
    const subject = `Deposit to start your video — $${amount}`;
    const html = buildHtml(p, amount);

    const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/gmail-api?action=send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ to: p.client_email, subject, body: html }),
    });
    const sendJson = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok || !sendJson.success) {
      return new Response(
        JSON.stringify({ error: sendJson.error || `Send failed (HTTP ${sendRes.status})` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Stamp meta so we don't double-send
    await supabase
      .from("proposals")
      .update({
        meta: {
          ...meta,
          deposit_email_sent_at: new Date().toISOString(),
          deposit_email_amount: amount,
          deposit_email_message_id: sendJson.id || null,
          deposit_email_auto: !!body?.record,
        },
      })
      .eq("id", proposalId);

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
