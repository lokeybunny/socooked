## AgentFlow → Apify Migration (Focused Swap)

The existing AgentFlow system is **90% built and working**: the database schema (`af_listings`, `af_agents`, `af_agent_contacts`, `af_agent_listings`, `af_scrape_jobs`, `target_locations`), the cron orchestrator, phone validation (Twilio Lookup), CSV generation, and the dashboard at `/agentflow` are all in place. The ONLY broken piece is the scraping layer, which depends on ZenRows credits that are exhausted.

This plan replaces ZenRows with Apify — nothing else gets rewritten.

---

### What changes

**1. `agentflow-scrape-zillow` — full rewrite**
- Calls Apify actor `maxcopell/zillow-scraper` via `POST /v2/acts/{actor_id}/run-sync-get-dataset-items` (waits for completion, returns items inline — perfect for an edge function)
- Input: `{ searchUrls: ["https://www.zillow.com/<location>/homes/"], extractionMethod: "MAP_MARKERS" }` (cheapest path; ~$0.001/listing)
- For each item, extract: `zpid`, address parts, `price`, `detailUrl`, `brokerName`, `attributionInfo.agentName`, `attributionInfo.agentLicenseNumber`, `attributionInfo.agentZuid`, `attributionInfo.agentProfileUrl`
- Upsert listings + agents (using existing `normalized_key` dedupe)
- Apify token rotation: try `APIFY_TOKEN`, then `APIFY_TOKEN_CRAIGSLIST`, then `APIFY_TOKEN_COMMUNITY` (matches existing rotation memory)

**2. `agentflow-enrich-phones` → renamed concept, same file**
- Calls Apify actor `maxcopell/zillow-detail-scraper` with up to 50 agent profile URLs at a time
- Extracts `phoneNumber`, `cellPhone`, `businessPhone` from the agent detail payload
- Inserts into `af_agent_contacts` with appropriate `source` (`apify_cell`, `apify_business`)
- Skips agents scraped within last 30 days

**3. Delete `agentflow-debug-fields`** (ZenRows-specific debug helper, no longer needed)

**4. `ApiManagement.tsx` — add Apify section**
- Connection status card (token presence check via existing `agentflow-api-status` helper, or new lightweight call)
- Two action buttons: "Trigger Listing Scrape" (calls `agentflow-scrape-zillow`) and "Run Profile Enrichment" (calls `agentflow-enrich-phones`)
- Live Apify usage stats from `af_scrape_jobs` (last run, items scraped today, total cost estimate)

---

### What stays unchanged

- Database schema (already matches spec)
- `agentflow-cron-tick` (already orchestrates correctly)
- `agentflow-validate-phones` (Twilio Lookup, already working)
- `agentflow-generate-csv` (CSV download, already working)
- `AgentFlow.tsx` dashboard (already shows all required cards/tables)
- pg_cron schedules (already running every 30/60/90 min + daily CSV)
- Auth, Storage, real-time subscriptions

---

### Apify cost math
- `maxcopell/zillow-scraper` (MAP_MARKERS mode): ~$0.001 per listing → 3,000 listings/day = **$3/day**
- `maxcopell/zillow-detail-scraper`: ~$0.005 per detail page → 1,500 enrichments/day = **$7.50/day**
- **Total: ~$10/day** for the daily 3k+ mobile target. Apify token already has credits.

---

### Files touched

```text
supabase/functions/agentflow-scrape-zillow/index.ts   (rewrite, ~180 lines)
supabase/functions/agentflow-enrich-phones/index.ts   (rewrite, ~150 lines)
supabase/functions/agentflow-debug-fields/           (delete)
src/pages/ApiManagement.tsx                          (add Apify card section)
```

No DB migration needed. No new secrets needed (`APIFY_TOKEN` already exists).

---

### Why I'm pushing back on "rebuild from scratch"

Re-creating the schema, dashboard, cron, CSV, and validation would:
1. Lose the 843 already-scraped agents and 2,215 listings in the DB
2. Take ~10x longer with no functional benefit
3. Risk breaking the working pieces (Twilio Lookup, pg_cron schedules)

The actual problem is one provider swap. This plan fixes that without disturbing what works.