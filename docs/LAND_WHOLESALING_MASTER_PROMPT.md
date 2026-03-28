# MASTER BUILD PROMPT — Land Wholesaling Deal Engine

> **Version:** 1.0.0
> **Data Core:** RealEstateAPI (REAPI)
> **Backend:** Supabase (Lovable Cloud)
> **Philosophy:** Buyer-first demand matching. Not a CRM — a deal machine.

---

## ROLE

You are building a **demand-driven land wholesaling engine** inside an existing Supabase-powered CRM. The system identifies cash buyers FIRST, then sources matching seller leads using RealEstateAPI as the primary property data layer. Every output must answer one question: **"Who should I call today and why?"**

---

## PHASE 1 — DATABASE SCHEMA

Create these tables via Supabase migrations. All tables get `updated_at` triggers and open RLS (internal tool, not public-facing).

### `lw_buyers` — Cash Buyer Registry

```sql
CREATE TABLE public.lw_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  phone text,
  entity_name text,              -- LLC / trust name if corporate
  source text NOT NULL DEFAULT 'manual',  -- 'reapi_investor','county_records','facebook','skip_trace','manual'
  target_counties text[] NOT NULL DEFAULT '{}',
  target_states text[] NOT NULL DEFAULT '{}',
  target_zoning text[] DEFAULT '{}',       -- 'residential','agricultural','commercial','vacant_land'
  acreage_min numeric DEFAULT 0,
  acreage_max numeric,
  budget_min numeric DEFAULT 0,
  budget_max numeric,
  activity_score integer NOT NULL DEFAULT 0,  -- 0-100, recalculated
  last_purchase_date date,
  purchase_count integer DEFAULT 0,
  tags text[] DEFAULT '{}',
  notes text,
  status text NOT NULL DEFAULT 'active',  -- 'active','inactive','vetted','blacklisted'
  reapi_owner_id text,                     -- cross-ref to REAPI owner data
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lw_buyers_phone_uniq ON public.lw_buyers(phone) WHERE phone IS NOT NULL;
```

### `lw_sellers` — Property / Seller Leads

```sql
CREATE TABLE public.lw_sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_name text,
  owner_phone text,
  owner_email text,
  owner_mailing_address text,
  -- Property data (sourced from REAPI)
  reapi_property_id text,          -- REAPI internal ID
  apn text,                        -- Assessor Parcel Number
  fips text,                       -- County FIPS code
  address_full text,
  city text,
  state text,
  zip text,
  county text,
  acreage numeric,
  lot_sqft integer,
  zoning text,
  property_type text DEFAULT 'VAC',  -- SFR, VAC, MFR, COM, etc.
  -- Motivation signals (from REAPI filters)
  is_absentee_owner boolean DEFAULT false,
  is_out_of_state boolean DEFAULT false,
  is_tax_delinquent boolean DEFAULT false,
  tax_delinquent_year text,
  has_tax_lien boolean DEFAULT false,
  is_vacant boolean DEFAULT false,
  is_pre_foreclosure boolean DEFAULT false,
  is_corporate_owned boolean DEFAULT false,
  years_owned integer,
  -- Valuation
  assessed_value numeric,
  market_value numeric,            -- REAPI AVM or assessed
  asking_price numeric,            -- if from a listing source
  estimated_offer numeric,         -- our calculated offer
  -- Scoring
  motivation_score integer NOT NULL DEFAULT 0,  -- 0-100
  -- Pipeline
  source text NOT NULL DEFAULT 'reapi',  -- 'reapi','craigslist','fbmp','zillow','county','manual'
  status text NOT NULL DEFAULT 'new',    -- 'new','skip_traced','contacted','negotiating','under_contract','dead'
  skip_traced_at timestamptz,
  contacted_at timestamptz,
  tags text[] DEFAULT '{}',
  notes text,
  meta jsonb NOT NULL DEFAULT '{}',       -- raw REAPI response stash
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lw_sellers_county_idx ON public.lw_sellers(county, state);
CREATE INDEX lw_sellers_motivation_idx ON public.lw_sellers(motivation_score DESC);
CREATE UNIQUE INDEX lw_sellers_apn_fips_uniq ON public.lw_sellers(apn, fips) WHERE apn IS NOT NULL AND fips IS NOT NULL;
```

### `lw_deals` — Matched Opportunities

```sql
CREATE TABLE public.lw_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid REFERENCES public.lw_sellers(id) ON DELETE CASCADE NOT NULL,
  buyer_id uuid REFERENCES public.lw_buyers(id) ON DELETE SET NULL,
  title text NOT NULL,
  match_score integer NOT NULL DEFAULT 0,   -- 0-100 composite
  -- Financials
  seller_ask numeric,
  our_offer numeric,
  buyer_price numeric,
  spread numeric GENERATED ALWAYS AS (COALESCE(buyer_price, 0) - COALESCE(our_offer, 0)) STORED,
  -- Pipeline
  stage text NOT NULL DEFAULT 'matched',  -- 'matched','contacted_seller','offer_sent','under_contract','assigned','closed','dead'
  priority text NOT NULL DEFAULT 'medium',
  assigned_to uuid,
  notes text,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### `lw_demand_signals` — Buyer Demand Heatmap

```sql
CREATE TABLE public.lw_demand_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  county text NOT NULL,
  state text NOT NULL,
  buyer_count integer NOT NULL DEFAULT 0,
  avg_budget numeric,
  avg_acreage_min numeric,
  avg_acreage_max numeric,
  zoning_demand jsonb DEFAULT '{}',  -- {"vacant_land": 5, "residential": 2}
  demand_rank integer,               -- 1 = hottest county
  last_refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(county, state)
);
```

### `lw_call_queue` — Daily Actionable Output

```sql
CREATE TABLE public.lw_call_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_date date NOT NULL DEFAULT CURRENT_DATE,
  seller_id uuid REFERENCES public.lw_sellers(id) ON DELETE CASCADE NOT NULL,
  deal_id uuid REFERENCES public.lw_deals(id) ON DELETE SET NULL,
  call_priority integer NOT NULL DEFAULT 99,   -- 1 = call first
  reason text NOT NULL,                         -- "Tax delinquent + 3 active buyers in county"
  owner_name text,
  owner_phone text,
  property_address text,
  motivation_score integer,
  match_score integer,
  status text NOT NULL DEFAULT 'pending',  -- 'pending','called','callback','converted','skipped'
  outcome text,
  called_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lw_call_queue_date_idx ON public.lw_call_queue(queue_date, call_priority);
```

### `lw_ingestion_runs` — Budget Tracking

```sql
CREATE TABLE public.lw_ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL,          -- 'reapi_property_search','reapi_skip_trace','reapi_avm','scrape_craigslist','scrape_fbmp'
  source text NOT NULL DEFAULT 'reapi',
  records_fetched integer DEFAULT 0,
  records_new integer DEFAULT 0,
  credits_used numeric DEFAULT 0,  -- track API cost per run
  params jsonb DEFAULT '{}',       -- search params used
  status text NOT NULL DEFAULT 'completed',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

## PHASE 2 — REALESTATEAPI INTEGRATION

### Secret Required

```
REAPI_API_KEY — RealEstateAPI x-api-key header value
```

### Base URL

```
https://api.realestateapi.com/v2
```

### Core Endpoints to Integrate

| Endpoint | Path | Use Case |
|----------|------|----------|
| **Property Search** | `POST /v2/PropertySearch` | Find seller leads by county with motivation filters |
| **Property Detail** | `POST /v2/PropertyDetail` | Enrich a specific property |
| **Skip Trace** | `POST /v2/SkipTrace` | Get owner phone/email for high-motivation leads |
| **Bulk Skip Trace** | `POST /v2/BulkSkipTrace` | Batch skip trace (webhook callback) |
| **AVM / Valuation** | `POST /v2/AVM` | Get market value for spread calculation |
| **Involuntary Liens** | `POST /v2/Reports/PropertyLiens` | Check for tax liens, judgments |
| **Comps** | `POST /v2/Comps` | Validate pricing with comparable sales |

### Edge Function: `land-reapi-search`

**Purpose:** Search REAPI for seller leads in high-demand counties.

```typescript
// Pseudocode flow
1. Query lw_demand_signals ORDER BY demand_rank ASC LIMIT 5 (top 5 demand counties)
2. For each county:
   POST /v2/PropertySearch with body:
   {
     "county": "Harris",
     "state": "TX",
     "property_type": ["VAC"],       // or configurable
     "absentee_owner": true,
     "tax_delinquent_year": "2023",  // or recent years
     "vacant": true,
     "size": 50,                     // records per page, control cost
     "resultIndex": 0
   }
3. For each result, calculate motivation_score:
   +30 if is_tax_delinquent
   +20 if is_absentee_owner
   +15 if is_out_of_state
   +10 if is_vacant
   +10 if years_owned > 10
   +10 if is_pre_foreclosure
   +5  if has_tax_lien
4. UPSERT into lw_sellers (deduplicate on apn+fips)
5. Log to lw_ingestion_runs (records_fetched, credits_used)
```

### Edge Function: `land-reapi-skip-trace`

**Purpose:** Skip trace only high-motivation sellers (score >= 60) who haven't been traced yet.

```typescript
1. SELECT from lw_sellers WHERE motivation_score >= 60 AND skip_traced_at IS NULL LIMIT 25
2. For each:
   POST /v2/SkipTrace { "address": {...}, "name": owner_name }
3. Update lw_sellers with phone, email, mailing address
4. Set skip_traced_at = now(), status = 'skip_traced'
5. Log credits to lw_ingestion_runs
```

### Edge Function: `land-reapi-valuation`

**Purpose:** Get AVM for deals under negotiation to calculate spread.

```typescript
1. SELECT from lw_deals WHERE stage IN ('contacted_seller','offer_sent') AND seller.market_value IS NULL
2. POST /v2/AVM for each property
3. Update lw_sellers.market_value
4. Recalculate lw_deals.our_offer (e.g., 60-70% of market_value)
```

---

## PHASE 3 — BUYER SOURCING

### Method A: REAPI Investor Buyer Detection

```typescript
// Use PropertySearch with investor_buyer filter
POST /v2/PropertySearch {
  "county": "Harris",
  "state": "TX",
  "investor_buyer": true,
  "cash_buyer": true,
  "last_sale_date_min": "2024-01-01",  // recent purchases = active buyers
  "size": 50
}
// Extract owner info → UPSERT into lw_buyers
// Set source = 'reapi_investor'
```

### Method B: County Records Import (Manual CSV)

Upload CSV of recent cash land transactions → parse → insert into `lw_buyers`.

### Method C: Facebook / Marketplace Scrape (Apify)

Use existing `APIFY_TOKEN` to scrape Facebook groups for "looking to buy land in [county]" posts. Extract name + location → insert into `lw_buyers` with source = 'facebook'.

---

## PHASE 4 — MATCHING ENGINE

### Edge Function: `land-match-engine`

**Core Logic — Buyer-first matching:**

```typescript
1. For each active buyer in lw_buyers:
   a. Query lw_sellers WHERE:
      - county = ANY(buyer.target_counties) OR state = ANY(buyer.target_states)
      - acreage BETWEEN buyer.acreage_min AND buyer.acreage_max
      - status IN ('new', 'skip_traced')
      - motivation_score >= 40
   b. For each matching seller, compute match_score:
      motivation_weight = seller.motivation_score * 0.40
      buyer_activity    = buyer.activity_score * 0.30
      spread_score      = CASE
                            WHEN spread > 10000 THEN 30
                            WHEN spread > 5000  THEN 20
                            WHEN spread > 2000  THEN 10
                            ELSE 5
                          END * 0.30
      match_score = motivation_weight + buyer_activity + spread_score
   c. UPSERT into lw_deals (deduplicate on seller_id + buyer_id)

2. Refresh lw_demand_signals:
   - GROUP BY county, state from lw_buyers WHERE status = 'active'
   - COUNT buyers, AVG budget, rank by count DESC
```

### Edge Function: `land-build-call-queue`

**Runs daily — generates the call list:**

```typescript
1. DELETE FROM lw_call_queue WHERE queue_date = CURRENT_DATE
2. SELECT sellers with deals, ordered by match_score DESC
3. Filter: must have phone (skip_traced), not contacted in last 7 days
4. INSERT top 25 into lw_call_queue with:
   - call_priority = ROW_NUMBER
   - reason = human-readable ("Tax delinquent 2yr, absentee, 3 buyers want Harris County land")
   - owner_name, phone, address from seller
5. Optional: trigger telegram-notify with daily summary
```

---

## PHASE 5 — AUTOMATION SCHEDULE

| Cron | Edge Function | Frequency | Est. Cost/Run |
|------|--------------|-----------|---------------|
| `0 6 * * *` | `land-reapi-search` | Daily 6AM | ~$5-15 (250 records) |
| `0 7 * * *` | `land-reapi-skip-trace` | Daily 7AM | ~$3-8 (25 traces) |
| `0 8 * * *` | `land-match-engine` | Daily 8AM | $0 (DB only) |
| `0 8 30 * *` | `land-build-call-queue` | Daily 8:30AM | $0 (DB only) |
| `0 9 * * 1` | `land-reapi-valuation` | Weekly Mon | ~$2-5 |
| `0 6 * * 1` | Buyer sourcing (REAPI investor) | Weekly Mon | ~$5-10 |

**Monthly estimate: $200-$500** within budget range.

---

## PHASE 6 — BUDGET GUARDIAN

```typescript
// In every REAPI edge function, BEFORE calling the API:
const { data: runs } = await supabase
  .from('lw_ingestion_runs')
  .select('credits_used')
  .gte('created_at', startOfMonth())

const monthlySpend = runs.reduce((sum, r) => sum + r.credits_used, 0)
if (monthlySpend >= BUDGET_LIMIT) {
  // Skip API call, log warning, notify via telegram
  return { skipped: true, reason: 'Monthly budget reached' }
}
```

---

## PHASE 7 — DASHBOARD UI

### Page: `/land-deals`

**Three tabs:**

#### Tab 1: Daily Call List
- Table from `lw_call_queue WHERE queue_date = CURRENT_DATE`
- Columns: Priority, Owner Name, Phone (click-to-call), Address, Motivation Score, Match Score, Reason
- Actions: Mark Called, Add Notes, Mark Converted, Skip
- Badge showing "X calls remaining today"

#### Tab 2: Deal Pipeline
- Kanban or table view of `lw_deals`
- Stages: Matched → Contacted Seller → Offer Sent → Under Contract → Assigned → Closed
- Show spread on each card
- Filter by county, buyer, score

#### Tab 3: Demand Map
- Table of `lw_demand_signals` ranked by buyer demand
- Columns: County/State, Active Buyers, Avg Budget, Acreage Range, Seller Leads Found, Gap (buyers with no matching sellers)
- Highlight counties with high demand but low seller inventory = **scraping priority**

### Sidebar Stats
- Total Active Buyers
- Total Seller Leads
- Deals This Month
- Monthly API Spend (from `lw_ingestion_runs`)
- Avg Match Score

---

## PHASE 8 — SUPPLEMENTAL SCRAPING (OPTIONAL)

Use existing Apify tokens for platforms REAPI doesn't cover:

| Source | Actor | Data Extracted |
|--------|-------|----------------|
| Craigslist | `APIFY_TOKEN_CRAIGSLIST` | Land-for-sale listings (asking price, acreage, location) |
| Facebook Marketplace | `APIFY_TOKEN` | Land listings + buyer-seeking posts |
| Zillow | Firecrawl (`FIRECRAWL_API_KEY`) | FSBO land listings |

Scraped leads → normalize → insert into `lw_sellers` with source = 'craigslist' / 'fbmp' / 'zillow'.

---

## CONSTRAINTS

1. **RealEstateAPI is the single source of truth** for property data, skip tracing, and valuations
2. **Never skip trace a seller with motivation_score < 40** — waste of credits
3. **Never add a seller to call queue without a phone number**
4. **Deduplicate on APN+FIPS** for REAPI data, **phone** for buyers
5. **All REAPI responses cached in `meta` jsonb** to avoid re-fetching
6. **Budget ceiling enforced per-function** before any API call
7. **Existing CRM tables (customers, deals, etc.) are untouched** — land wholesaling is a parallel module

---

## BUILD ORDER

1. **Migration:** Create all `lw_*` tables with indexes and RLS
2. **Secret:** Add `REAPI_API_KEY`
3. **Edge Function:** `land-reapi-search` (property search + motivation scoring)
4. **Edge Function:** `land-reapi-skip-trace` (conditional skip tracing)
5. **Edge Function:** `land-match-engine` (buyer↔seller matching + demand signals)
6. **Edge Function:** `land-build-call-queue` (daily call list generation)
7. **UI Page:** `/land-deals` with 3 tabs (Call List, Pipeline, Demand Map)
8. **Edge Function:** `land-reapi-valuation` (AVM for spread calc)
9. **Cron setup** for daily automation
10. **Budget Guardian** logic in all REAPI functions
11. **(Optional)** Apify scrapers for supplemental sources
