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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_SECRET = Deno.env.get('BOT_SECRET') ?? '';

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
        .select('start_time')
        .eq('job_id', jobId)
        .maybeSingle();
      const startedAt = existing?.start_time ? new Date(existing.start_time).getTime() : null;
      const duration = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : null;

      const { error } = await admin
        .from('recording_jobs')
        .update({
          status: 'completed',
          end_time: nowIso,
          ...(duration !== null ? { duration_seconds: duration } : {}),
        })
        .eq('job_id', jobId)
        .not('status', 'in', '(completed,failed)');
      if (error) return json({ error: error.message }, 500);
      await logEvent(jobId, 'stop_requested', body.reason ?? 'Manual stop — marked completed');
      if (auth.userId) {
        await admin.from('recording_action_logs').insert({ user_id: auth.userId, job_id: jobId, action: 'stop', message: body.reason ?? null });
      }
      return json({ ok: true });
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
