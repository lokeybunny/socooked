import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shouldSendDisconnectedSms } from "./index.ts";

const base = {
  messageType: "end-of-call-report",
  endedReason: "customer-ended-call",
  proposalSentAtMs: 0,
  callStartedAtMs: 1_000_000_000_000,
  alreadySent: false,
  toPhone: "+13105551234",
};

Deno.test("sends when customer hangs up and no proposal was sent", () => {
  assertEquals(shouldSendDisconnectedSms(base), true);
});

Deno.test("does NOT send while call is still in progress (non end-of-call event)", () => {
  for (const t of ["status-update", "conversation-update", "tool-calls", "transcript", "speech-update"]) {
    assertEquals(shouldSendDisconnectedSms({ ...base, messageType: t }), false, `messageType=${t}`);
  }
});

Deno.test("does NOT send when a proposal was sent during this call", () => {
  assertEquals(
    shouldSendDisconnectedSms({
      ...base,
      proposalSentAtMs: base.callStartedAtMs + 30_000,
    }),
    false,
  );
});

Deno.test("DOES send when proposal was sent before this call (older proposal)", () => {
  assertEquals(
    shouldSendDisconnectedSms({
      ...base,
      proposalSentAtMs: base.callStartedAtMs - 5 * 60_000,
    }),
    true,
  );
});

Deno.test("does NOT send when assistant or system ended the call", () => {
  for (const r of ["assistant-ended-call", "silence-timed-out", "pipeline-error", "unknown"]) {
    assertEquals(shouldSendDisconnectedSms({ ...base, endedReason: r }), false, `reason=${r}`);
  }
});

Deno.test("does NOT send when already sent for this call", () => {
  assertEquals(shouldSendDisconnectedSms({ ...base, alreadySent: true }), false);
});

Deno.test("does NOT send when phone is missing", () => {
  assertEquals(shouldSendDisconnectedSms({ ...base, toPhone: "" }), false);
  assertEquals(shouldSendDisconnectedSms({ ...base, toPhone: null }), false);
});

Deno.test("accepts all known customer-hangup reasons", () => {
  for (const r of ["customer-ended-call", "customer-hung-up", "user-ended-call"]) {
    assertEquals(shouldSendDisconnectedSms({ ...base, endedReason: r }), true, `reason=${r}`);
  }
});
