// AutoR (Auto Recordings) API
// Endpoints (path after /functions/v1/autor-api):
//   POST   /create                  Create a recording job
//   GET    /status/:jobId           Get job status
//   POST   /update-status           Recorder posts status updates / events
//   POST   /stop                    Request stop (manual or stop-phrase)
//   POST   /retry                   Retry a failed job
//   DELETE /:jobId                  Delete a job + storage video
//
// Auth: external recorder service must pass x-bot-secret = BOT_SECRET.
// Dashboard calls go through the supabase-js client (authenticated JWT).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret, range',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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

function hls(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-store',
    },
  });
}

async function logEvent(jobId: string, eventType: string, message?: string, metadata: Record<string, unknown> = {}) {
  await admin.from('recording_events').insert({
    job_id: jobId,
    event_type: eventType,
    message: message ?? null,
    metadata_json: metadata,
  });
}

function isBot(req: Request) {
  return BOT_SECRET && req.headers.get('x-bot-secret') === BOT_SECRET;
}

async function requireAuthOrBot(req: Request): Promise<{ ok: true; userId: string | null } | { ok: false; res: Response }> {
  if (isBot(req)) return { ok: true, userId: null };
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, res: json({ error: 'unauthorized' }, 401) };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false, res: json({ error: 'unauthorized' }, 401) };
  return { ok: true, userId: data.user.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  // Strip the /functions/v1/autor-api prefix
  const path = url.pathname.replace(/^.*\/autor-api/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  const action = parts[0] ?? '';

  try {
    // POST /create
    if (req.method === 'POST' && action === 'create') {
      const auth = await requireAuthOrBot(req);
      if (!auth.ok) return auth.res;
      const body = await req.json().catch(() => ({}));
      const sourceUrl = String(body.url ?? '').trim();
      if (!sourceUrl) return json({ error: 'url required' }, 400);

      // De-dupe: same discord message id should not double-fire
      if (body.discordMessageId) {
        const { data: existing } = await admin
          .from('recording_jobs')
          .select('job_id, status')
          .eq('discord_message_id', String(body.discordMessageId))
          .maybeSingle();
        if (existing) return json({ jobId: existing.job_id, status: existing.status, duplicate: true });
      }

      const { data, error } = await admin
        .from('recording_jobs')
        .insert({
          source_url: sourceUrl,
          source_type: body.sourceType ?? 'axiom',
          discord_server_id: body.discordServerId ?? null,
          discord_server_name: body.discordServerName ?? null,
          discord_channel_id: body.discordChannelId ?? null,
          discord_channel_name: body.discordChannelName ?? null,
          discord_message_id: body.discordMessageId ?? null,
          recording_name: body.recordingName ?? `AutoR ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
          stop_phrase: body.stopPhrase ?? 'all supply has been sold',
          status: 'queued',
        })
        .select()
        .single();

      if (error) return json({ error: error.message }, 500);
      await logEvent(data.job_id, 'created', 'Job queued from Discord URL detection', { source_url: sourceUrl });
      return json({ jobId: data.job_id, status: data.status });
    }

    // GET /status/:jobId
    if (req.method === 'GET' && action === 'status' && parts[1]) {
      const auth = await requireAuthOrBot(req);
      if (!auth.ok) return auth.res;
      const { data, error } = await admin
        .from('recording_jobs')
        .select('job_id, status, duration_seconds, video_url, thumbnail_url, last_error, start_time, end_time')
        .eq('job_id', parts[1])
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: 'not found' }, 404);
      return json({
        jobId: data.job_id,
        status: data.status,
        durationSeconds: data.duration_seconds ?? 0,
        videoUrl: data.video_url ?? '',
        thumbnailUrl: data.thumbnail_url ?? '',
        error: data.last_error ?? '',
      });
    }

    // GET /replay/:sessionId/:pageId
    if (req.method === 'GET' && action === 'replay' && parts[1]) {
      if (!BB_API_KEY) return json({ error: 'BROWSERBASE_API_KEY not configured' }, 500);
      const sessionId = parts[1];
      const pageId = parts[2] ?? '0';

      const r = await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}/replays/${pageId}`, {
        headers: { 'x-bb-api-key': BB_API_KEY },
      });
      const text = await r.text();
      if (!r.ok) return json({ error: 'Browserbase replay unavailable', status: r.status, details: text }, r.status);
      return hls(text);
    }

    // POST /update-status   (recorder service)
    if (req.method === 'POST' && action === 'update-status') {
      if (!isBot(req)) return json({ error: 'forbidden' }, 403);
      const body = await req.json().catch(() => ({}));
      const jobId = String(body.jobId ?? '');
      if (!jobId) return json({ error: 'jobId required' }, 400);

      const patch: Record<string, unknown> = {};
      const allowed = [
        'status', 'video_url', 'thumbnail_url', 'storage_size', 'storage_path',
        'duration_seconds', 'start_time', 'end_time', 'detected_phrase',
        'token_name', 'contract_address', 'last_error', 'retry_count', 'notes',
      ];
      for (const k of allowed) {
        if (body[k] !== undefined) patch[k] = body[k];
      }

      const { data, error } = await admin
        .from('recording_jobs')
        .update(patch)
        .eq('job_id', jobId)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);

      if (body.event) {
        await logEvent(jobId, String(body.event), body.message ?? null, body.metadata ?? {});
      } else if (body.status) {
        await logEvent(jobId, `status:${body.status}`, body.message ?? null);
      }

      return json({ ok: true, status: data.status });
    }

    // POST /stop
    if (req.method === 'POST' && action === 'stop') {
      const auth = await requireAuthOrBot(req);
      if (!auth.ok) return auth.res;
      const body = await req.json().catch(() => ({}));
      const jobId = String(body.jobId ?? '');
      if (!jobId) return json({ error: 'jobId required' }, 400);

      const nowIso = new Date().toISOString();
      const { data: existing } = await admin
        .from('recording_jobs')
        .select('start_time, status, browserbase_session_id, video_url')
        .eq('job_id', jobId)
        .maybeSingle();

      if (!existing) return json({ error: 'not found' }, 404);
      if (existing.status === 'completed' || existing.status === 'failed') {
        return json({ ok: true, alreadyFinal: true });
      }

      const startedAt = existing.start_time ? new Date(existing.start_time).getTime() : null;
      const duration = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : null;

      // Move to processing while we fetch the recording from Browserbase
      await admin.from('recording_jobs').update({ status: 'processing' }).eq('job_id', jobId);
      await logEvent(jobId, 'stop_requested', body.reason ?? 'Manual stop — releasing browser session');

      let recordingUrl = existing.video_url ?? '';

      // If there's an active Browserbase session, release it and poll for recordingUrl
      if (existing.browserbase_session_id && BB_API_KEY && BB_PROJECT_ID) {
        try {
          await fetch(`https://api.browserbase.com/v1/sessions/${existing.browserbase_session_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-bb-api-key': BB_API_KEY },
            body: JSON.stringify({ projectId: BB_PROJECT_ID, status: 'REQUEST_RELEASE' }),
          });

          for (let i = 0; i < 20; i++) {
            const r = await fetch(`https://api.browserbase.com/v1/sessions/${existing.browserbase_session_id}`, {
              headers: { 'x-bb-api-key': BB_API_KEY },
            });
            if (r.ok) {
              const d = await r.json() as { recordingUrl?: string; status?: string };
              if (d.recordingUrl) { recordingUrl = d.recordingUrl; break; }
            }
            await new Promise((res) => setTimeout(res, 2000));
          }
          await logEvent(jobId, 'browser_released', recordingUrl ? 'Recording URL retrieved' : 'Released but no recording URL yet', { recordingUrl });
        } catch (err) {
          await logEvent(jobId, 'browser_release_error', err instanceof Error ? err.message : String(err));
        }
      }

      const patch: Record<string, unknown> = {
        status: 'completed',
        end_time: nowIso,
        ...(duration !== null ? { duration_seconds: duration } : {}),
        ...(recordingUrl ? { video_url: recordingUrl, browserbase_recording_url: recordingUrl } : {}),
      };

      const { error } = await admin
        .from('recording_jobs')
        .update(patch)
        .eq('job_id', jobId);
      if (error) return json({ error: error.message }, 500);

      await logEvent(jobId, 'completed', recordingUrl ? 'Marked completed with recording URL' : 'Marked completed (no recording URL available)', { recordingUrl });
      if (auth.userId) {
        await admin.from('recording_action_logs').insert({ user_id: auth.userId, job_id: jobId, action: 'stop', message: body.reason ?? null });
      }
      return json({ ok: true, videoUrl: recordingUrl });
    }

    // POST /retry
    if (req.method === 'POST' && action === 'retry') {
      const auth = await requireAuthOrBot(req);
      if (!auth.ok) return auth.res;
      const body = await req.json().catch(() => ({}));
      const jobId = String(body.jobId ?? '');
      if (!jobId) return json({ error: 'jobId required' }, 400);

      const { data: existing } = await admin
        .from('recording_jobs')
        .select('retry_count')
        .eq('job_id', jobId)
        .maybeSingle();

      const { error } = await admin
        .from('recording_jobs')
        .update({
          status: 'queued',
          last_error: null,
          retry_count: (existing?.retry_count ?? 0) + 1,
          start_time: null,
          end_time: null,
        })
        .eq('job_id', jobId);
      if (error) return json({ error: error.message }, 500);
      await logEvent(jobId, 'retry_requested', 'Manual retry from dashboard');
      if (auth.userId) {
        await admin.from('recording_action_logs').insert({ user_id: auth.userId, job_id: jobId, action: 'retry' });
      }
      return json({ ok: true });
    }

    // DELETE /:jobId
    if (req.method === 'DELETE' && action) {
      const auth = await requireAuthOrBot(req);
      if (!auth.ok) return auth.res;
      const jobId = action;

      const { data: job } = await admin
        .from('recording_jobs')
        .select('storage_path')
        .eq('job_id', jobId)
        .maybeSingle();

      if (job?.storage_path) {
        await admin.storage.from('autor-recordings').remove([job.storage_path]).catch(() => null);
      }
      await admin.from('recording_events').delete().eq('job_id', jobId);
      const { error } = await admin.from('recording_jobs').delete().eq('job_id', jobId);
      if (error) return json({ error: error.message }, 500);
      if (auth.userId) {
        await admin.from('recording_action_logs').insert({ user_id: auth.userId, job_id: jobId, action: 'delete' });
      }
      return json({ ok: true });
    }

    return json({ error: 'not found', path }, 404);
  } catch (err) {
    console.error('autor-api error', err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
