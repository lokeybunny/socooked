// Integration test: confirm /voidfix-imessage send works when only attachments
// are provided and the text body is blank. iMessage supports media-only sends
// (unlike SMS, which generally requires a text body); the edge function must
// fill in a placeholder space so VoidFix's "message required" validator passes.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const TEST_TO = Deno.env.get("VOIDFIX_TEST_TO") || "+17025550100";
const TEST_MEDIA = Deno.env.get("VOIDFIX_TEST_MEDIA")
  || "https://placehold.co/300x300.png";

Deno.test("voidfix-imessage send: attachment-only (blank body) is accepted", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/voidfix-imessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: "send",
      to: TEST_TO,
      body: "", // intentionally blank — iMessage supports media-only
      attachments: [TEST_MEDIA],
    }),
  });

  const json = await res.json().catch(() => ({}));

  // Must NOT be the validator rejecting blank message
  assert(
    json?.error !== "missing_recipient_or_message",
    `edge function rejected blank-body+attachment payload: ${JSON.stringify(json)}`,
  );
  const upstream = String(json?.raw?.error || "").toLowerCase();
  assert(
    !/recipient and message are required/.test(upstream),
    `VoidFix upstream rejected blank message: ${JSON.stringify(json)}`,
  );

  // Either accepted (ok), or upstream gateway hiccup (502/503/504/408 → soft 200).
  if (json?.ok) {
    assertEquals(res.status, 200);
    assert(json.channel, "expected channel field on success");
  } else {
    // Acceptable soft-failures: upstream gateway timeout or known unsupported status
    const acceptable = [408, 502, 503, 504].includes(json?.status);
    assert(
      acceptable,
      `unexpected failure: ${JSON.stringify(json)}`,
    );
  }
});
