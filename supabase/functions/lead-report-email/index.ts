import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const IMPERSONATE_EMAIL = "warren@stu25.com";

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Chunk-safe Uint8Array → base64 (avoids call stack overflow) */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

/** Chunk-safe string → base64url for Gmail raw message */
function stringToBase64url(str: string): string {
  // Encode string to UTF-8 bytes first
  const bytes = new TextEncoder().encode(str);
  const b64 = uint8ToBase64(bytes);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(sa: any, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email, sub: IMPERSONATE_EMAIL, scope, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600,
  })));
  const signingInput = `${header}.${payload}`;
  const pemBody = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", keyData, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput)));
  const jwt = `${signingInput}.${base64url(sig)}`;
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

/* ─── Minimal PDF 1.4 builder ─── */
function buildLeadPdf(lead: any, pageName: string): Uint8Array {
  const objects: string[] = [];
  let objCount = 0;
  const offsets: number[] = [];

  function addObj(content: string): number {
    objCount++;
    objects.push(content);
    return objCount;
  }

  // Helpers
  const esc = (s: string) => String(s ?? "N/A").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  // Catalog, Pages, Font will be obj 1, 2, 3
  addObj(""); // placeholder catalog
  addObj(""); // placeholder pages
  // Font
  addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  const fontBoldObj = addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);

  // Build page content stream
  const W = 612; const H = 792;
  const marginL = 50; const marginR = 50;
  const contentW = W - marginL - marginR;
  let y = H - 60;

  let stream = "";
  const setFont = (bold: boolean, size: number) => {
    stream += `BT /F${bold ? 2 : 1} ${size} Tf ET\n`;
  };
  const text = (x: number, yy: number, s: string, bold = false, size = 10) => {
    stream += `BT /F${bold ? 2 : 1} ${size} Tf ${x} ${yy} Td (${esc(s)}) Tj ET\n`;
  };
  const line = (x1: number, y1: number, x2: number, y2: number, w = 0.5) => {
    stream += `${w} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
  };
  const rect = (x: number, yy: number, w: number, h: number, r: number, g: number, b: number) => {
    stream += `${r} ${g} ${b} rg ${x} ${yy} ${w} ${h} re f\n`;
  };

  // Header bar
  rect(0, H - 45, W, 45, 0.1, 0.1, 0.12);
  text(marginL, H - 30, "WARREN GURU", true, 14);
  stream += `0.6 0.6 0.6 rg\n`;
  text(marginL + 130, H - 30, "Lead Report", false, 14);
  stream += `0 0 0 rg\n`;
  text(W - marginR - 80, H - 30, dateStr, false, 9);

  y = H - 75;

  // Section: Lead Overview
  stream += `0.15 0.15 0.18 rg\n`;
  rect(marginL, y - 18, contentW, 22, 0.15, 0.15, 0.18);
  stream += `1 1 1 rg\n`;
  text(marginL + 8, y - 12, "LEAD OVERVIEW", true, 10);
  stream += `0 0 0 rg\n`;
  y -= 35;

  const field = (label: string, value: string | null | undefined) => {
    if (!value) return;
    text(marginL + 10, y, label + ":", true, 9);
    // Wrap long values
    const val = String(value);
    const maxChars = 70;
    if (val.length <= maxChars) {
      text(marginL + 140, y, val, false, 9);
      y -= 16;
    } else {
      const lines: string[] = [];
      for (let i = 0; i < val.length; i += maxChars) {
        lines.push(val.slice(i, i + maxChars));
      }
      text(marginL + 140, y, lines[0], false, 9);
      y -= 16;
      for (let i = 1; i < lines.length; i++) {
        text(marginL + 140, y, lines[i], false, 9);
        y -= 14;
      }
    }
  };

  field("Full Name", lead.full_name);
  field("Phone", lead.phone);
  field("Email", lead.email);
  field("Property Address", lead.property_address);
  field("Property Condition", lead.property_condition);
  field("Asking Price", lead.asking_price != null ? `$${Number(lead.asking_price).toLocaleString()}` : null);
  field("Motivation", lead.motivation);
  field("Timeline", lead.timeline);
  field("Lead Score", lead.lead_score != null ? String(lead.lead_score) : null);
  field("Status", lead.status);
  field("Source Page", pageName);
  field("Submitted", new Date(lead.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }));
  field("AI Call Status", lead.vapi_call_status);

  y -= 10;

  // Meta / REAPI data
  const meta = lead.meta || {};
  const assessed = meta.assessed_value ?? meta.assessedValue;
  const acreage = meta.acreage ?? meta.lotAcreage;
  const oppScore = meta.opportunity_score;
  const distress = meta.distress_flags || {};
  const vapiSummary = meta.vapi_summary;

  if (assessed || acreage || oppScore) {
    rect(marginL, y - 18, contentW, 22, 0.15, 0.15, 0.18);
    stream += `1 1 1 rg\n`;
    text(marginL + 8, y - 12, "PROPERTY DATA", true, 10);
    stream += `0 0 0 rg\n`;
    y -= 35;

    field("Assessed Value", assessed != null ? `$${Number(assessed).toLocaleString()}` : null);
    field("Acreage", acreage != null ? `${acreage} acres` : null);
    field("Opportunity Score", oppScore != null ? String(oppScore) : null);

    const flags: string[] = [];
    if (distress.tax_delinquent) flags.push("Tax Delinquent");
    if (distress.pre_foreclosure) flags.push("Pre-Foreclosure");
    if (distress.vacant) flags.push("Vacant");
    if (flags.length) field("Distress Flags", flags.join(", "));
    y -= 10;
  }

  // AI Notes
  if (lead.ai_notes) {
    if (y < 200) {
      // new page needed - for simplicity we'll truncate
    }
    rect(marginL, y - 18, contentW, 22, 0.15, 0.15, 0.18);
    stream += `1 1 1 rg\n`;
    text(marginL + 8, y - 12, "AI CONVERSATION NOTES", true, 10);
    stream += `0 0 0 rg\n`;
    y -= 38;

    const noteLines = lead.ai_notes.split("\n");
    for (const nl of noteLines) {
      if (y < 50) break;
      const cleaned = nl.trim();
      if (!cleaned) { y -= 8; continue; }
      // word wrap at ~85 chars
      const chunks: string[] = [];
      let remaining = cleaned;
      while (remaining.length > 85) {
        let breakAt = remaining.lastIndexOf(" ", 85);
        if (breakAt < 40) breakAt = 85;
        chunks.push(remaining.slice(0, breakAt));
        remaining = remaining.slice(breakAt).trimStart();
      }
      chunks.push(remaining);
      for (const chunk of chunks) {
        if (y < 50) break;
        text(marginL + 10, y, chunk, false, 8);
        y -= 13;
      }
    }
    y -= 10;
  }

  // AI Call Summary from meta
  if (vapiSummary && y > 100) {
    rect(marginL, y - 18, contentW, 22, 0.15, 0.15, 0.18);
    stream += `1 1 1 rg\n`;
    text(marginL + 8, y - 12, "AI CALL SUMMARY", true, 10);
    stream += `0 0 0 rg\n`;
    y -= 38;
    const sumLines = String(vapiSummary).split("\n");
    for (const sl of sumLines) {
      if (y < 50) break;
      const cleaned = sl.trim();
      if (!cleaned) { y -= 8; continue; }
      const chunks: string[] = [];
      let remaining = cleaned;
      while (remaining.length > 85) {
        let breakAt = remaining.lastIndexOf(" ", 85);
        if (breakAt < 40) breakAt = 85;
        chunks.push(remaining.slice(0, breakAt));
        remaining = remaining.slice(breakAt).trimStart();
      }
      chunks.push(remaining);
      for (const chunk of chunks) {
        if (y < 50) break;
        text(marginL + 10, y, chunk, false, 8);
        y -= 13;
      }
    }
  }

  // Footer
  line(marginL, 40, W - marginR, 40, 0.3);
  stream += `0.5 0.5 0.5 rg\n`;
  text(marginL, 28, "Warren Guru — Confidential Lead Report", false, 7);
  text(W - marginR - 100, 28, `Generated ${dateStr}`, false, 7);
  stream += `0 0 0 rg\n`;

  // Now build the actual PDF objects
  const streamBytes = new TextEncoder().encode(stream);
  const streamObjId = addObj(`<< /Length ${streamBytes.length} >>\nstream\n${stream}endstream`);

  // Page
  const pageObjId = addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${streamObjId} 0 R /Resources << /Font << /F1 3 0 R /F2 ${fontBoldObj} 0 R >> >> >>`);

  // Fill placeholders
  objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[1] = `<< /Type /Pages /Kids [${pageObjId} 0 R] /Count 1 >>`;

  // Serialize
  let pdf = "%PDF-1.4\n";
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const { data: { user }, error: userErr } = await sb.auth.getUser();
    if (userErr || !user) throw new Error("Unauthorized");

    const { lead_id } = await req.json();
    if (!lead_id) throw new Error("lead_id required");

    // Get lead
    const { data: lead, error: leadErr } = await sb
      .from("lw_landing_leads")
      .select("*")
      .eq("id", lead_id)
      .single();
    if (leadErr || !lead) throw new Error("Lead not found");

    // Verify ownership: user must own the landing page
    const { data: page } = await sb
      .from("lw_landing_pages")
      .select("id, slug, client_name, email")
      .eq("id", lead.landing_page_id)
      .eq("client_user_id", user.id)
      .single();
    if (!page) throw new Error("Unauthorized: not your lead");

    // Determine recipient email
    const recipientEmail = page.email || user.email;
    if (!recipientEmail) throw new Error("No email found for your account");

    // Build PDF
    const pageName = `${page.client_name} (/${page.slug})`;
    const pdfBytes = buildLeadPdf(lead, pageName);
    const pdfBase64 = uint8ToBase64(pdfBytes);

    // Build MIME email with PDF attachment
    const leadName = lead.full_name || "Lead";
    const subject = `Lead Report: ${leadName} — ${lead.property_address || "Property"}`;
    const boundary = "boundary_" + crypto.randomUUID().replace(/-/g, "");
    const fileName = `lead-report-${leadName.replace(/\s+/g, "-").toLowerCase()}.pdf`;

    const mimeParts = [
      `From: ${IMPERSONATE_EMAIL}`,
      `To: ${recipientEmail}`,
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">`,
      `<h2 style="color:#1a1a1a;">Lead Report: ${leadName}</h2>`,
      `<p style="color:#555;">Your lead report for <strong>${leadName}</strong> at <strong>${lead.property_address || 'N/A'}</strong> is attached as a PDF.</p>`,
      `<table style="width:100%;border-collapse:collapse;margin:16px 0;">`,
      `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#888;font-size:13px;">Phone</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;">${lead.phone || 'N/A'}</td></tr>`,
      `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#888;font-size:13px;">Status</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;">${lead.status}</td></tr>`,
    ];
    if (lead.asking_price) {
      mimeParts.push(`<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#888;font-size:13px;">Asking Price</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;">$${Number(lead.asking_price).toLocaleString()}</td></tr>`);
    }
    mimeParts.push(
      `</table>`,
      `<p style="color:#999;font-size:12px;">— Warren Guru Wholesale CRM</p>`,
      `</div>`,
      `--${boundary}`,
      `Content-Type: application/pdf; name="${fileName}"`,
      `Content-Disposition: attachment; filename="${fileName}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      pdfBase64.match(/.{1,76}/g)!.join("\r\n"),
      `--${boundary}--`,
    );
    const mimeBody = mimeParts.join("\r\n");

    // Send via Gmail
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!saJson) throw new Error("Google service account not configured");
    const sa = JSON.parse(saJson);
    const accessToken = await getAccessToken(sa, "https://www.googleapis.com/auth/gmail.modify");

    const rawMessage = stringToBase64url(mimeBody);

    const gmailRes = await fetch(`${GMAIL_API}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: rawMessage }),
    });

    if (!gmailRes.ok) {
      const errText = await gmailRes.text();
      throw new Error(`Gmail send failed: ${errText}`);
    }

    return new Response(JSON.stringify({ success: true, sent_to: recipientEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("lead-report-email error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
