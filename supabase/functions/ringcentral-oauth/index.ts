import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RC_SERVER = 'https://platform.ringcentral.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const clientId = Deno.env.get('RINGCENTRAL_CLIENT_ID')!;
    const clientSecret = Deno.env.get('RINGCENTRAL_CLIENT_SECRET')!;
    const redirectUri = 'https://stu25.com/phone';

    console.log('RC OAuth action:', action);

    switch (action) {
      // Step 1: Return the authorization URL for the frontend to redirect to
      case 'auth-url': {
        const authUrl = `${RC_SERVER}/restapi/oauth/authorize?` + new URLSearchParams({
          response_type: 'code',
          client_id: clientId,
          redirect_uri: redirectUri,
          state: url.searchParams.get('state') || 'rc-oauth',
        });
        return new Response(JSON.stringify({ url: authUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Step 2: Exchange authorization code for tokens
      case 'callback': {
        const code = url.searchParams.get('code');
        if (!code) {
          return new Response(JSON.stringify({ error: 'Missing authorization code' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get user from auth header
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
          return new Response(JSON.stringify({ error: 'Not authenticated' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const basicAuth = btoa(`${clientId}:${clientSecret}`);
        const tokenRes = await fetch(`${RC_SERVER}/restapi/oauth/token`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
          }),
        });

        if (!tokenRes.ok) {
          const errBody = await tokenRes.text();
          console.error('Token exchange failed:', errBody);
          return new Response(JSON.stringify({ error: 'Token exchange failed', details: errBody }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const tokens = await tokenRes.json();
        console.log('Token exchange success, expires_in:', tokens.expires_in);

        // Store tokens in DB using service role
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        // Extract user ID from JWT
        const jwt = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
        if (userError || !user) {
          return new Response(JSON.stringify({ error: 'Invalid user token' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

        const { error: dbError } = await supabase
          .from('ringcentral_tokens')
          .upsert({
            user_id: user.id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        if (dbError) {
          console.error('DB upsert error:', dbError);
          return new Response(JSON.stringify({ error: 'Failed to store tokens' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check connection status
      case 'status': {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
          return new Response(JSON.stringify({ connected: false }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        const jwt = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(jwt);
        if (!user) {
          return new Response(JSON.stringify({ connected: false }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: tokenRow } = await supabase
          .from('ringcentral_tokens')
          .select('expires_at')
          .eq('user_id', user.id)
          .maybeSingle();

        return new Response(JSON.stringify({
          connected: !!tokenRow,
          expires_at: tokenRow?.expires_at || null,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Disconnect
      case 'disconnect': {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
          return new Response(JSON.stringify({ error: 'Not authenticated' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        const jwt = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(jwt);
        if (!user) {
          return new Response(JSON.stringify({ error: 'Invalid user' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        await supabase
          .from('ringcentral_tokens')
          .delete()
          .eq('user_id', user.id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: any) {
    console.error('RC OAuth error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
