import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_SECRET = Deno.env.get('BOT_SECRET')!;

// ─── Auth ───
function authCheck(req: Request): Response | null {
  const secret = req.headers.get('x-bot-secret');
  if (!secret || secret !== BOT_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  return null;
}

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fail(msg: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── DB helpers ───
async function dbQuery(table: string, query: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
  });
  return res.json();
}

async function dbInsert(table: string, payload: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function dbPatch(table: string, filter: string, payload: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function logActivity(action: string, meta: Record<string, any>) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ entity_type: 'smm', action, meta }),
    });
  } catch (_) { /* non-blocking */ }
}

// ─── Proxy to smm-scheduler AI ───
async function proxyToScheduler(payload: any) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/smm-scheduler`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// ─── Proxy to smm-api (Upload-Post) ───
async function proxyToSMMApi(action: string, params?: Record<string, string>, body?: any) {
  const searchParams = new URLSearchParams({ action });
  if (params) Object.entries(params).forEach(([k, v]) => { if (v) searchParams.set(k, v); });

  const url = `${SUPABASE_URL}/functions/v1/smm-api?${searchParams}`;
  const fetchOpts: RequestInit = {
    method: body ? 'POST' : 'GET',
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
  };
  if (body) fetchOpts.body = JSON.stringify(body);

  const res = await fetch(url, fetchOpts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text, status: res.status }; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const denied = authCheck(req);
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    if (!action) return fail('action query param required');

    let body: any = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { body = {}; }
    }

    switch (action) {

      // ═══ AI CONTENT PLANNING ═══
      // Cortex sends a natural language prompt → routed to smm-scheduler AI
      case 'plan': {
        const { prompt, profile, history } = body;
        if (!prompt) return fail('prompt is required');
        const result = await proxyToScheduler({ prompt, profile: profile || 'STU25', history });
        await logActivity('cortex_plan', { name: `Cortex content plan request`, profile: profile || 'STU25' });
        return ok(result);
      }

      // ═══ LIST CONTENT PLANS ═══
      case 'list-plans': {
        const profile = url.searchParams.get('profile') || body.profile || 'STU25';
        const status = url.searchParams.get('status') || body.status;
        let query = `profile_username=eq.${profile}&order=created_at.desc&limit=20`;
        if (status) query += `&status=eq.${status}`;
        const plans = await dbQuery('smm_content_plans', query);
        return ok(plans);
      }

      // ═══ GET SINGLE PLAN ═══
      case 'get-plan': {
        const planId = url.searchParams.get('plan_id') || body.plan_id;
        if (!planId) return fail('plan_id required');
        const plan = await dbQuery('smm_content_plans', `id=eq.${planId}`);
        return ok(plan?.[0] || null);
      }

      // ═══ PUSH PLAN TO LIVE ═══
      case 'push-live': {
        const planId = url.searchParams.get('plan_id') || body.plan_id;
        if (!planId) return fail('plan_id required');
        const updated = await dbPatch('smm_content_plans', `id=eq.${planId}`, { status: 'live' });
        await logActivity('schedule_pushed_live', { name: '🔴 Cortex pushed schedule to LIVE', plan_id: planId });
        return ok(updated);
      }

      // ═══ UPDATE PLAN STATUS ═══
      case 'update-plan': {
        const planId = url.searchParams.get('plan_id') || body.plan_id;
        if (!planId) return fail('plan_id required');
        const { status: newStatus, schedule_items, brand_context } = body;
        const patch: any = {};
        if (newStatus) patch.status = newStatus;
        if (schedule_items) patch.schedule_items = schedule_items;
        if (brand_context) patch.brand_context = brand_context;
        const updated = await dbPatch('smm_content_plans', `id=eq.${planId}`, patch);
        return ok(updated);
      }

      // ═══ BRAND PROMPTS ═══
      case 'list-prompts': {
        const profile = url.searchParams.get('profile') || body.profile || 'STU25';
        const prompts = await dbQuery('smm_brand_prompts', `profile_username=eq.${profile}&order=effectiveness_score.desc&limit=50`);
        return ok(prompts);
      }

      case 'save-prompt': {
        const { profile_username, category, niche, prompt_text, example_output } = body;
        if (!prompt_text) return fail('prompt_text required');
        const inserted = await dbInsert('smm_brand_prompts', {
          profile_username: profile_username || 'STU25',
          category: category || 'visual',
          niche: niche || null,
          prompt_text,
          example_output: example_output || null,
        });
        return ok(inserted);
      }

      // ═══ DIRECT POST/SCHEDULE (proxy to Upload-Post API) ═══
      case 'upload-video':
      case 'upload-photos':
      case 'upload-text':
      case 'list-scheduled':
      case 'cancel-scheduled':
      case 'edit-scheduled':
      case 'upload-status':
      case 'upload-history':
      case 'analytics': {
        const params: Record<string, string> = {};
        url.searchParams.forEach((v, k) => { if (k !== 'action') params[k] = v; });
        const result = await proxyToSMMApi(action, params, req.method === 'POST' ? body : undefined);
        await logActivity(`cortex_${action}`, { name: `Cortex: ${action}`, ...params });
        return ok(result);
      }

      // ═══ LIST PROFILES ═══
      case 'list-profiles': {
        const result = await proxyToSMMApi('list-profiles');
        return ok(result);
      }

      // ═══ ANALYTICS ═══
      case 'get-analytics': {
        const profile = url.searchParams.get('profile') || body.profile || 'STU25';
        const platforms = url.searchParams.get('platforms') || body.platforms;
        const result = await proxyToSMMApi('analytics', { profile_username: profile, ...(platforms ? { platforms } : {}) });
        return ok(result);
      }

      // ═══ IG INBOX ═══
      case 'ig-conversations': {
        const user = url.searchParams.get('user') || body.user || 'STU25';
        const result = await proxyToSMMApi('ig-conversations', { user });
        return ok(result);
      }

      case 'ig-dm-send': {
        const result = await proxyToSMMApi('ig-dm-send', {}, body);
        return ok(result);
      }

      default:
        return fail(`Unknown action: ${action}`);
    }

  } catch (error: any) {
    console.error('[smm-command] error:', error);
    return fail(error.message, 500);
  }
});
