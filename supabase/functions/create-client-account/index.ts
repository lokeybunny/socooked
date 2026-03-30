import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action || 'create';

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ─── Activate / Deactivate user by email ───
    if (action === 'deactivate' || action === 'activate') {
      const email = body.email;
      if (!email) {
        return new Response(JSON.stringify({ error: 'email required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const user = listData?.users?.find(u => u.email === email);
      if (!user) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'deactivate') {
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          ban_duration: '876000h', // ~100 years = effectively banned
        });
        console.log(`[client-account] Deactivated user ${user.id} (${email})`);
      } else {
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          ban_duration: 'none',
        });
        console.log(`[client-account] Activated user ${user.id} (${email})`);
      }

      return new Response(JSON.stringify({ success: true, user_id: user.id, action }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Create / Update client account ───
    const email = body.email;
    const password = body.password;
    const landing_page_id = body.landing_page_id;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'email and password required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let userId: string;

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: email.split('@')[0], role: 'client' },
    });

    if (createError) {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = listData?.users?.find(u => u.email === email);
      if (existing) {
        await supabaseAdmin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
        userId = existing.id;
      } else {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      userId = newUser.user.id;
    }

    if (landing_page_id) {
      await supabaseAdmin
        .from('lw_landing_pages')
        .update({ client_user_id: userId, client_password: '••••••' })
        .eq('id', landing_page_id);
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
