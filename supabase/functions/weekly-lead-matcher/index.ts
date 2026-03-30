import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Weekly Lead Matcher — runs every Monday at 6am via pg_cron
 * 
 * 1. For each active landing page with a client_user_id:
 *    - Check weekly cap (50 leads/week)
 *    - Pull REAPI distress leads matching buyer preferences
 *    - Insert matched leads into lw_landing_leads
 *    - Track cap usage in lw_client_lead_caps
 * 2. Send collective email digest via Gmail API
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const REAPI_KEY = Deno.env.get('REAPI_API_KEY');
    const WEEKLY_CAP = 50;
    const TRIAL_CAP = 5; // Free trial users get max 5 leads in 24h

    // Get current week start (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const weekStart = monday.toISOString().split('T')[0];

    // Get all active landing pages with client accounts
    // IMPORTANT: Only auto-push to "subscriber" (warm) buyers — NOT active buyers
    const { data: pages } = await supabaseAdmin
      .from('lw_landing_pages')
      .select('*, lw_buyers:lw_buyers!inner(id, pipeline_stage)')
      .eq('is_active', true)
      .not('client_user_id', 'is', null);

    // Filter to only pages linked to subscribers (pipeline_stage = 'warm')
    // We match via email between lw_landing_pages and lw_buyers
    const { data: subscriberBuyers } = await supabaseAdmin
      .from('lw_buyers')
      .select('email')
      .eq('pipeline_stage', 'warm')
      .not('email', 'is', null);

    const subscriberEmails = new Set(
      (subscriberBuyers || []).map(b => b.email?.toLowerCase()).filter(Boolean)
    );

    // Get raw pages and filter to subscriber-linked ones
    const { data: allPages } = await supabaseAdmin
      .from('lw_landing_pages')
      .select('*')
      .eq('is_active', true)
      .not('client_user_id', 'is', null);

    const subscriberPages = (allPages || []).filter(p =>
      p.email && subscriberEmails.has(p.email.toLowerCase())
    );

    if (!subscriberPages || subscriberPages.length === 0) {
      return new Response(JSON.stringify({ message: 'No subscribed buyer pages to process' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: Array<{ page_id: string; slug: string; leads_added: number; email_sent: boolean }> = [];

    for (const page of subscriberPages) {
      // Check if this user is on a free trial (pending subscription = not yet paid)
      const { data: subRecord } = await supabaseAdmin
        .from('guru_subscriptions')
        .select('status')
        .eq('email', page.email)
        .in('status', ['pending', 'active', 'subscribed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const isTrial = !subRecord || subRecord.status === 'pending';
      const effectiveCap = isTrial ? TRIAL_CAP : WEEKLY_CAP;

      // Check weekly cap
      const { data: capRow } = await supabaseAdmin
        .from('lw_client_lead_caps')
        .select('*')
        .eq('landing_page_id', page.id)
        .eq('week_start', weekStart)
        .maybeSingle();

      const currentCount = capRow?.leads_delivered || 0;
      const remaining = Math.max(0, effectiveCap - currentCount);

      if (remaining === 0) {
        results.push({ page_id: page.id, slug: page.slug, leads_added: 0, email_sent: false });
        continue;
      }

      // Fetch distressed leads from REAPI
      let newLeads: Array<{
        full_name: string;
        phone: string;
        property_address: string;
        status: string;
        meta: Record<string, unknown>;
      }> = [];

      if (REAPI_KEY) {
        try {
          // Search for distressed properties in common areas
          const searchParams = new URLSearchParams({
            property_type: 'LAND',
            is_distressed: 'true',
            limit: String(Math.min(remaining, 50)),
          });

          const reApiRes = await fetch(
            `https://api.realestateapi.com/v2/PropertySearch?${searchParams}`,
            {
              headers: {
                'x-api-key': REAPI_KEY,
                'Content-Type': 'application/json',
              },
            }
          );

          if (reApiRes.ok) {
            const reData = await reApiRes.json();
            const properties = reData?.data || reData?.properties || [];

            newLeads = properties.slice(0, remaining).map((prop: Record<string, unknown>) => ({
              full_name: String(prop.owner_name || prop.ownerName || 'Property Owner'),
              phone: String(prop.phone || prop.ownerPhone || ''),
              property_address: String(prop.address || prop.propertyAddress || 'Unknown'),
              status: 'new',
              meta: {
                source: 'reapi_weekly_match',
                assessed_value: prop.assessedValue || prop.assessed_value,
                acreage: prop.lotAcreage || prop.acreage,
                distress_flags: {
                  tax_delinquent: prop.isTaxDelinquent || false,
                  pre_foreclosure: prop.isPreForeclosure || false,
                  vacant: prop.isVacant || false,
                },
              },
            }));
          }
        } catch (err) {
          console.error('REAPI fetch error:', err);
        }
      }

      // If no REAPI leads, pull from existing sellers table
      if (newLeads.length === 0) {
        const { data: sellers } = await supabaseAdmin
          .from('lw_sellers')
          .select('owner_name, owner_phone, address_full, meta, opportunity_score')
          .order('opportunity_score', { ascending: false })
          .limit(remaining);

        newLeads = (sellers || []).map(s => ({
          full_name: s.owner_name || 'Property Owner',
          phone: s.owner_phone || '',
          property_address: s.address_full || 'Unknown',
          status: 'new',
          meta: { source: 'seller_db_match', opportunity_score: s.opportunity_score },
        }));
      }

      // Insert leads
      if (newLeads.length > 0) {
        const insertRows = newLeads.map(l => ({
          landing_page_id: page.id,
          full_name: l.full_name,
          phone: l.phone,
          property_address: l.property_address,
          status: 'new',
          meta: l.meta,
        }));

        await supabaseAdmin.from('lw_landing_leads').insert(insertRows);

        // Update cap tracker
        if (capRow) {
          await supabaseAdmin
            .from('lw_client_lead_caps')
            .update({ leads_delivered: currentCount + newLeads.length })
            .eq('id', capRow.id);
        } else {
          await supabaseAdmin.from('lw_client_lead_caps').insert({
            landing_page_id: page.id,
            week_start: weekStart,
            leads_delivered: newLeads.length,
          });
        }
      }

      // Send email digest via Gmail API
      let emailSent = false;
      if (page.email && newLeads.length > 0) {
        try {
          const leadList = newLeads
            .map((l, i) => `${i + 1}. ${l.full_name} — ${l.property_address}${l.phone ? ` (${l.phone})` : ''}`)
            .join('\n');

          const capLabel = isTrial ? `Trial cap: ${currentCount + newLeads.length}/${TRIAL_CAP}` : `Weekly cap: ${currentCount + newLeads.length}/${WEEKLY_CAP}`;
          const emailBody = [
            `Hi ${page.client_name},`,
            '',
            `Your ${isTrial ? 'trial' : 'weekly'} lead report is ready! Here are ${newLeads.length} new distressed property leads matched for you:`,
            '',
            leadList,
            '',
            `Log in to your dashboard to view full details, AI call notes, and manage your pipeline:`,
            `https://socooked.lovable.app/client-dashboard`,
            '',
            `${capLabel} leads delivered.`,
            ...(isTrial ? ['', '⚡ Complete your payment to unlock up to 50 leads/week and full automation!'] : []),
            '',
            'Best,',
            'Warren Guru AI System',
          ].join('\n');

          // Call internal Gmail API edge function
          const gmailRes = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-api`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
              },
              body: JSON.stringify({
                action: 'send',
                to: page.email,
                subject: `📊 Weekly Lead Report — ${newLeads.length} New Matches (Week of ${weekStart})`,
                body: emailBody,
              }),
            }
          );
          emailSent = gmailRes.ok;
        } catch (err) {
          console.error('Gmail send error:', err);
        }
      }

      results.push({
        page_id: page.id,
        slug: page.slug,
        leads_added: newLeads.length,
        email_sent: emailSent,
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Weekly matcher error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
