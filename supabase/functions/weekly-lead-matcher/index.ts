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
    const dayOfWeek = now.getUTCDay();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((dayOfWeek + 6) % 7));
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
    interface BuyerPage { buyer: any; page: any; }
    const pairs: BuyerPage[] = [];

    if (manualBuyerId && manualPageId) {
      const { data: buyer } = await supabaseAdmin.from('lw_buyers').select('*').eq('id', manualBuyerId).single();
      const { data: page } = await supabaseAdmin.from('lw_landing_pages').select('*').eq('id', manualPageId).single();
      if (buyer && page) pairs.push({ buyer, page });
    } else {
      const { data: warmBuyers } = await supabaseAdmin.from('lw_buyers').select('*').eq('pipeline_stage', 'warm').not('email', 'is', null);
      const { data: allPages } = await supabaseAdmin.from('lw_landing_pages').select('*').eq('is_active', true).not('client_user_id', 'is', null);
      for (const buyer of (warmBuyers || [])) {
        const page = (allPages || []).find(p => p.email && buyer.email && p.email.toLowerCase() === buyer.email.toLowerCase());
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

      const reApiPropertyType = propertyTypes.includes('sfr') || dealType === 'home'
        ? 'SFR'
        : propertyTypes.includes('multi_family') || propertyTypes.includes('mfr')
          ? 'MFR'
          : 'LAND';

      // --- Attempt REAPI search ---
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
          if (targetStates.length === 1) searchParams.state = targetStates[0];
          if (targetCounties.length === 1) searchParams.county = targetCounties[0].replace(/ County$/i, '');
          if (targetCity) searchParams.city = targetCity;
          if (motivationFlags.includes('vacant')) searchParams.is_vacant = 'true';
          if (motivationFlags.includes('absentee_owner')) searchParams.is_absentee_owner = 'true';
          if (motivationFlags.includes('pre_foreclosure')) searchParams.is_pre_foreclosure = 'true';
          if (motivationFlags.includes('tax_delinquent')) searchParams.is_tax_delinquent = 'true';
          if (budgetMax < 999999999) searchParams.max_assessed_value = String(budgetMax);

          const qs = new URLSearchParams(searchParams);
          const reApiRes = await fetch(
            `https://api.realestateapi.com/v2/PropertySearch?${qs}`,
            { headers: { 'x-api-key': REAPI_KEY, 'Content-Type': 'application/json' } }
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
                market_value: prop.marketValue || prop.market_value,
                acreage: prop.lotAcreage || prop.acreage || prop.lot_acreage,
                lot_sqft: prop.lotSqft || prop.lot_sqft,
                living_sqft: prop.livingSqft || prop.living_sqft || prop.buildingSqft,
                bedrooms: prop.bedrooms || prop.beds,
                bathrooms: prop.bathrooms || prop.baths,
                year_built: prop.yearBuilt || prop.year_built,
                property_type: reApiPropertyType,
                zoning: prop.zoning,
                county: prop.county,
                state: prop.state,
                city: prop.city,
                zip: prop.zip || prop.zipCode,
                latitude: prop.latitude,
                longitude: prop.longitude,
                owner_name: prop.ownerName || prop.owner_name,
                owner_phone: prop.ownerPhone || prop.phone,
                owner_email: prop.ownerEmail || prop.email,
                owner_mailing_address: prop.ownerMailingAddress || prop.owner_mailing_address,
                equity_percent: prop.equityPercent || prop.equity_percent,
                years_owned: prop.yearsOwned || prop.years_owned,
                is_absentee_owner: prop.isAbsenteeOwner || prop.is_absentee_owner || false,
                is_out_of_state: prop.isOutOfState || prop.is_out_of_state || false,
                is_corporate_owned: prop.isCorporateOwned || prop.is_corporate_owned || false,
                is_owner_occupied: prop.isOwnerOccupied || prop.owner_occupied,
                tax_delinquent_year: prop.taxDelinquentYear || prop.tax_delinquent_year,
                free_and_clear: prop.freeAndClear || prop.free_and_clear || false,
                stories: prop.stories || prop.numberOfStories,
                pool: prop.pool || prop.hasPool || false,
                garage_sqft: prop.garageSqft || prop.garage_sqft,
                hoa: prop.hoa || prop.hoaFee,
                last_sale_date: prop.lastSaleDate || prop.last_sale_date,
                last_sale_price: prop.lastSalePrice || prop.last_sale_price,
                foreclosure_status: prop.foreclosureStatus || prop.foreclosure_status,
                auction_date: prop.auctionDate || prop.auction_date,
                tax_amount: prop.taxAmount || prop.tax_amount || prop.annualTax,
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

      // --- Fallback: pull from lw_sellers ---
      if (newLeads.length === 0) {
        let query = supabaseAdmin
          .from('lw_sellers')
          .select('*')
          .order('opportunity_score', { ascending: false })
          .limit(remaining);

        if (targetStates.length > 0) query = query.in('state', targetStates);
        if (targetCounties.length > 0) {
          const withSuffix = targetCounties;
          const withoutSuffix = targetCounties.map(c => c.replace(/ County$/i, ''));
          const allVariants = [...new Set([...withSuffix, ...withoutSuffix])];
          query = query.in('county', allVariants);
        }
        if (dealType && dealType !== 'any') query = query.eq('deal_type', dealType);
        if (budgetMax < 999999999) query = query.lte('market_value', budgetMax);
        if (budgetMin > 0) query = query.gte('market_value', budgetMin);
        if (acreageMin) query = query.gte('acreage', acreageMin);
        if (acreageMax) query = query.lte('acreage', acreageMax);

        const { data: sellers, error: sellerErr } = await query;
        console.log(`[matcher] seller fallback: found=${sellers?.length || 0} error=${sellerErr?.message || 'none'}`);

        newLeads = (sellers || []).map(s => ({
          full_name: s.owner_name || 'Property Owner',
          phone: s.owner_phone || '',
          property_address: s.address_full || 'Unknown',
          status: 'new',
          meta: {
            source: 'seller_db_match',
            buyer_id: buyer.id,
            assessed_value: s.assessed_value,
            market_value: s.market_value,
            acreage: s.acreage,
            lot_sqft: s.lot_sqft,
            living_sqft: s.living_sqft,
            bedrooms: s.bedrooms,
            bathrooms: s.bathrooms,
            property_type: s.property_type,
            zoning: s.zoning,
            county: s.county,
            state: s.state,
            city: s.city,
            zip: s.zip,
            latitude: s.latitude,
            longitude: s.longitude,
            owner_mailing_address: s.owner_mailing_address,
            owner_email: s.owner_email,
            equity_percent: s.equity_percent,
            years_owned: s.years_owned,
            is_absentee_owner: s.is_absentee_owner,
            is_out_of_state: s.is_out_of_state,
            is_corporate_owned: s.is_corporate_owned,
            is_owner_occupied: s.owner_occupied,
            tax_delinquent_year: s.tax_delinquent_year,
            free_and_clear: s.free_and_clear,
            opportunity_score: s.opportunity_score,
            motivation_score: s.motivation_score,
            distress_grade: s.distress_grade,
            distress_flags: {
              tax_delinquent: s.is_tax_delinquent || false,
              pre_foreclosure: s.is_pre_foreclosure || false,
              vacant: s.is_vacant || false,
              absentee_owner: s.is_absentee_owner || false,
            },
          },
        }));
      }

      // --- Insert leads ---
      let leadsInserted = 0;
      if (newLeads.length > 0) {
        const insertRows = newLeads.map(l => ({
          landing_page_id: page.id,
          full_name: l.full_name,
          phone: l.phone,
          property_address: l.property_address,
          status: 'new',
          meta: l.meta,
        }));

        const { data: insertedData, error: insertErr } = await supabaseAdmin.from('lw_landing_leads').insert(insertRows).select('id');
        leadsInserted = insertErr ? 0 : (insertedData?.length || 0);
        console.log(`[matcher] inserted ${leadsInserted} leads (error: ${insertErr?.message || 'none'})`);

        // Update cap
        const newTotal = currentCount + leadsInserted;
        if (capRow) {
          await supabaseAdmin
            .from('lw_client_lead_caps')
            .update({ leads_delivered: newTotal })
            .eq('id', capRow.id);
        } else {
          await supabaseAdmin.from('lw_client_lead_caps').insert({
            landing_page_id: page.id,
            week_start: weekStart,
            leads_delivered: leadsInserted,
            cap: effectiveCap,
          });
        }
        console.log(`[matcher] cap updated: ${newTotal}/${effectiveCap}`);
      }

      // --- Send styled HTML email digest ---
      let emailSent = false;
      if (page.email && leadsInserted > 0) {
        try {
          const capLabel = isTrial
            ? `${currentCount + leadsInserted}/${TRIAL_CAP} trial leads`
            : `${currentCount + leadsInserted}/${WEEKLY_CAP} weekly leads`;

          const locationLabel = targetCounties.length > 0
            ? targetCounties.join(', ') + ', ' + targetStates.join(', ')
            : targetStates.join(', ');

          const emailHtml = buildEmailHtml({
            clientName: page.client_name,
            isTrial,
            leadsCount: leadsInserted,
            propertyType: reApiPropertyType,
            location: locationLabel,
            capLabel,
            weekStart,
            leads: newLeads.slice(0, leadsInserted),
          });

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
                subject: `📊 ${leadsInserted} New ${reApiPropertyType} Leads in ${locationLabel} — Week of ${weekStart}`,
                body: emailHtml,
                html: true,
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
        leads_added: leadsInserted,
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

/** Build a polished HTML email for the weekly lead report */
function buildEmailHtml(opts: {
  clientName: string;
  isTrial: boolean;
  leadsCount: number;
  propertyType: string;
  location: string;
  capLabel: string;
  weekStart: string;
  leads: Array<{ full_name: string; phone: string; property_address: string; meta: Record<string, unknown> }>;
}): string {
  const { clientName, isTrial, leadsCount, propertyType, location, capLabel, weekStart, leads } = opts;

  const leadRows = leads.map((l, i) => {
    const m = l.meta || {};
    const assessed = m.assessed_value || m.market_value;
    const acreage = m.acreage;
    const distress = m.distress_flags as any || {};
    const flags: string[] = [];
    if (distress.tax_delinquent) flags.push('Tax Delinquent');
    if (distress.pre_foreclosure) flags.push('Pre-Foreclosure');
    if (distress.vacant) flags.push('Vacant');
    if (distress.absentee_owner) flags.push('Absentee');

    return `
      <tr style="border-bottom:1px solid #2a2a2e;">
        <td style="padding:12px 16px;color:#e0e0e0;font-size:13px;vertical-align:top;">
          <strong style="color:#fff;">${i + 1}. ${l.full_name}</strong><br/>
          <span style="color:#888;font-size:12px;">📍 ${l.property_address}</span>
          ${l.phone ? `<br/><span style="color:#888;font-size:12px;">📱 ${l.phone}</span>` : ''}
        </td>
        <td style="padding:12px 16px;vertical-align:top;text-align:right;">
          ${assessed ? `<span style="color:#4ade80;font-size:13px;font-weight:600;">$${Number(assessed).toLocaleString()}</span><br/>` : ''}
          ${acreage ? `<span style="color:#888;font-size:12px;">${acreage} acres</span><br/>` : ''}
          ${flags.length > 0 ? flags.map(f => `<span style="display:inline-block;background:#ef4444;color:#fff;padding:2px 6px;border-radius:10px;font-size:10px;margin:2px 0;">${f}</span>`).join(' ') : ''}
        </td>
      </tr>`;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background-color:#111113;border-radius:12px;overflow:hidden;border:1px solid #222;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:32px 24px;text-align:center;">
      <h1 style="margin:0;font-size:22px;color:#fff;letter-spacing:-0.3px;">📊 Weekly Lead Report</h1>
      <p style="margin:8px 0 0;color:#64748b;font-size:14px;">Week of ${weekStart}</p>
    </div>

    <!-- Summary Card -->
    <div style="padding:24px;">
      <p style="color:#a0a0a0;font-size:14px;margin:0 0 16px;">Hi ${clientName},</p>
      <p style="color:#d0d0d0;font-size:14px;line-height:1.6;margin:0 0 20px;">
        Your ${isTrial ? 'trial' : 'weekly'} lead report is ready! We found <strong style="color:#4ade80;font-size:16px;">${leadsCount}</strong> new
        <strong style="color:#fff;">${propertyType}</strong> property leads in <strong style="color:#fff;">${location}</strong>.
      </p>

      <!-- Stats Bar -->
      <div style="display:flex;gap:12px;margin-bottom:24px;">
        <div style="flex:1;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:8px;padding:12px 16px;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#4ade80;">${leadsCount}</div>
          <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">New Leads</div>
        </div>
        <div style="flex:1;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:8px;padding:12px 16px;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#f59e0b;">${capLabel.split('/')[0]}</div>
          <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">${capLabel}</div>
        </div>
      </div>

      <!-- Lead Table -->
      <div style="border:1px solid #2a2a2e;border-radius:8px;overflow:hidden;">
        <div style="background:#1a1a2e;padding:10px 16px;">
          <span style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Matched Properties</span>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          ${leadRows}
        </table>
      </div>

      <!-- CTA Button -->
      <div style="text-align:center;padding:28px 0 12px;">
        <a href="https://socooked.lovable.app/client-dashboard"
           style="display:inline-block;background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px;">
          View Full Details in Dashboard →
        </a>
      </div>

      ${isTrial ? `
      <div style="background:#f59e0b10;border:1px solid #f59e0b30;border-radius:8px;padding:16px;margin-top:16px;">
        <p style="margin:0;color:#f59e0b;font-size:13px;font-weight:600;">⚡ Unlock Full Access</p>
        <p style="margin:6px 0 0;color:#888;font-size:12px;line-height:1.5;">
          You're on a trial plan (${capLabel}). Subscribe to unlock 50 leads/week plus full automation and AI call features.
        </p>
      </div>` : ''}
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #222;padding:20px 24px;text-align:center;">
      <p style="margin:0;color:#555;font-size:11px;">Warren Guru Wholesale CRM — Automated Lead Intelligence</p>
      <p style="margin:4px 0 0;color:#444;font-size:10px;">You're receiving this because you're subscribed to weekly lead reports.</p>
    </div>
  </div>
</body>
</html>`;
}
