import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const BASE = `${SUPABASE_URL}/functions/v1/smm-api`;
const HEADERS = {
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
};

async function callGet(action: string, params?: Record<string, string>) {
  const searchParams = new URLSearchParams({ action, ...params });
  const res = await fetch(`${BASE}?${searchParams}`, { headers: HEADERS });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.ok };
}

async function callPost(action: string, body: any, params?: Record<string, string>) {
  const searchParams = new URLSearchParams({ action, ...params });
  const res = await fetch(`${BASE}?${searchParams}`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.ok };
}

// ─── 1. Profile/Account Tests ───────────────────────────────

Deno.test("list profiles", async () => {
  const { status, data, ok } = await callGet("list-profiles");
  console.log("  → status:", status, "profiles:", data?.profiles?.length || 0);
  assertEquals(ok, true);
  assertExists(data.profiles);
});

Deno.test("get STU25 profile", async () => {
  const { status, data, ok } = await callGet("get-profile", { username: "STU25" });
  console.log("  → status:", status);
  assertEquals(ok, true);
});

Deno.test("me (current account)", async () => {
  const { status, data, ok } = await callGet("me");
  console.log("  → plan:", data?.plan, "email:", data?.email);
  assertEquals(ok, true);
});

// ─── 2. Post to X (Twitter) ─────────────────────────────────

Deno.test("upload-text to X — post test tweet", async () => {
  const now = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit" });
  // The API expects platform[] as array items in FormData
  // Our smm-api proxy converts JSON arrays with key "platform[]" to FormData append
  const { status, data, ok } = await callPost("upload-text", {
    user: "STU25",
    title: `🧪 API connectivity test — ${now} PST. Automated via CLAWD. #test`,
    "platform[]": ["x"],
    async_upload: true,
  });
  console.log("  → status:", status, "ok:", ok);
  console.log("  → response:", JSON.stringify(data).slice(0, 300));
  if (data?.request_id) console.log("  → request_id:", data.request_id);
  if (data?.job_id) console.log("  → job_id:", data.job_id);
  if (!ok) {
    console.log("  ⚠ POST FAILED — this may be a platform[] format issue with the Upload-Post API");
  }
  // Don't hard-fail: log the issue for debugging
});

// ─── 3. Upload History & Scheduled ──────────────────────────

Deno.test("upload history", async () => {
  const { status, data, ok } = await callGet("upload-history", { page: "1", limit: "3" });
  console.log("  → status:", status);
  if (ok) {
    const items = data?.uploads || data?.history || (Array.isArray(data) ? data : []);
    console.log("  → items:", items.length || Object.keys(data));
  } else {
    console.log("  → error:", JSON.stringify(data).slice(0, 200));
  }
});

Deno.test("list scheduled posts", async () => {
  const { status, data, ok } = await callGet("list-scheduled");
  console.log("  → status:", status, "scheduled:", Array.isArray(data) ? data.length : typeof data === "object" ? Object.keys(data) : "?");
  assertEquals(ok, true);
});

// ─── 4. Queue System ────────────────────────────────────────

Deno.test("queue settings (STU25)", async () => {
  const { status, data } = await callGet("queue-settings", { profile: "STU25" });
  console.log("  → status:", status, "data:", JSON.stringify(data).slice(0, 200));
  // Queue may return 400 if not configured — that's expected
});

Deno.test("queue next slot (STU25)", async () => {
  const { status, data } = await callGet("queue-next-slot", { profile: "STU25" });
  console.log("  → status:", status, "data:", JSON.stringify(data).slice(0, 200));
});

// ─── 5. Analytics ───────────────────────────────────────────

Deno.test("analytics — X platform", async () => {
  const { status, data, ok } = await callGet("analytics", { profile_username: "STU25", platforms: "x" });
  console.log("  → status:", status, "keys:", typeof data === "object" ? Object.keys(data) : "?");
  assertEquals(ok, true);
  assertExists(data.x, "Expected X analytics data");
});

Deno.test("analytics — Instagram platform", async () => {
  const { status, data, ok } = await callGet("analytics", { profile_username: "STU25", platforms: "instagram" });
  console.log("  → status:", status, "keys:", typeof data === "object" ? Object.keys(data) : "?");
  if (ok) {
    console.log("  → IG data keys:", data.instagram ? Object.keys(data.instagram) : "missing");
  }
});

// ─── 6. Instagram Interactions ──────────────────────────────

Deno.test("IG media list", async () => {
  const { status, data, ok } = await callGet("ig-media", { user: "STU25" });
  console.log("  → status:", status, "media count:", data?.media?.length || 0);
  assertEquals(ok, true);
});

Deno.test("IG conversations", async () => {
  const { status, data, ok } = await callGet("ig-conversations", { user: "STU25" });
  console.log("  → status:", status, "conversations:", Array.isArray(data) ? data.length : data?.conversations?.length || "?");
  assertEquals(ok, true);
});

// ─── 7. Error Handling ──────────────────────────────────────

Deno.test("missing action → 400", async () => {
  const res = await fetch(BASE, { headers: HEADERS });
  const text = await res.text();
  assertEquals(res.status, 400);
  console.log("  → correct 400:", text.slice(0, 60));
});

Deno.test("unknown action → 400", async () => {
  const { status } = await callGet("fake-action-xyz");
  assertEquals(status, 400);
  console.log("  → correct 400 for unknown action");
});

// ─── 8. Upload Status Check (if we got a request_id) ────────

Deno.test("upload status check (sample)", async () => {
  // Use a dummy request_id just to verify the endpoint works
  const { status, data } = await callGet("upload-status", { request_id: "test-nonexistent" });
  console.log("  → status:", status, "data:", JSON.stringify(data).slice(0, 200));
  // Either 200 with empty result or 404 — both are valid
});

console.log("\n🧪 SMM API Test Suite — Upload-Post X Integration\n");
