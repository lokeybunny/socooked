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

async function fetchUploadPostProfiles(apiKey: string) {
  const response = await fetch(`${API_BASE}/uploadposts/users`, {
    method: 'GET',
    headers: {
      'Authorization': `Apikey ${apiKey}`,
    },
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Failed to list Upload-Post profiles [${response.status}]: ${responseText}`);
  }

  const parsed = JSON.parse(responseText);
  return parsed.profiles || parsed.users || (Array.isArray(parsed) ? parsed : []);
}

async function resolveUploadPostUsername(user: string, apiKey: string) {
  const requested = String(user || '').trim();
  if (!requested) return requested;

  const cacheKey = requested.toLowerCase();
  const cached = uploadProfileCache.get(cacheKey);
  if (cached) return cached;

  const profiles = await fetchUploadPostProfiles(apiKey);
  const normalizedRequested = requested.replace(/^@/, '').toLowerCase();

  const matched = profiles.find((profile: any) => {
    const candidates = [
      profile?.username,
      profile?.social_accounts?.x?.handle,
      profile?.social_accounts?.x?.display_name,
    ]
      .filter(Boolean)
      .map((value: string) => String(value).replace(/^@/, '').toLowerCase());

    return candidates.includes(normalizedRequested);
  });

  if (!matched?.username) {
    return requested;
  }

  const resolvedUsername = String(matched.username).trim();
  uploadProfileCache.set(cacheKey, resolvedUsername);
  uploadProfileCache.set(resolvedUsername.toLowerCase(), resolvedUsername);

  const xHandle = matched?.social_accounts?.x?.handle;
  if (xHandle) {
    uploadProfileCache.set(String(xHandle).replace(/^@/, '').toLowerCase(), resolvedUsername);
  }

  return resolvedUsername;
}

function normalizeProfileLookup(value: string) {
  return value.trim().replace(/^@/, '').toLowerCase();
}

async function fetchUploadProfiles(authHeaders: Record<string, string>) {
  const response = await fetch(`${API_BASE}/uploadposts/users`, { method: 'GET', headers: authHeaders });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Failed to list Upload-Post profiles [${response.status}]: ${responseText}`);
  }
  try {
    const parsed = JSON.parse(responseText);
    return parsed.profiles || parsed.users || (Array.isArray(parsed) ? parsed : []);
  } catch {
    throw new Error(`Failed to parse Upload-Post profiles response: ${responseText}`);
  }
}

async function resolveUploadProfileUsername(userValue: string, authHeaders: Record<string, string>) {
  const normalized = normalizeProfileLookup(userValue);
  if (!normalized) return userValue;

  const cached = uploadProfileCache.get(normalized);
  if (cached) return cached;

  const profiles = await fetchUploadProfiles(authHeaders);
  for (const profile of profiles) {
    const username = typeof profile?.username === 'string' ? profile.username : '';
    const directMatch = normalizeProfileLookup(username);
    if (directMatch === normalized) {
      uploadProfileCache.set(normalized, username);
      return username;
    }

    const socialAccounts = profile?.social_accounts || {};
    for (const account of Object.values(socialAccounts)) {
      if (!account || typeof account !== 'object') continue;
      const handle = typeof (account as Record<string, unknown>).handle === 'string' ? String((account as Record<string, unknown>).handle) : '';
      const displayName = typeof (account as Record<string, unknown>).display_name === 'string' ? String((account as Record<string, unknown>).display_name) : '';
      if (normalizeProfileLookup(handle) === normalized || normalizeProfileLookup(displayName) === normalized) {
        uploadProfileCache.set(normalized, username);
        return username;
      }
    }
  }

  return userValue;
}

async function listUploadPostProfiles(uploadPostApiKey: string) {
  const response = await fetch(`${API_BASE}/uploadposts/users`, {
    headers: {
      'Authorization': `Apikey ${uploadPostApiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to list Upload-Post profiles [${response.status}]: ${await response.text()}`);
  }

  const parsed = await response.json();
  return parsed.profiles || parsed.users || (Array.isArray(parsed) ? parsed : []);
}

async function resolveUploadPostUsername(uploadPostApiKey: string, rawUser: unknown) {
  const input = String(rawUser || '').trim();
  if (!input) return input;

  const normalized = input.replace(/^@/, '').toLowerCase();
  if (uploadProfileCache.has(normalized)) {
    return uploadProfileCache.get(normalized)!;
  }

  const profiles = await listUploadPostProfiles(uploadPostApiKey);
  for (const profile of profiles) {
    const profileUsername = String(profile?.username || '').trim();
    const xAccount = profile?.social_accounts?.x || null;
    const handleCandidates = [
      profileUsername,
      xAccount?.handle,
      xAccount?.display_name,
      xAccount?.username,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim());

    const isMatch = handleCandidates.some((candidate) => candidate.replace(/^@/, '').toLowerCase() === normalized);
    if (isMatch && profileUsername) {
      uploadProfileCache.set(normalized, profileUsername);
      uploadProfileCache.set(profileUsername.replace(/^@/, '').toLowerCase(), profileUsername);
      if (xAccount?.handle) uploadProfileCache.set(String(xAccount.handle).replace(/^@/, '').toLowerCase(), profileUsername);
      if (xAccount?.display_name) uploadProfileCache.set(String(xAccount.display_name).replace(/^@/, '').toLowerCase(), profileUsername);
      console.log(`[smm-api] Resolved Upload-Post user '${input}' -> '${profileUsername}'`);
      return profileUsername;
    }
  }

  return input;
}

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

function buildUploadProfileCandidates(rawUser: string) {
  const trimmed = rawUser.trim().replace(/^@+/, '');
  const lower = trimmed.toLowerCase();
  return Array.from(new Set([trimmed, lower]));
}

async function resolveUploadProfileUsername(rawUser: string, authHeaders: Record<string, string>) {
  const candidates = buildUploadProfileCandidates(rawUser);

  for (const candidate of candidates) {
    const cached = uploadProfileCache.get(candidate.toLowerCase());
    if (cached) return cached;
  }

  const profiles = await fetchUploadProfiles(authHeaders);
  const matchedProfile = profiles.find((profile: any) => {
    const username = String(profile?.username || '').trim();
    const xHandle = String(profile?.social_accounts?.x?.handle || '').trim();
    const normalizedUsername = username.toLowerCase();
    const normalizedHandle = xHandle.toLowerCase();
    return candidates.some((candidate) => {
      const normalizedCandidate = candidate.toLowerCase();
      return normalizedCandidate === normalizedUsername || normalizedCandidate === normalizedHandle;
    });
  });

  if (!matchedProfile?.username) {
    return rawUser;
  }

  const resolvedUsername = String(matchedProfile.username).trim();
  for (const candidate of candidates) {
    uploadProfileCache.set(candidate.toLowerCase(), resolvedUsername);
  }
  const xHandle = String(matchedProfile?.social_accounts?.x?.handle || '').trim();
  if (xHandle) {
    uploadProfileCache.set(xHandle.toLowerCase(), resolvedUsername);
  }
  uploadProfileCache.set(resolvedUsername.toLowerCase(), resolvedUsername);

  return resolvedUsername;
}

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

          const platforms: string[] = reqBody['platform[]'] || reqBody['platforms'] || [];
          const hasInstagram = (Array.isArray(platforms) ? platforms : [platforms])
            .some((p: string) => String(p).toLowerCase() === 'instagram');
          if (hasInstagram) {
            if (!reqBody.ig_post_type) {
              reqBody.ig_post_type = 'reels';
              console.log('[smm-api] Auto-set ig_post_type=reels');
            }
            if (!reqBody.share_to_feed && reqBody.share_to_feed !== false) {
              reqBody.share_to_feed = 'true';
              console.log('[smm-api] Auto-set share_to_feed=true');
            }

            if (!reqBody.user_tags) {
              const caption = `${reqBody.title || ''} ${reqBody.description || ''}`.toLowerCase();
              const tags: string[] = [];
              if (caption.includes('lamb')) tags.push('@lamb.wavv');
              if (caption.includes('oranj') || caption.includes('orang')) tags.push('@oranjgoodman');
              if (tags.length > 0) {
                reqBody.user_tags = tags.join(', ');
                console.log(`[smm-api] Auto-tagging Instagram user_tags: ${reqBody.user_tags}`);
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