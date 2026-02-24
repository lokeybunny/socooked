import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const API_BASE = 'https://api.upload-post.com/api';

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
    let body: any = null;
    let isFormData = false;

    switch (action) {
      // ─── User/Profile Management ───
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

      // ─── Upload Content ───
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
          // Forward multipart form data as-is
          body = await req.arrayBuffer();
          isFormData = true;
          // Forward the content-type with boundary
          authHeaders['Content-Type'] = contentType;
        } else {
          // JSON body with URL-based uploads
          const reqBody = await req.json();
          // Build FormData from JSON for the API
          const formData = new FormData();
          Object.entries(reqBody).forEach(([key, value]) => {
            if (Array.isArray(value)) {
              value.forEach(v => formData.append(`${key}[]`, String(v)));
            } else if (value !== undefined && value !== null) {
              formData.append(key, String(value));
            }
          });
          body = formData;
          isFormData = true;
          // Don't set Content-Type for FormData - let fetch set it with boundary
          delete authHeaders['Content-Type'];
        }
        break;
      }

      // ─── Upload Management ───
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
        const page = url.searchParams.get('page') || '1';
        const limit = url.searchParams.get('limit') || '50';
        apiUrl = `${API_BASE}/uploadposts/history?page=${page}&limit=${limit}`;
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

      // ─── Queue System ───
      case 'queue-settings': {
        const profile = url.searchParams.get('profile');
        apiUrl = `${API_BASE}/uploadposts/queue/settings${profile ? `?profile=${profile}` : ''}`;
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
        const profile = url.searchParams.get('profile');
        apiUrl = `${API_BASE}/uploadposts/queue/preview${profile ? `?profile=${profile}` : ''}`;
        break;
      }
      case 'queue-next-slot': {
        const profile = url.searchParams.get('profile');
        apiUrl = `${API_BASE}/uploadposts/queue/next-slot${profile ? `?profile=${profile}` : ''}`;
        break;
      }

      // ─── Analytics ───
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

      // ─── Platform Resources ───
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

      // ─── Instagram Interactions ───
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

      // ─── Webhooks ───
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

    const fetchOpts: RequestInit = { method, headers: authHeaders };
    if (body && method !== 'GET') {
      fetchOpts.body = body;
    }

    const response = await fetch(apiUrl, fetchOpts);
    const responseText = await response.text();

    // Debug: log response structure for profile-related actions
    if (action === 'list-profiles' || action === 'get-profile' || action === 'me') {
      try {
        const parsed = JSON.parse(responseText);
        console.log(`[smm-api] action=${action} response keys:`, Object.keys(parsed));
        if (action === 'list-profiles') {
          // Log first-level structure to understand the shape
          if (parsed.profiles) console.log('[smm-api] has .profiles, count:', parsed.profiles.length);
          if (parsed.users) console.log('[smm-api] has .users, count:', parsed.users.length);
          if (Array.isArray(parsed)) console.log('[smm-api] response is array, count:', parsed.length);
          // Log first item keys for debugging
          const firstItem = parsed.profiles?.[0] || parsed.users?.[0] || (Array.isArray(parsed) ? parsed[0] : null);
          if (firstItem) console.log('[smm-api] first item keys:', Object.keys(firstItem));
        }
      } catch { /* not json */ }
    }

    if (!response.ok) {
      console.error(`Upload-Post API error [${response.status}] for action=${action}: ${responseText}`);
      return new Response(responseText, {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
