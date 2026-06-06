// AutoR Browserbase Launcher
// Starts a cloud browser session, navigates to the source URL, and stores
// session ID + live view URL on the recording job so anyone with the link can watch live.
//
// POST { jobId }    -> launches session, stamps recording_jobs row, returns liveViewUrl
// POST { jobId, action: 'stop' } -> stops the session, attaches recording URL
//
// Auth: x-bot-secret = BOT_SECRET, OR a valid Supabase user JWT.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import puppeteer from 'https://esm.sh/puppeteer-core@22.10.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_SECRET = Deno.env.get('BOT_SECRET') ?? '';
const BB_API_KEY = Deno.env.get('BROWSERBASE_API_KEY') ?? '';
const BB_PROJECT_ID = Deno.env.get('BROWSERBASE_PROJECT_ID') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function logEvent(jobId: string, eventType: string, message?: string, metadata: Record<string, unknown> = {}) {
  await admin.from('recording_events').insert({
    job_id: jobId, event_type: eventType, message: message ?? null, metadata_json: metadata,
  });
}

async function authorized(req: Request): Promise<boolean> {
  if (BOT_SECRET && req.headers.get('x-bot-secret') === BOT_SECRET) return true;
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const { data } = await admin.auth.getUser(token);
  return !!data.user;
}

// Browserbase REST: create session, get live view URL, navigate via CDP
async function createBrowserbaseSession() {
  const basePayload = {
    projectId: BB_PROJECT_ID,
    keepAlive: true,
    timeout: 3600,
    userMetadata: { app: 'autor', target: 'axiom' },
  };

  const attempts = [
    {
      ...basePayload,
      proxies: true,
      browserSettings: {
        recordSession: true,
        solveCaptchas: true,
        blockAds: false,
        verified: true,
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      ...basePayload,
      proxies: true,
      browserSettings: {
        recordSession: true,
        solveCaptchas: true,
        blockAds: false,
        viewport: { width: 1280, height: 720 },
      },
    },
  ];

  let lastError = '';
  for (const payload of attempts) {
    const r = await fetch('https://api.browserbase.com/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bb-api-key': BB_API_KEY },
      body: JSON.stringify(payload),
    });
    if (r.ok) return await r.json() as { id: string; connectUrl: string };
    lastError = `${r.status} ${await r.text()}`;
  }
  throw new Error(`browserbase create failed: ${lastError}`);
}

async function getLiveViewUrl(sessionId: string): Promise<string> {
  const r = await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}/debug`, {
    headers: { 'x-bb-api-key': BB_API_KEY },
  });
  if (!r.ok) throw new Error(`browserbase debug failed: ${r.status}`);
  const data = await r.json() as { debuggerFullscreenUrl?: string; debuggerUrl?: string };
  return data.debuggerFullscreenUrl || data.debuggerUrl || '';
}

async function navigateViaCDP(connectUrl: string, targetUrl: string) {
  // Connect to Browserbase via CDP and drive the existing page to the target URL.
  const browser = await puppeteer.connect({ browserWSEndpoint: connectUrl });
  try {
    const pages = await browser.pages();
    const page = pages[0] ?? (await browser.newPage());
    let captchaSolving = false;
    page.on('console', (msg) => {
      const text = msg.text();
      if (text === 'browserbase-solving-started') captchaSolving = true;
      if (text === 'browserbase-solving-finished') captchaSolving = false;
      if (text.includes('browserbase-solving') || text.includes('Private Access Token') || text.includes('WebSocket connection')) {
        console.log(`[autor-browserbase] page console: ${text.slice(0, 500)}`);
      }
    });
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 90000 });
    // Axiom often triggers a browser attestation/captcha pass before the route paints.
    for (let i = 0; i < 18; i++) {
      const ready = await page.evaluate(() => {
        const text = document.body?.innerText?.trim() ?? '';
        const interactive = document.querySelectorAll('button,a,[role="button"],canvas,svg').length;
        return text.length > 20 || interactive > 8;
      }).catch(() => false);
      if (ready && !captchaSolving) break;
      await new Promise((res) => setTimeout(res, 2500));
      if (i === 5 && !captchaSolving) await page.reload({ waitUntil: 'networkidle2', timeout: 90000 }).catch(() => null);
    }
    await page.bringToFront();
    await new Promise((res) => setTimeout(res, 3000));
  } finally {
    // Disconnect (NOT close) — keep the session alive so recording continues until stop.
    await browser.disconnect();
  }
}

async function stopBrowserbaseSession(sessionId: string) {
  await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bb-api-key': BB_API_KEY },
    body: JSON.stringify({ projectId: BB_PROJECT_ID, status: 'REQUEST_RELEASE' }),
  }).catch(() => null);
}

async function getRecordingUrl(sessionId: string): Promise<string> {
  // Browserbase returns recordings asynchronously. Poll session until recordingUrl ready (max ~30s).
  for (let i = 0; i < 15; i++) {
    const r = await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}`, {
      headers: { 'x-bb-api-key': BB_API_KEY },
    });
    if (r.ok) {
      const d = await r.json() as { recordingUrl?: string; status?: string };
      if (d.recordingUrl) return d.recordingUrl;
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  return '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  if (!BB_API_KEY || !BB_PROJECT_ID) {
    return json({ error: 'BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID not configured' }, 500);
  }
  if (!(await authorized(req))) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const jobId = String(body.jobId ?? '');
  if (!jobId) return json({ error: 'jobId required' }, 400);

  const { data: job, error: jobErr } = await admin
    .from('recording_jobs')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();
  if (jobErr || !job) return json({ error: 'job not found' }, 404);

  // STOP path
  if (body.action === 'stop') {
    if (!job.browserbase_session_id) return json({ error: 'no active session' }, 400);
    await stopBrowserbaseSession(job.browserbase_session_id);
    await logEvent(jobId, 'browser_stopping', 'Browserbase release requested');
    const recordingUrl = await getRecordingUrl(job.browserbase_session_id);
    const replayUrl = `${SUPABASE_URL}/functions/v1/autor-api/replay/${job.browserbase_session_id}/0`;
    await admin.from('recording_jobs').update({
      status: 'completed',
      end_time: new Date().toISOString(),
      browserbase_recording_url: recordingUrl || null,
      video_url: recordingUrl || job.video_url || replayUrl,
    }).eq('job_id', jobId);
    await logEvent(jobId, 'completed', 'Browser session ended', { recordingUrl, replayUrl });
    return json({ ok: true, recordingUrl: recordingUrl || replayUrl });
  }

  // LAUNCH path
  try {
    await admin.from('recording_jobs').update({
      status: 'launching_browser',
      start_time: new Date().toISOString(),
    }).eq('job_id', jobId);
    await logEvent(jobId, 'launching_browser', 'Creating Browserbase session');

    const session = await createBrowserbaseSession();
    const liveViewUrl = await getLiveViewUrl(session.id);

    // Stamp session info BEFORE navigation so the live view is watchable even while loading.
    await admin.from('recording_jobs').update({
      browserbase_session_id: session.id,
      browserbase_live_view_url: liveViewUrl,
    }).eq('job_id', jobId);

    try {
      await navigateViaCDP(session.connectUrl, job.source_url);
    } catch (navErr) {
      const msg = navErr instanceof Error ? navErr.message : String(navErr);
      await logEvent(jobId, 'navigation_error', `Failed to navigate: ${msg}`, { sourceUrl: job.source_url });
      throw navErr;
    }

    await admin.from('recording_jobs').update({
      status: 'recording',
    }).eq('job_id', jobId);
    await logEvent(jobId, 'recording', 'Cloud browser opened source URL', {
      sessionId: session.id, sourceUrl: job.source_url,
    });

    return json({ ok: true, sessionId: session.id, liveViewUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin.from('recording_jobs').update({
      status: 'failed',
      last_error: msg,
      end_time: new Date().toISOString(),
    }).eq('job_id', jobId);
    await logEvent(jobId, 'failed', msg);
    return json({ error: msg }, 500);
  }
});
