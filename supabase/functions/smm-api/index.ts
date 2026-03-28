import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const API_BASE = 'https://api.upload-post.com/api';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const QUIET_FAILURE_ACTIONS = new Set(['list-scheduled', 'list-profiles', 'upload-history', 'me']);
const uploadProfileCache = new Map<string, string>();

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

async function notifySMMFailure(action: string, statusCode: number, errorBody: string) {
  const pstTime = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const isProviderDown = statusCode === 503 || errorBody.includes('no available server');
  const problem = isProviderDown
    ? `⚠️ Upload-Post API is DOWN (${action}) — their servers are unavailable, not our fault`
    : `${action} failed (HTTP ${statusCode})`;
  const detail = isProviderDown
    ? `The Upload-Post provider returned HTTP ${statusCode}. This is an external outage on their end. No action needed on our side — it will auto-recover.`
    : errorBody.substring(0, 500);

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

/* ── Upload-Post profile resolution (single canonical implementation) ── */

async function fetchUploadProfiles(authHeaders: Record<string, string>) {
  const response = await fetch(`${API_BASE}/uploadposts/users`, {
    method: 'GET',
    headers: authHeaders,
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Failed to fetch upload profiles [${response.status}]: ${responseText}`);
  }

  const parsed = JSON.parse(responseText);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.profiles)) return parsed.profiles;
  if (Array.isArray(parsed?.users)) return parsed.users;
  return [];
}

async function resolveUploadProfileUsername(rawUser: string, authHeaders: Record<string, string>) {
  const trimmed = rawUser.trim().replace(/^@+/, '');
  if (!trimmed) return rawUser;

  const normalized = trimmed.toLowerCase();
  const cached = uploadProfileCache.get(normalized);
  if (cached) return cached;

  const profiles = await fetchUploadProfiles(authHeaders);
  const matchedProfile = profiles.find((profile: any) => {
    const username = String(profile?.username || '').trim();
    const xHandle = String(profile?.social_accounts?.x?.handle || '').trim();
    const xDisplayName = String(profile?.social_accounts?.x?.display_name || '').trim();
    const candidates = [username, xHandle, xDisplayName]
      .filter(Boolean)
      .map((v) => v.replace(/^@+/, '').toLowerCase());
    return candidates.includes(normalized);
  });

  if (!matchedProfile?.username) {
    return rawUser;
  }

  const resolvedUsername = String(matchedProfile.username).trim();
  uploadProfileCache.set(normalized, resolvedUsername);
  uploadProfileCache.set(resolvedUsername.toLowerCase(), resolvedUsername);
  const xHandle = String(matchedProfile?.social_accounts?.x?.handle || '').trim();
  if (xHandle) {
    uploadProfileCache.set(xHandle.replace(/^@+/, '').toLowerCase(), resolvedUsername);
  }
  console.log(`[smm-api] Resolved Upload-Post user '${rawUser}' -> '${resolvedUsername}'`);
  return resolvedUsername;
}

/* ── Main handler ── */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const UPLOAD_POST_API_KEY = Deno.env.get('UPLOAD_POST_API_KEY');
  if (!UPLOAD_POST_API_KEY) {
    return new Response(JSON.stringify({ error: 'UPLOAD_POST_API_KEY is not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    if (!action) {
      return new Response(JSON.stringify({ error: 'action parameter is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeaders: Record<string, string> = {
      'Authorization': `Apikey ${UPLOAD_POST_API_KEY}`,
    };

    let apiUrl: string;
    let method = 'GET';
    let body: BodyInit | null = null;

    switch (action) {
      case 'list-profiles': {
        apiUrl = `${API_BASE}/uploadposts/users`;
        break;
      }
      case 'get-profile': {
        const username = url.searchParams.get('username');
        apiUrl = `${API_BASE}/uploadposts/users/${username}`;
        break;
      }
      case 'create-profile': {
        apiUrl = `${API_BASE}/uploadposts/users`;
        method = 'POST';
        const reqBody = await req.json();
        body = JSON.stringify(reqBody);
        authHeaders['Content-Type'] = 'application/json';
        break;
      }
      case 'delete-profile': {
        apiUrl = `${API_BASE}/uploadposts/users`;
        method = 'DELETE';
        const reqBody = await req.json();
        body = JSON.stringify(reqBody);
        authHeaders['Content-Type'] = 'application/json';
        break;
      }
      case 'generate-jwt': {
        apiUrl = `${API_BASE}/uploadposts/users/generate-jwt`;
        method = 'POST';
        const reqBody = await req.json();
        body = JSON.stringify(reqBody);
        authHeaders['Content-Type'] = 'application/json';
        break;
      }
      case 'me': {
        apiUrl = `${API_BASE}/uploadposts/me`;
        break;
      }

      case 'upload-video':
      case 'upload-photos':
      case 'upload-text':
      case 'upload-document': {
        const endpoint = action === 'upload-video' ? '/upload'
          : action === 'upload-photos' ? '/upload_photos'
          : action === 'upload-text' ? '/upload_text'
          : '/upload_document';
        apiUrl = `${API_BASE}${endpoint}`;
        method = 'POST';

        const contentType = req.headers.get('content-type') || '';
        if (contentType.includes('multipart/form-data')) {
          body = await req.arrayBuffer();
          authHeaders['Content-Type'] = contentType;
        } else {
          const reqBody = await req.json();

          // ── Resolve username before sending to Upload-Post ──
          if (reqBody.user) {
            reqBody.user = await resolveUploadProfileUsername(String(reqBody.user), authHeaders);
          }

          const platforms: string[] = reqBody['platform[]'] || reqBody['platforms'] || [];
          const platformList = Array.isArray(platforms) ? platforms : [platforms];
          const hasInstagram = platformList.some((p: string) => String(p).toLowerCase() === 'instagram');
          const hasTiktok = platformList.some((p: string) => String(p).toLowerCase() === 'tiktok');

          if (hasInstagram) {
            if (!reqBody.ig_post_type) {
              reqBody.ig_post_type = 'reels';
              console.log('[smm-api] Auto-set ig_post_type=reels');
            }
            if (!reqBody.share_to_feed && reqBody.share_to_feed !== false) {
              reqBody.share_to_feed = 'true';
              console.log('[smm-api] Auto-set share_to_feed=true');
            }
          }

          // 7-day @ mention cooldown — applies to both Instagram and TikTok
          if ((hasInstagram || hasTiktok) && !reqBody.user_tags) {
            const caption = `${reqBody.title || ''} ${reqBody.description || ''}`.toLowerCase();
            const candidateTags: { tag: string }[] = [];
            if (caption.includes('lamb')) candidateTags.push({ tag: '@lamb.wavv' });
            if (caption.includes('oranj') || caption.includes('orang')) candidateTags.push({ tag: '@oranjgoodman' });

            if (candidateTags.length > 0) {
              try {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                const recentRes = await fetch(
                  `${SUPABASE_URL}/rest/v1/calendar_events?category=in.(smm,artist-campaign)&source_id=like.published-%25&start_time=gte.${sevenDaysAgo}&select=title,description&limit=500`,
                  { headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` } }
                );
                const recentPublished: any[] = recentRes.ok ? await recentRes.json() : [];
                const recentText = recentPublished.map((e: any) => `${e.title || ''} ${e.description || ''}`).join(' ').toLowerCase();

                const filteredTags = candidateTags.filter(({ tag }) => {
                  const tagLower = tag.toLowerCase().replace('@', '');
                  const recentlyMentioned = recentText.includes(tag.toLowerCase()) || recentText.includes(tagLower);
                  if (recentlyMentioned) {
                    console.log(`[smm-api] Skipping user_tag ${tag} — mentioned within last 7 days`);
                  }
                  return !recentlyMentioned;
                });

                // Instagram: add user_tags param
                if (filteredTags.length > 0 && hasInstagram) {
                  reqBody.user_tags = filteredTags.map(t => t.tag).join(', ');
                  console.log(`[smm-api] Auto-tagging Instagram user_tags: ${reqBody.user_tags}`);
                }

                // TikTok & all platforms: strip cooled-down @ mentions from caption
                const cooledDownTags = candidateTags.filter(t => !filteredTags.includes(t));
                if (cooledDownTags.length > 0 && reqBody.title) {
                  let cleaned = reqBody.title;
                  for (const { tag } of cooledDownTags) {
                    cleaned = cleaned.replace(new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
                  }
                  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
                  if (cleaned !== reqBody.title) {
                    console.log(`[smm-api] Stripped cooled-down mentions from caption`);
                    reqBody.title = cleaned;
                  }
                }
              } catch (cooldownErr) {
                console.error('[smm-api] Mention cooldown check failed, applying tags:', cooldownErr);
                if (hasInstagram) {
                  reqBody.user_tags = candidateTags.map(t => t.tag).join(', ');
                }
              }
            }
          }

          const params = new URLSearchParams();
          Object.entries(reqBody).forEach(([key, value]) => {
            if (Array.isArray(value)) {
              const appendKey = key.endsWith('[]') ? key : `${key}[]`;
              value.forEach(v => params.append(appendKey, String(v)));
            } else if (value !== undefined && value !== null) {
              params.append(key, String(value));
            }
          });
          body = params.toString();
          authHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        break;
      }

      case 'upload-status': {
        const requestId = url.searchParams.get('request_id');
        const jobId = url.searchParams.get('job_id');
        const params = new URLSearchParams();
        if (requestId) params.set('request_id', requestId);
        if (jobId) params.set('job_id', jobId);
        apiUrl = `${API_BASE}/uploadposts/status?${params}`;
        break;
      }
      case 'upload-history': {
        const user = url.searchParams.get('user') || url.searchParams.get('profile') || '';
        const page = url.searchParams.get('page') || '1';
        const limit = url.searchParams.get('limit') || '50';
        const params = new URLSearchParams({ page, limit });
        if (user) params.set('user', user);
        apiUrl = `${API_BASE}/uploadposts/history?${params}`;
        break;
      }
      case 'list-scheduled': {
        apiUrl = `${API_BASE}/uploadposts/schedule`;
        break;
      }
      case 'cancel-scheduled': {
        const jobId = url.searchParams.get('job_id');
        apiUrl = `${API_BASE}/uploadposts/schedule/${jobId}`;
        method = 'DELETE';
        break;
      }
      case 'edit-scheduled': {
        const jobId = url.searchParams.get('job_id');
        apiUrl = `${API_BASE}/uploadposts/schedule/${jobId}`;
        method = 'PATCH';
        const reqBody = await req.json();
        body = JSON.stringify(reqBody);
        authHeaders['Content-Type'] = 'application/json';
        break;
      }

      case 'queue-settings': {
        const profile = url.searchParams.get('profile') || url.searchParams.get('profile_username');
        apiUrl = `${API_BASE}/uploadposts/queue/settings${profile ? `?profile_username=${profile}` : ''}`;
        break;
      }
      case 'update-queue-settings': {
        apiUrl = `${API_BASE}/uploadposts/queue/settings`;
        method = 'POST';
        const reqBody = await req.json();
        body = JSON.stringify(reqBody);
        authHeaders['Content-Type'] = 'application/json';
        break;
      }
      case 'queue-preview': {
        const profile = url.searchParams.get('profile') || url.searchParams.get('profile_username');
        apiUrl = `${API_BASE}/uploadposts/queue/preview${profile ? `?profile_username=${profile}` : ''}`;
        break;
      }
      case 'queue-next-slot': {
        const profile = url.searchParams.get('profile') || url.searchParams.get('profile_username');
        apiUrl = `${API_BASE}/uploadposts/queue/next-slot${profile ? `?profile_username=${profile}` : ''}`;
        break;
      }

      case 'analytics': {
        const profileUsername = url.searchParams.get('profile_username');
        const platforms = url.searchParams.get('platforms');
        const pageId = url.searchParams.get('page_id');
        const pageUrn = url.searchParams.get('page_urn');
        const params = new URLSearchParams();
        if (platforms) params.set('platforms', platforms);
        if (pageId) params.set('page_id', pageId);
        if (pageUrn) params.set('page_urn', pageUrn);
        apiUrl = `${API_BASE}/analytics/${profileUsername}?${params}`;
        break;
      }

      case 'facebook-pages': {
        const profile = url.searchParams.get('profile');
        apiUrl = `${API_BASE}/uploadposts/facebook/pages${profile ? `?profile=${profile}` : ''}`;
        break;
      }
      case 'linkedin-pages': {
        const profile = url.searchParams.get('profile');
        apiUrl = `${API_BASE}/uploadposts/linkedin/pages${profile ? `?profile=${profile}` : ''}`;
        break;
      }
      case 'pinterest-boards': {
        const profile = url.searchParams.get('profile');
        apiUrl = `${API_BASE}/uploadposts/pinterest/boards${profile ? `?profile=${profile}` : ''}`;
        break;
      }

      case 'ig-media': {
        const user = url.searchParams.get('user');
        apiUrl = `${API_BASE}/uploadposts/media?platform=instagram&user=${user}`;
        break;
      }
      case 'ig-comments': {
        const user = url.searchParams.get('user');
        const postId = url.searchParams.get('post_id');
        const postUrl = url.searchParams.get('post_url');
        const params = new URLSearchParams({ platform: 'instagram', user: user || '' });
        if (postId) params.set('post_id', postId);
        if (postUrl) params.set('post_url', postUrl);
        apiUrl = `${API_BASE}/uploadposts/comments?${params}`;
        break;
      }
      case 'ig-comment-reply': {
        apiUrl = `${API_BASE}/uploadposts/comments/reply`;
        method = 'POST';
        const reqBody = await req.json();
        body = JSON.stringify(reqBody);
        authHeaders['Content-Type'] = 'application/json';
        break;
      }
      case 'ig-dm-send': {
        apiUrl = `${API_BASE}/uploadposts/dms/send`;
        method = 'POST';
        const reqBody = await req.json();
        body = JSON.stringify(reqBody);
        authHeaders['Content-Type'] = 'application/json';
        break;
      }
      case 'ig-conversations': {
        const user = url.searchParams.get('user');
        apiUrl = `${API_BASE}/uploadposts/dms/conversations?platform=instagram&user=${user}`;
        break;
      }

      case 'configure-notifications': {
        apiUrl = 'https://app.upload-post.com/api/uploadposts/users/notifications';
        method = 'POST';
        const reqBody = await req.json();
        body = JSON.stringify(reqBody);
        authHeaders['Content-Type'] = 'application/json';
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    if (action.startsWith('upload-')) {
      console.log(`[smm-api] action=${action} method=${method} apiUrl=${apiUrl}`);
    }

    const fetchOpts: RequestInit = { method, headers: authHeaders };
    if (body && method !== 'GET') {
      fetchOpts.body = body;
    }

    const response = await fetch(apiUrl, fetchOpts);
    const responseText = await response.text();

    if (action === 'list-profiles' || action === 'get-profile' || action === 'me') {
      try {
        const parsed = JSON.parse(responseText);
        console.log(`[smm-api] action=${action} response keys:`, Object.keys(parsed));
        if (action === 'list-profiles') {
          if (parsed.profiles) console.log('[smm-api] has .profiles, count:', parsed.profiles.length);
          if (parsed.users) console.log('[smm-api] has .users, count:', parsed.users.length);
          if (Array.isArray(parsed)) console.log('[smm-api] response is array, count:', parsed.length);
          const firstItem = parsed.profiles?.[0] || parsed.users?.[0] || (Array.isArray(parsed) ? parsed[0] : null);
          if (firstItem) console.log('[smm-api] first item keys:', Object.keys(firstItem));
        }
      } catch {
      }
    }

    if (!response.ok) {
      console.error(`[smm-api] Upload-Post API error [${response.status}] for action=${action}: ${responseText}`);
      if (action === 'list-scheduled') {
        return new Response(JSON.stringify({ success: false, scheduled_posts: [], error: 'Could not retrieve scheduled posts.' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (action === 'list-profiles') {
        return new Response(JSON.stringify({ success: true, profiles: [], error: 'Provider temporarily unavailable.' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (action === 'upload-history') {
        return new Response(JSON.stringify({ success: true, history: [], error: 'Provider temporarily unavailable.' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (action === 'me') {
        return new Response(JSON.stringify({ success: true, plan: null, email: null, error: 'Provider temporarily unavailable.' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!QUIET_FAILURE_ACTIONS.has(action)) {
        await notifySMMFailure(action, response.status, responseText);
      }
      return new Response(responseText, {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action.startsWith('upload-') && action !== 'upload-status') {
      console.log(`[smm-api] ✅ action=${action} status=${response.status} response:`, responseText.substring(0, 500));
    }

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
