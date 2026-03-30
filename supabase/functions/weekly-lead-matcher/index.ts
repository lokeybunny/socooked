import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Weekly Lead Matcher
 *
 * Two modes:
 *   A) Manual trigger: body contains { buyer_id, page_id } → match ONE buyer
 *   B) Cron / no body: process ALL warm (subscriber) buyers
 *
 * Uses the buyer's actual preferences (state, county, property type, budget,
 * motivation flags) when searching REAPI and when falling back to the sellers table.
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
    const TRIAL_CAP = 5;

    // Week start (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const weekStart = monday.toISOString().split('T')[0];

    // ---------- Parse request body ----------
    let manualBuyerId: string | null = null;
    let manualPageId: string | null = null;
    try {
      const body = await req.json();
      manualBuyerId = body?.buyer_id || null;
      manualPageId = body?.page_id || null;
    } catch { /* no body = cron mode */ }

    // ---------- Resolve buyer ↔ page pairs ----------
    interface BuyerPage {
      buyer: any;
      page: any;
    }
    const pairs: BuyerPage[] = [];

    if (manualBuyerId && manualPageId) {
      // Manual mode — single buyer + page
      const { data: buyer } = await supabaseAdmin
        .from('lw_buyers')
        .select('*')
        .eq('id', manualBuyerId)
        .single();

      const { data: page } = await supabaseAdmin
        .from('lw_landing_pages')
        .select('*')
        .eq('id', manualPageId)
        .single();

      if (buyer && page) {
        pairs.push({ buyer, page });
      }
    } else {
      // Cron mode — all warm buyers with linked landing pages
      const { data: warmBuyers } = await supabaseAdmin
        .from('lw_buyers')
        .select('*')
        .eq('pipeline_stage', 'warm')
        .not('email', 'is', null);

      const { data: allPages } = await supabaseAdmin
        .from('lw_landing_pages')
        .select('*')
        .eq('is_active', true)
        .not('client_user_id', 'is', null);

      for (const buyer of (warmBuyers || [])) {
        const page = (allPages || []).find(p =>
          p.email && buyer.email && p.email.toLowerCase() === buyer.email.toLowerCase()
        );
        if (page) pairs.push({ buyer, page });
      }
    }

    if (pairs.length === 0) {
      return new Response(JSON.stringify({ message: 'No buyer-page pairs to process' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---------- Process each pair ----------
    const results: Array<{ page_id: string; slug: string; leads_added: number; email_sent: boolean }> = [];

    for (const { buyer, page } of pairs) {
      // --- Trial check ---
      // Buyers in "warm" (Subscribed) pipeline always get full cap — they've been
      // manually promoted or auto-moved after Square payment.
      const isSubscribedPipeline = buyer.pipeline_stage === 'warm';
      let isTrial = false;

      if (!isSubscribedPipeline) {
        const { data: subRecord } = await supabaseAdmin
          .from('guru_subscriptions')
          .select('status')
          .eq('email', page.email)
          .in('status', ['pending', 'active', 'subscribed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        isTrial = !subRecord || subRecord.status === 'pending';
      }

      const effectiveCap = isTrial ? TRIAL_CAP : WEEKLY_CAP;
      console.log(`[matcher] buyer=${buyer.full_name} pipeline=${buyer.pipeline_stage} isTrial=${isTrial} effectiveCap=${effectiveCap}`);

      // --- Cap check ---
      const { data: capRow } = await supabaseAdmin
        .from('lw_client_lead_caps')
        .select('*')
        .eq('landing_page_id', page.id)
        .eq('week_start', weekStart)
        .maybeSingle();

      const currentCount = capRow?.leads_delivered || 0;
      const remaining = Math.max(0, effectiveCap - currentCount);
      console.log(`[matcher] currentCount=${currentCount} remaining=${remaining} weekStart=${weekStart}`);
      if (remaining === 0) {
        console.log(`[matcher] CAP REACHED — skipping`);
        results.push({ page_id: page.id, slug: page.slug, leads_added: 0, email_sent: false });
        continue;
      }

      // --- Extract buyer preferences ---
      const interests = buyer.meta?.interests || {};
      const targetStates = buyer.target_states || [];
      const targetCounties = buyer.target_counties || [];
      const dealType = buyer.deal_type || 'land';
      const budgetMin = buyer.budget_min || 0;
      const budgetMax = buyer.budget_max || 999999999;
      const acreageMin = buyer.acreage_min || null;
      const acreageMax = buyer.acreage_max || null;
      const propertyTypes: string[] = interests.property_types || buyer.property_type_interest || [];
      const motivationFlags: string[] = interests.motivation_flags || [];
      const targetCity: string = interests.target_city || '';

      // Map buyer property types to REAPI property_type param
      const reApiPropertyType = propertyTypes.includes('sfr') || dealType === 'home'
        ? 'SFR'
        : propertyTypes.includes('multi_family') || propertyTypes.includes('mfr')
          ? 'MFR'
          : 'LAND';

      // --- Attempt REAPI search with buyer filters ---
      let newLeads: Array<{
        full_name: string;
        phone: string;
        property_address: string;
        status: string;
        meta: Record<string, unknown>;
      }> = [];

      if (REAPI_KEY && targetStates.length > 0) {
        try {
          const searchParams: Record<string, string> = {
            property_type: reApiPropertyType,
            limit: String(Math.min(remaining, 50)),
          };

          // Location filters
          if (targetStates.length === 1) searchParams.state = targetStates[0];
          if (targetCounties.length === 1) {
            searchParams.county = targetCounties[0].replace(/ County$/i, '');
          }
          if (targetCity) searchParams.city = targetCity;

          // Distress / motivation filters
          if (motivationFlags.includes('vacant')) searchParams.is_vacant = 'true';
          if (motivationFlags.includes('absentee_owner')) searchParams.is_absentee_owner = 'true';
          if (motivationFlags.includes('pre_foreclosure')) searchParams.is_pre_foreclosure = 'true';
          if (motivationFlags.includes('tax_delinquent')) searchParams.is_tax_delinquent = 'true';

          // Budget filters
          if (budgetMax < 999999999) searchParams.max_assessed_value = String(budgetMax);

          const qs = new URLSearchParams(searchParams);
          const reApiRes = await fetch(
            `https://api.realestateapi.com/v2/PropertySearch?${qs}`,
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
                buyer_id: buyer.id,
                assessed_value: prop.assessedValue || prop.assessed_value,
                acreage: prop.lotAcreage || prop.acreage,
                market_value: prop.marketValue || prop.market_value,
                property_type: reApiPropertyType,
                distress_flags: {
                  tax_delinquent: prop.isTaxDelinquent || false,
                  pre_foreclosure: prop.isPreForeclosure || false,
                  vacant: prop.isVacant || false,
                  absentee_owner: prop.isAbsenteeOwner || false,
                },
              },
            }));
          } else {
            console.error('REAPI error:', reApiRes.status, await reApiRes.text());
          }
        } catch (err) {
          console.error('REAPI fetch error:', err);
        }
      }

      // --- Fallback: pull from lw_sellers with buyer-preference filters ---
      if (newLeads.length === 0) {
        let query = supabaseAdmin
          .from('lw_sellers')
          .select('owner_name, owner_phone, address_full, meta, opportunity_score, state, county, deal_type, property_type, market_value, acreage')
          .order('opportunity_score', { ascending: false })
          .limit(remaining);

        // Filter by state
        if (targetStates.length > 0) {
          query = query.in('state', targetStates);
        }
        // Filter by county — match both "Clark" and "Clark County" formats
        if (targetCounties.length > 0) {
          // Try exact match first (DB stores "Clark County"), also try stripped version
          const withSuffix = targetCounties;
          const withoutSuffix = targetCounties.map(c => c.replace(/ County$/i, ''));
          const allVariants = [...new Set([...withSuffix, ...withoutSuffix])];
          query = query.in('county', allVariants);
        }
        // Filter by deal type
        if (dealType && dealType !== 'any') {
          query = query.eq('deal_type', dealType);
        }
        // Budget filter on market_value
        if (budgetMax < 999999999) {
          query = query.lte('market_value', budgetMax);
        }
        if (budgetMin > 0) {
          query = query.gte('market_value', budgetMin);
        }
        // Acreage filters
        if (acreageMin) {
          query = query.gte('acreage', acreageMin);
        }
        if (acreageMax) {
          query = query.lte('acreage', acreageMax);
        }

        const { data: sellers } = await query;

        newLeads = (sellers || []).map(s => ({
          full_name: s.owner_name || 'Property Owner',
          phone: s.owner_phone || '',
          property_address: s.address_full || 'Unknown',
          status: 'new',
          meta: {
            source: 'seller_db_match',
            buyer_id: buyer.id,
            opportunity_score: s.opportunity_score,
            property_type: s.property_type,
            market_value: s.market_value,
          },
        }));
      }

      // --- Insert leads ---
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

        // Update cap
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

      // --- Send email digest ---
      let emailSent = false;
      if (page.email && newLeads.length > 0) {
        try {
          const leadList = newLeads
            .map((l, i) => `${i + 1}. ${l.full_name} — ${l.property_address}${l.phone ? ` (${l.phone})` : ''}`)
            .join('\n');

          const capLabel = isTrial
            ? `Trial cap: ${currentCount + newLeads.length}/${TRIAL_CAP}`
            : `Weekly cap: ${currentCount + newLeads.length}/${WEEKLY_CAP}`;

          const locationLabel = targetCounties.length > 0
            ? targetCounties.join(', ') + ', ' + targetStates.join(', ')
            : targetStates.join(', ');

          const emailBody = [
            `Hi ${page.client_name},`,
            '',
            `Your ${isTrial ? 'trial' : 'weekly'} lead report is ready! Here are ${newLeads.length} new ${reApiPropertyType} property leads matched for you in ${locationLabel}:`,
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

          const gmailRes = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-api?action=send`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
              },
              body: JSON.stringify({
                to: page.email,
                subject: `📊 Weekly Lead Report — ${newLeads.length} New ${reApiPropertyType} Matches (Week of ${weekStart})`,
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
