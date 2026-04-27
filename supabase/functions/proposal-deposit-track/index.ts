// Tracking pixel for deposit emails sent from Proposals page.
// GET ?id=<proposal_id>  -> stamps meta.deposit_email_opened_at and returns 1x1 GIF.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const PIXEL = Uint8Array.from([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,0xff,0xff,0xff,
  0x00,0x00,0x00,0x21,0xf9,0x04,0x01,0x00,0x00,0x00,0x00,0x2c,0x00,0x00,0x00,0x00,
  0x01,0x00,0x01,0x00,0x00,0x02,0x02,0x44,0x01,0x00,0x3b,
]);

const pixelHeaders = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Access-Control-Allow-Origin": "*",
};

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (id) {
      const sbUrl = Deno.env.get("SUPABASE_URL");
      const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (sbUrl && sbKey) {
        // Fetch existing meta to merge
        const getRes = await fetch(
          `${sbUrl}/rest/v1/proposals?id=eq.${id}&select=meta`,
          { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
        );
        let meta: Record<string, unknown> = {};
        if (getRes.ok) {
          const rows = await getRes.json();
          if (rows?.[0]?.meta && typeof rows[0].meta === "object") meta = rows[0].meta;
        }
        const now = new Date().toISOString();
        const opens = Number((meta as any).deposit_email_opens || 0) + 1;
        const newMeta = {
          ...meta,
          deposit_email_opened_at: (meta as any).deposit_email_opened_at || now,
          deposit_email_last_opened_at: now,
          deposit_email_opens: opens,
        };
        await fetch(`${sbUrl}/rest/v1/proposals?id=eq.${id}`, {
          method: "PATCH",
          headers: {
            apikey: sbKey,
            Authorization: `Bearer ${sbKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ meta: newMeta }),
        });
      }
    }
  } catch (e) {
    console.error("track error:", e);
  }
  return new Response(PIXEL, { headers: pixelHeaders });
});
