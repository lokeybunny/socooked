import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Enrich a hot lead's meta with full property details from REAPI.
 * Body: { lead_id } or { backfill: true, landing_page_id } for batch mode.
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
    if (!REAPI_KEY) {
      return new Response(JSON.stringify({ error: 'REAPI_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { lead_id, backfill, landing_page_id } = body;

    // Gather leads to enrich
    let leadsToEnrich: any[] = [];

    if (lead_id) {
      const { data } = await supabaseAdmin.from('lw_landing_leads').select('*').eq('id', lead_id).single();
      if (data) leadsToEnrich = [data];
    } else if (backfill && landing_page_id) {
      const { data } = await supabaseAdmin
        .from('lw_landing_leads')
        .select('*')
        .eq('landing_page_id', landing_page_id)
        .in('status', ['new', 'contacted', 'qualified'])
        .order('created_at', { ascending: false })
        .limit(100);
      // Filter to only those with sparse meta (no bedrooms field as indicator)
      leadsToEnrich = (data || []).filter((l: any) => {
        const src = l.meta?.source;
        return (src === 'reapi_weekly_match' || src === 'seller_db_match') && !l.meta?.bedrooms && !l.meta?.enriched;
      });
    }

    if (leadsToEnrich.length === 0) {
      return new Response(JSON.stringify({ message: 'No leads to enrich', enriched: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let enrichedCount = 0;

    for (const lead of leadsToEnrich) {
      try {
        // Parse address into components for REAPI
        const addr = lead.property_address || '';
        const existingMeta = lead.meta || {};
        
        // Try PropertyDetail by address
        const res = await fetch(
          'https://api.realestateapi.com/v2/PropertyDetail',
          {
            method: 'POST',
            headers: { 'x-api-key': REAPI_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address: addr,
            }),
          },
        );

        if (!res.ok) {
          console.error(`REAPI error for ${addr}: ${res.status} ${await res.text()}`);
          continue;
        }

        const reData = await res.json();
        const prop = reData?.data || reData || {};

        if (!prop || Object.keys(prop).length < 3) {
          console.log(`No property data found for ${addr}`);
          continue;
        }

        const propertyInfo = prop.propertyInfo || {};
        const lotInfo = prop.lotInfo || {};
        const ownerInfo = prop.ownerInfo || {};
        const taxInfo = prop.taxInfo || {};
        const lastSale = prop.lastSale || {};
        const foreclosureInfo = Array.isArray(prop.foreclosureInfo) ? prop.foreclosureInfo : [];
        const activeForeclosure = foreclosureInfo.find((item: any) => item?.active) || foreclosureInfo[0] || null;
        const ownerMail = ownerInfo.mailAddress?.label || ownerInfo.mailAddress?.address || null;

        // Build enriched meta
        const enrichedMeta = {
          ...existingMeta,
          enriched: true,
          enriched_at: new Date().toISOString(),
          // Valuation
          assessed_value: taxInfo.assessedValue ?? prop.assessedValue ?? prop.assessed_value ?? existingMeta.assessed_value,
          market_value: taxInfo.marketValue ?? prop.estimatedValue ?? prop.marketValue ?? prop.market_value ?? existingMeta.market_value,
          // Property details
          bedrooms: propertyInfo.bedrooms ?? prop.bedrooms ?? prop.beds ?? existingMeta.bedrooms,
          bathrooms: propertyInfo.bathrooms ?? prop.bathrooms ?? prop.baths ?? existingMeta.bathrooms,
          living_sqft: propertyInfo.livingSquareFeet ?? propertyInfo.buildingSquareFeet ?? prop.livingSqft ?? prop.living_sqft ?? prop.buildingSqft ?? existingMeta.living_sqft,
          lot_sqft: lotInfo.lotSquareFeet ?? propertyInfo.lotSquareFeet ?? prop.lotSqft ?? prop.lot_sqft ?? existingMeta.lot_sqft,
          acreage: lotInfo.lotAcres ?? prop.lotAcreage ?? prop.acreage ?? prop.lot_acreage ?? existingMeta.acreage,
          year_built: propertyInfo.yearBuilt ?? prop.yearBuilt ?? prop.year_built ?? existingMeta.year_built,
          zoning: lotInfo.zoning ?? prop.zoning ?? existingMeta.zoning,
          stories: propertyInfo.stories ?? prop.stories ?? prop.numberOfStories ?? existingMeta.stories,
          pool: propertyInfo.pool ?? prop.pool ?? prop.hasPool ?? existingMeta.pool,
          garage_sqft: propertyInfo.garageSquareFeet ?? prop.garageSqft ?? prop.garage_sqft ?? existingMeta.garage_sqft,
          property_type: propertyInfo.propertyUse ?? prop.propertyType ?? prop.property_type ?? existingMeta.property_type,
          // Location
          city: propertyInfo.address?.city ?? prop.city ?? existingMeta.city,
          state: propertyInfo.address?.state ?? prop.state ?? existingMeta.state,
          county: propertyInfo.address?.county ?? prop.county ?? existingMeta.county,
          zip: propertyInfo.address?.zip ?? prop.zip ?? prop.zipCode ?? existingMeta.zip,
          latitude: propertyInfo.latitude ?? prop.latitude ?? existingMeta.latitude,
          longitude: propertyInfo.longitude ?? prop.longitude ?? existingMeta.longitude,
          // Owner
          owner_name: ownerInfo.owner1FullName ?? prop.ownerName ?? prop.owner_name ?? existingMeta.owner_name,
          owner_phone: prop.ownerPhone ?? prop.phone ?? existingMeta.owner_phone,
          owner_email: prop.ownerEmail ?? prop.email ?? existingMeta.owner_email,
          owner_mailing_address: ownerMail ?? prop.ownerMailingAddress ?? prop.owner_mailing_address ?? existingMeta.owner_mailing_address,
          equity_percent: prop.equityPercent ?? prop.equity_percent ?? existingMeta.equity_percent,
          years_owned: ownerInfo.ownershipLength ?? prop.yearsOwned ?? prop.years_owned ?? existingMeta.years_owned,
          is_absentee_owner: ownerInfo.absenteeOwner ?? prop.absenteeOwner ?? prop.isAbsenteeOwner ?? prop.is_absentee_owner ?? existingMeta.is_absentee_owner,
          is_out_of_state: ownerInfo.outOfStateAbsenteeOwner ?? prop.outOfStateAbsenteeOwner ?? prop.isOutOfState ?? prop.is_out_of_state ?? existingMeta.is_out_of_state,
          is_corporate_owned: ownerInfo.corporateOwned ?? prop.corporateOwned ?? prop.isCorporateOwned ?? prop.is_corporate_owned ?? existingMeta.is_corporate_owned,
          is_owner_occupied: ownerInfo.ownerOccupied ?? prop.ownerOccupied ?? prop.isOwnerOccupied ?? prop.owner_occupied ?? existingMeta.is_owner_occupied,
          free_and_clear: prop.freeClear ?? prop.freeAndClear ?? prop.free_and_clear ?? existingMeta.free_and_clear,
          tax_delinquent_year: taxInfo.taxDelinquentYear ?? prop.taxDelinquentYear ?? prop.tax_delinquent_year ?? existingMeta.tax_delinquent_year,
          // Financial
          last_sale_price: lastSale.saleAmount ?? prop.lastSalePrice ?? prop.last_sale_price ?? existingMeta.last_sale_price,
          last_sale_date: lastSale.saleDate ?? prop.lastSaleDate ?? prop.last_sale_date ?? existingMeta.last_sale_date,
          tax_amount: taxInfo.taxAmount ?? prop.taxAmount ?? prop.tax_amount ?? prop.annualTax ?? existingMeta.tax_amount,
          hoa: propertyInfo.hoa ?? prop.hoa ?? prop.hoaFee ?? existingMeta.hoa,
          foreclosure_status: activeForeclosure?.documentType ?? activeForeclosure?.noticeType ?? prop.foreclosureStatus ?? prop.foreclosure_status ?? existingMeta.foreclosure_status,
          auction_date: activeForeclosure?.auctionDate ?? prop.auctionDate ?? prop.auction_date ?? existingMeta.auction_date,
          // Distress flags
          distress_flags: {
            tax_delinquent: prop.taxLien ?? prop.isTaxDelinquent ?? existingMeta.distress_flags?.tax_delinquent ?? false,
            pre_foreclosure: prop.preForeclosure ?? prop.isPreForeclosure ?? existingMeta.distress_flags?.pre_foreclosure ?? false,
            vacant: prop.vacant ?? prop.isVacant ?? existingMeta.distress_flags?.vacant ?? false,
            absentee_owner: ownerInfo.absenteeOwner ?? prop.absenteeOwner ?? prop.isAbsenteeOwner ?? existingMeta.distress_flags?.absentee_owner ?? false,
          },
        };

        // Also update full_name if we got a real owner name
        const updates: Record<string, any> = { meta: enrichedMeta };
        const realOwnerName = prop.ownerName ?? prop.owner_name;
        if (realOwnerName && lead.full_name === 'Property Owner') {
          updates.full_name = realOwnerName;
        }

        await supabaseAdmin
          .from('lw_landing_leads')
          .update(updates)
          .eq('id', lead.id);

        enrichedCount++;
        console.log(`[enrich] ✓ ${addr} — enriched with ${Object.keys(prop).length} fields`);
      } catch (err) {
        console.error(`[enrich] Error enriching lead ${lead.id}:`, err);
      }
    }

    return new Response(JSON.stringify({ success: true, enriched: enrichedCount, total: leadsToEnrich.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Enrich error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
