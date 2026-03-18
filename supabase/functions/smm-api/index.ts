import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const API_BASE = 'https://api.upload-post.com/api';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

async function logSMMActivity(action: string, meta: Record<string, any>) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ entity_type: 'smm', action, meta }),
    });
  } catch (e) { console.error('[smm-api] activity log error:', e); }
}

const QUIET_FAILURE_ACTIONS = new Set(['list-scheduled']);

async function notifySMMFailure(action: string, statusCode: number, errorBody: string) {
  const pstTime = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const problem = `${action} failed (HTTP ${statusCode})`;
  const detail = errorBody.substring(0, 500);

  // 1) Telegram notification
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/telegram-notify`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        record: {
          id: crypto.randomUUID(),
          entity_type: 'smm',
          entity_id: null,
          action: 'failed',
          actor_id: null,
          meta: { name: `🚨 SMM FAILURE: ${problem}`, detail, timestamp: pstTime },
          created_at: new Date().toISOString(),
        },
      }),
    });
  } catch (e) { console.error('[smm-api] telegram failure notify error:', e); }

  // 2) Email via gmail-api
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/gmail-api`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'send',
        to: 'warren@stu25.com',
        subject: `STU25DEBUG: ${problem}`,
        body: `SMM Failure Alert\n\nAction: ${action}\nHTTP Status: ${statusCode}\nTime (PST): ${pstTime}\n\nError Details:\n${detail}`,
      }),
    });
  } catch (e) { console.error('[smm-api] email failure notify error:', e); }
}
...
    if (!response.ok) {
      console.error(`[smm-api] Upload-Post API error [${response.status}] for action=${action}: ${responseText}`);
      if (!QUIET_FAILURE_ACTIONS.has(action)) {
        await notifySMMFailure(action, response.status, responseText);
      }
      return new Response(responseText, {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log response for upload actions so we can debug async issues
    if (action.startsWith('upload-') && action !== 'upload-status') {
      console.log(`[smm-api] ✅ action=${action} status=${response.status} response:`, responseText.substring(0, 500));
    }

    // Log upload/post/schedule/DM actions to activity_log for Telegram notifications
    const LOGGABLE = ['upload-video','upload-photos','upload-text','upload-document','cancel-scheduled','edit-scheduled','ig-dm-send','ig-comment-reply','update-queue-settings'];
    if (LOGGABLE.includes(action)) {
      const label = action.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      await logSMMActivity(action, { name: `SMM: ${label}` });
    }

    return new Response(responseText, {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('SMM API proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
