import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DARKSIDE_BASE = 'https://darksidepanel.com/api/v2';
const DARKSIDE_KEY = Deno.env.get('DARKSIDE_SMM_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

// ─── Darkside API call ───
async function darksideCall(params: Record<string, string>) {
  const body = new URLSearchParams({ key: DARKSIDE_KEY, ...params });
  const res = await fetch(DARKSIDE_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text, status: res.status }; }
}

// ─── DB helpers ───
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    if (!action) return fail('action query param required');

    let body: any = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { body = {}; }
    }

    switch (action) {

      // ═══ LIST SERVICES ═══
      // Returns available Darkside SMM services (likes, views, followers, etc.)
      case 'services': {
        const result = await darksideCall({ action: 'services' });
        return ok(result);
      }

      // ═══ ADD ORDER ═══
      // Place a new boost order
      case 'add': {
        const { service, link, quantity, profile_username, schedule_item_id, plan_id, platform } = body;
        if (!service || !link || !quantity) return fail('service, link, and quantity are required');

        const result = await darksideCall({
          action: 'add',
          service: String(service),
          link,
          quantity: String(quantity),
        });

        if (result.order) {
          // Save order to tracking table
          await dbInsert('smm_boost_orders', {
            profile_username: profile_username || 'STU25',
            schedule_item_id: schedule_item_id || null,
            plan_id: plan_id || null,
            platform: platform || 'instagram',
            service_id: String(service),
            service_name: body.service_name || `Service #${service}`,
            quantity: Number(quantity),
            link,
            order_id: String(result.order),
            status: 'ordered',
          });
        }

        return ok(result);
      }

      // ═══ ORDER STATUS ═══
      case 'status': {
        const orderId = url.searchParams.get('order') || body.order;
        if (!orderId) return fail('order id required');

        const result = await darksideCall({ action: 'status', order: String(orderId) });

        // Update local tracking if we have status info
        if (result.status) {
          await dbPatch('smm_boost_orders', `order_id=eq.${orderId}`, {
            darkside_status: result.status,
            charge: result.charge || 0,
            start_count: result.start_count || null,
            remains: result.remains || null,
            status: result.status === 'Completed' ? 'completed' :
                    result.status === 'Canceled' ? 'cancelled' :
                    result.status === 'In progress' ? 'in_progress' :
                    result.status === 'Partial' ? 'partial' : 'ordered',
            updated_at: new Date().toISOString(),
          });
        }

        return ok(result);
      }

      // ═══ MULTI-STATUS ═══
      case 'multi-status': {
        const orders = body.orders;
        if (!orders || !Array.isArray(orders)) return fail('orders array required');

        const result = await darksideCall({
          action: 'status',
          orders: orders.join(','),
        });

        return ok(result);
      }

      // ═══ BALANCE ═══
      case 'balance': {
        const result = await darksideCall({ action: 'balance' });
        return ok(result);
      }

      // ═══ AUTO-BOOST (called after post publish) ═══
      // Fires all pre-configured boost services for a schedule item
      case 'auto-boost': {
        const { schedule_item_id, plan_id, link, platform, services: boostServices } = body;
        if (!link || !boostServices?.length) return fail('link and services are required');

        const results: any[] = [];
        for (const svc of boostServices) {
          try {
            const result = await darksideCall({
              action: 'add',
              service: String(svc.service_id),
              link,
              quantity: String(svc.quantity),
            });

            if (result.order) {
              await dbInsert('smm_boost_orders', {
                profile_username: body.profile_username || 'STU25',
                post_id: body.post_id || null,
                schedule_item_id: schedule_item_id || null,
                plan_id: plan_id || null,
                platform: platform || 'instagram',
                service_id: String(svc.service_id),
                service_name: svc.service_name || `Service #${svc.service_id}`,
                quantity: Number(svc.quantity),
                link,
                order_id: String(result.order),
                status: 'ordered',
              });
            }

            results.push({ service_id: svc.service_id, order: result.order, error: result.error });
          } catch (e: any) {
            results.push({ service_id: svc.service_id, error: e.message });
          }
        }

        return ok({ placed: results.filter(r => r.order).length, results });
      }

      default:
        return fail(`Unknown action: ${action}`);
    }

  } catch (error: any) {
    console.error('[darkside-smm] error:', error);
    return fail(error.message, 500);
  }
});
