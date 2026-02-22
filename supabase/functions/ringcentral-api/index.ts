import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RC_SERVER = 'https://platform.ringcentral.com';

async function getOAuthToken(authHeader: string): Promise<string> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !user) throw new Error('Not authenticated');

  const { data: tokenRow, error: dbError } = await supabase
    .from('ringcentral_tokens')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (dbError || !tokenRow) {
    throw new Error('RingCentral not connected. Please authorize via OAuth first.');
  }

  const expiresAt = new Date(tokenRow.expires_at).getTime();
  if (Date.now() > expiresAt - 60000) {
    console.log('Token expired, refreshing...');
    const clientId = Deno.env.get('RINGCENTRAL_CLIENT_ID')!;
    const clientSecret = Deno.env.get('RINGCENTRAL_CLIENT_SECRET')!;
    const basicAuth = btoa(`${clientId}:${clientSecret}`);

    const res = await fetch(`${RC_SERVER}/restapi/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenRow.refresh_token,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Token refresh failed:', errBody);
      await supabase.from('ringcentral_tokens').delete().eq('user_id', user.id);
      throw new Error('RingCentral token expired. Please reconnect.');
    }

    const newTokens = await res.json();
    const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();

    await supabase
      .from('ringcentral_tokens')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    console.log('Token refreshed successfully');
    return newTokens.access_token;
  }

  return tokenRow.access_token;
}

async function rcGet(path: string, token: string): Promise<any> {
  const res = await fetch(`${RC_SERVER}${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`RC API error ${res.status}: ${errBody}`);
  }
  return res.json();
}

async function rcPost(path: string, token: string, body: any): Promise<any> {
  const res = await fetch(`${RC_SERVER}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`RC API error ${res.status}: ${errBody}`);
  }
  return res.json();
}

function simplifyCallLog(record: any) {
  return {
    id: record.id,
    sessionId: record.sessionId,
    type: record.type,
    direction: record.direction?.toLowerCase() || 'unknown',
    from: record.from?.phoneNumber || record.from?.name || 'Unknown',
    to: record.to?.phoneNumber || record.to?.name || 'Unknown',
    startTime: record.startTime,
    duration: record.duration,
    result: record.result,
    action: record.action,
    recording: record.recording ? {
      id: record.recording.id,
      contentUri: record.recording.contentUri,
      type: record.recording.type,
    } : null,
  };
}

function simplifyMessage(record: any) {
  return {
    id: record.id,
    type: record.type,
    direction: record.direction?.toLowerCase() || 'unknown',
    from: record.from?.phoneNumber || record.from?.name || 'Unknown',
    to: record.to?.map((t: any) => t.phoneNumber || t.name).join(', ') || 'Unknown',
    subject: record.subject || '',
    messageStatus: record.messageStatus,
    readStatus: record.readStatus,
    createdAt: record.creationTime || record.lastModifiedTime,
    attachments: record.attachments?.map((a: any) => ({
      id: a.id,
      uri: a.uri,
      type: a.type,
      contentType: a.contentType,
    })) || [],
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    console.log('RC API called, action:', action);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = await getOAuthToken(authHeader);

    switch (action) {
      case 'sms-list': {
        const perPage = url.searchParams.get('perPage') || '25';
        const data = await rcGet(
          `/restapi/v1.0/account/~/extension/~/message-store?messageType=SMS&perPage=${perPage}`,
          token
        );
        return new Response(JSON.stringify({
          messages: (data.records || []).map(simplifyMessage),
          total: data.paging?.totalRecords || 0,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'sms-send': {
        const body = await req.json();
        if (!body.to || !body.text) {
          return new Response(JSON.stringify({ error: 'to and text required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const smsBody: any = {
          to: [{ phoneNumber: body.to }],
          text: body.text,
        };
        if (body.from) {
          smsBody.from = { phoneNumber: body.from };
        }
        const result = await rcPost(
          '/restapi/v1.0/account/~/extension/~/sms',
          token,
          smsBody
        );
        return new Response(JSON.stringify({ success: true, message: simplifyMessage(result) }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'voicemail-list': {
        const perPage = url.searchParams.get('perPage') || '25';
        const data = await rcGet(
          `/restapi/v1.0/account/~/extension/~/message-store?messageType=VoiceMail&perPage=${perPage}`,
          token
        );
        return new Response(JSON.stringify({
          messages: (data.records || []).map(simplifyMessage),
          total: data.paging?.totalRecords || 0,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'call-log': {
        const perPage = url.searchParams.get('perPage') || '50';
        const dateFrom = url.searchParams.get('dateFrom') || '';
        let path = `/restapi/v1.0/account/~/extension/~/call-log?perPage=${perPage}&view=Detailed`;
        if (dateFrom) path += `&dateFrom=${dateFrom}`;
        const data = await rcGet(path, token);
        return new Response(JSON.stringify({
          calls: (data.records || []).map(simplifyCallLog),
          total: data.paging?.totalRecords || 0,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'extension-info': {
        const data = await rcGet('/restapi/v1.0/account/~/extension/~', token);
        const phoneNumbers = await rcGet('/restapi/v1.0/account/~/extension/~/phone-number', token);
        return new Response(JSON.stringify({
          extension: {
            id: data.id,
            name: data.name,
            extensionNumber: data.extensionNumber,
            status: data.status,
          },
          phoneNumbers: (phoneNumbers.records || []).map((p: any) => ({
            phoneNumber: p.phoneNumber,
            type: p.type,
            usageType: p.usageType,
            features: p.features,
          })),
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'recording': {
        const recordingId = url.searchParams.get('id');
        if (!recordingId) {
          return new Response(JSON.stringify({ error: 'id required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const res = await fetch(
          `${RC_SERVER}/restapi/v1.0/account/~/recording/${recordingId}/content`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error(`Recording fetch failed: ${res.status}`);
        const blob = await res.blob();
        return new Response(blob, {
          headers: {
            ...corsHeaders,
            'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
          },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: any) {
    console.error('RingCentral API error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
