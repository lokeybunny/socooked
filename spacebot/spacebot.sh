#!/usr/bin/env bash
###############################################################################
#  spacebot.sh — Autonomous Crypto Narrative Hunter for Pump.fun on Solana
#  Version: 2026.02 | Fully self-evolving via xAI Grok
#
#  USAGE:
#    export APIFY_TOKEN="apify_api_..."
#    export MORALIS_API_KEY="..."
#    export GROK_API_KEY="..."
#    export SUPABASE_URL="https://mziuxsfxevjnmdwnrqjs.supabase.co"
#    export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIs..."
#    chmod +x spacebot.sh && ./spacebot.sh
#
#  OPTIONAL X/TWITTER API CREDENTIALS (for future direct calls):
#    Consumer Key:        CDzb0iH4Y9GlpGLS9qMv29Rn2
#    Consumer Secret:     gTfYaRwcPDMipQRhR6AQLHltiHWm0CRfV7ZsGqntM9jBxO1rxs
#    OAuth2 Bearer Token: 1418904535523893255-VPAevjQ53Z8DZcEWvxK6J5cebkMihA
#    Access Token Secret: b5HDs5D2fHdzLi9c44Dbo3kJL9bFCdHtrh6bSDpqWKlEF
#
#  Dependencies: curl, jq, date, sleep (standard *nix)
###############################################################################

set -euo pipefail

# ─── Color codes ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log_info()    { echo -e "${GREEN}[✓]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[⚠]${NC} $*"; }
log_error()   { echo -e "${RED}[✗]${NC} $*"; }
log_section() { echo -e "\n${CYAN}${BOLD}═══ $* ═══${NC}"; }
log_sub()     { echo -e "  ${MAGENTA}→${NC} $*"; }

# ─── Timestamp helper ────────────────────────────────────────────────────────
ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# ─── File paths ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEARCH_TERMS_FILE="$SCRIPT_DIR/search_terms.json"
TWEETS_FILE="$SCRIPT_DIR/tweets.json"
NARRATIVES_LOG="$SCRIPT_DIR/narratives_log.json"
LOG_FILE="$SCRIPT_DIR/spacebot.log"
MORALIS_NEW="$SCRIPT_DIR/moralis_new.json"
MORALIS_BONDING="$SCRIPT_DIR/moralis_bonding.json"
MORALIS_GRADUATED="$SCRIPT_DIR/moralis_graduated.json"
ENRICHED_FILE="$SCRIPT_DIR/enriched_tokens.json"
GROK_RESPONSE="$SCRIPT_DIR/grok_response.json"

# ─── Hardcoded credentials (fall back to env vars if set) ────────────────────
APIFY_TOKEN="${APIFY_TOKEN:-apify_api_vrFlTbyEL2i5L1owUjK6uAopthhJaP1tZfcN}"
MORALIS_API_KEY="${MORALIS_API_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjFlOGM0M2I3LWJjMWEtNDAwMS1iMDYzLTFiODA2ZjkzNDNkNyIsIm9yZ0lkIjoiNTAyODMxIiwidXNlcklkIjoiNTE3Mzg1IiwidHlwZUlkIjoiOWM1MTBkYmUtMzFhMy00NjZlLTgyZmUtNzdmNzE1ZDRhZjNmIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NzIzMTc0NzIsImV4cCI6NDkyODA3NzQ3Mn0.Cz08xuMT04Ty9LFSkknUJa_POOiipAVfg3Dp4uGkLfM}"
GROK_API_KEY="${GROK_API_KEY:-xai-z_mtD_QsGsKEwZUk8bbexMA17T7imHpdsuavCg_TDluoNwqTNl}"
SUPABASE_URL="${SUPABASE_URL:-https://mziuxsfxevjnmdwnrqjs.supabase.co}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16aXV4c2Z4ZXZqbm1kd25ycWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjgzMzQsImV4cCI6MjA4Njc0NDMzNH0.APi_x5YBKa8bOKpjLGiJUBB5qxi3rKKxWiApQAlf78c}"

log_section "ENVIRONMENT CHECK"

MISSING=0
for VAR in APIFY_TOKEN MORALIS_API_KEY GROK_API_KEY SUPABASE_URL SUPABASE_ANON_KEY; do
  if [ -z "${!VAR:-}" ]; then
    log_error "Missing: \$$VAR"
    MISSING=1
  else
    log_info "\$$VAR ✓"
  fi
done

if [ "$MISSING" -eq 1 ]; then
  log_error "FATAL: MORALIS_API_KEY and GROK_API_KEY must be set. Export them or edit spacebot.sh line 57-58."
  exit 1
fi

# ─── Initialize files on first run ──────────────────────────────────────────
log_section "INITIALIZATION"

if [ ! -f "$SEARCH_TERMS_FILE" ]; then
  cat > "$SEARCH_TERMS_FILE" << 'SEARCH_EOF'
{
  "searchTerms": "(\"pump.fun\" OR pumpfun OR \"new memecoin\" OR \"launching now\") (ai OR cat OR agent OR celebrity OR frog OR dog) min_faves:150 since:2026-02-20",
  "sort": "Latest",
  "maxItems": 400,
  "onlyVerifiedUsers": false,
  "includeSearchTerms": true
}
SEARCH_EOF
  log_info "Created default search_terms.json"
else
  log_info "search_terms.json exists — using evolved queries"
fi

if [ ! -f "$NARRATIVES_LOG" ]; then
  echo "[]" > "$NARRATIVES_LOG"
  log_info "Created narratives_log.json"
fi

touch "$LOG_FILE"
log_info "Log file: $LOG_FILE"

# ─── Read soul.md system prompt ──────────────────────────────────────────────
SOUL_FILE="$SCRIPT_DIR/soul.md"
if [ -f "$SOUL_FILE" ]; then
  # Extract the system prompt block from soul.md (between ```system-prompt markers)
  SYSTEM_PROMPT=$(sed -n '/^```system-prompt$/,/^```$/{ /^```/d; p; }' "$SOUL_FILE" | tr '\n' ' ' | sed 's/"/\\"/g')
  log_info "Loaded system prompt from soul.md"
else
  log_warn "soul.md not found — using fallback system prompt"
  SYSTEM_PROMPT="You are spacebot, an autonomous Pump.fun narrative hunter. Analyze the data and return ONLY valid JSON: {\"reasoning\": \"...\", \"new_search_terms\": [\"query1\", \"query2\", \"query3\"]}"
fi

# ─── Trap CTRL+C for clean exit ──────────────────────────────────────────────
cleanup() {
  echo ""
  log_section "SHUTDOWN"
  log_warn "spacebot.sh caught SIGINT — shutting down gracefully"
  log_info "Total cycles logged: $(jq 'length' "$NARRATIVES_LOG")"
  log_info "Final search terms: $(jq -r '.searchTerms' "$SEARCH_TERMS_FILE" 2>/dev/null || echo 'N/A')"
  echo -e "${GREEN}${BOLD}👋 spacebot.sh signing off. The narratives will wait.${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ─── Push finding to Supabase research_findings table ────────────────────────
# Inserts a row with category='x' so it shows under the X (Twitter) tab
# in the Research dashboard at /research
push_finding() {
  local TITLE="$1"
  local SUMMARY="$2"
  local SOURCE_URL="${3:-}"
  local FINDING_TYPE="${4:-trend}"
  local RAW_DATA="${5:-{}}"
  local TAGS="${6:-[]}"

  local PAYLOAD
  PAYLOAD=$(jq -n \
    --arg title "$TITLE" \
    --arg summary "$SUMMARY" \
    --arg source_url "$SOURCE_URL" \
    --arg finding_type "$FINDING_TYPE" \
    --arg created_by "spacebot" \
    --argjson raw_data "$RAW_DATA" \
    --argjson tags "$TAGS" \
    '{
      title: $title,
      summary: $summary,
      source_url: $source_url,
      finding_type: $finding_type,
      category: "x",
      status: "new",
      created_by: $created_by,
      raw_data: $raw_data,
      tags: $tags
    }')

  local HTTP_CODE
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$SUPABASE_URL/rest/v1/research_findings" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "$PAYLOAD")

  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    log_sub "Pushed finding to Research: ${TITLE:0:60}..."
  else
    log_warn "Failed to push finding (HTTP $HTTP_CODE): ${TITLE:0:40}"
  fi
}

###############################################################################
#                         MAIN LOOP — RUNS FOREVER                            #
###############################################################################

CYCLE=0

echo -e "\n${GREEN}${BOLD}🚀 spacebot.sh is now fully sentient and self-evolving. Hunting narratives...${NC}\n"

while true; do
  CYCLE=$((CYCLE + 1))
  CYCLE_START=$(date +%s)
  CYCLE_TS=$(ts)

  log_section "CYCLE #$CYCLE — $CYCLE_TS"
  echo "[$CYCLE_TS] Cycle $CYCLE started" >> "$LOG_FILE"

  # ═══════════════════════════════════════════════════════════════════════════
  # STEP 1: Scrape tweets via Apify
  # ═══════════════════════════════════════════════════════════════════════════
  log_section "STEP 1: Tweet Scrape (Apify)"

  APIFY_URL="https://api.apify.com/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items?token=$APIFY_TOKEN"

  log_info "Sending search to Apify..."
  log_sub "Query: $(jq -r '.searchTerms' "$SEARCH_TERMS_FILE" | head -c 80)..."

  HTTP_CODE=$(curl -s -w "\n%{http_code}" \
    -X POST "$APIFY_URL" \
    -H "Content-Type: application/json" \
    -d @"$SEARCH_TERMS_FILE" \
    -o "$TWEETS_FILE" 2>/dev/null | tail -1)

  if [ "${HTTP_CODE:-0}" -ge 200 ] && [ "${HTTP_CODE:-0}" -lt 300 ] && [ -f "$TWEETS_FILE" ]; then
    TWEET_COUNT=$(jq 'length' "$TWEETS_FILE" 2>/dev/null || echo 0)
    log_info "Scraped $TWEET_COUNT tweets"
  else
    log_warn "Apify returned HTTP $HTTP_CODE — using empty tweet set"
    echo "[]" > "$TWEETS_FILE"
    TWEET_COUNT=0
  fi

  # ═══════════════════════════════════════════════════════════════════════════
  # STEP 2: Pull Pump.fun tokens from Moralis
  # ═══════════════════════════════════════════════════════════════════════════
  log_section "STEP 2: Moralis Pump.fun Tokens"

  MORALIS_HEADER="X-API-Key: $MORALIS_API_KEY"

  # New tokens (freshest launches)
  curl -s -H "$MORALIS_HEADER" \
    "https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/new?limit=150" \
    -o "$MORALIS_NEW" 2>/dev/null
  NEW_COUNT=$(jq 'if type == "array" then length else 0 end' "$MORALIS_NEW" 2>/dev/null || echo 0)
  log_info "New tokens: $NEW_COUNT"

  # Bonding curve tokens
  curl -s -H "$MORALIS_HEADER" \
    "https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/bonding?limit=100" \
    -o "$MORALIS_BONDING" 2>/dev/null
  BOND_COUNT=$(jq 'if type == "array" then length else 0 end' "$MORALIS_BONDING" 2>/dev/null || echo 0)
  log_info "Bonding tokens: $BOND_COUNT"

  # Graduated tokens
  curl -s -H "$MORALIS_HEADER" \
    "https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/graduated?limit=50" \
    -o "$MORALIS_GRADUATED" 2>/dev/null
  GRAD_COUNT=$(jq 'if type == "array" then length else 0 end' "$MORALIS_GRADUATED" 2>/dev/null || echo 0)
  log_info "Graduated tokens: $GRAD_COUNT"

  # Merge all tokens into a single array, take top 80 unique by address
  jq -s '
    [ .[0], .[1], .[2] ] | map(if type == "array" then . else [] end) | add
    | unique_by(.tokenAddress // .address // .mint // .token_address)
    | .[0:80]
  ' "$MORALIS_NEW" "$MORALIS_BONDING" "$MORALIS_GRADUATED" > "$SCRIPT_DIR/all_tokens.json" 2>/dev/null || echo "[]" > "$SCRIPT_DIR/all_tokens.json"

  TOKEN_COUNT=$(jq 'length' "$SCRIPT_DIR/all_tokens.json" 2>/dev/null || echo 0)
  log_info "Merged unique tokens (top 80): $TOKEN_COUNT"

  # ═══════════════════════════════════════════════════════════════════════════
  # STEP 3: Enrich tokens via DexScreener
  # ═══════════════════════════════════════════════════════════════════════════
  log_section "STEP 3: DexScreener Enrichment"

  echo "[]" > "$ENRICHED_FILE"
  ENRICH_COUNT=0

  # Extract addresses from the merged token list
  ADDRESSES=$(jq -r '.[] | (.tokenAddress // .address // .mint // .token_address // empty)' "$SCRIPT_DIR/all_tokens.json" 2>/dev/null)

  for ADDR in $ADDRESSES; do
    [ -z "$ADDR" ] && continue

    # Call DexScreener public API (no key needed, 300 req/min limit)
    DEX_DATA=$(curl -s "https://api.dexscreener.com/latest/dex/tokens/$ADDR" 2>/dev/null)

    # Extract the first (best) pair's metrics
    ENRICHED=$(echo "$DEX_DATA" | jq --arg addr "$ADDR" '
      if .pairs and (.pairs | length > 0) then
        .pairs[0] | {
          tokenAddress: $addr,
          pairAddress: .pairAddress,
          dexId: .dexId,
          baseToken: .baseToken,
          quoteToken: .quoteToken,
          priceUsd: .priceUsd,
          volume24h: (.volume.h24 // 0),
          liquidity: (.liquidity.usd // 0),
          txns24h_buys: (.txns.h24.buys // 0),
          txns24h_sells: (.txns.h24.sells // 0),
          priceChange5m: (.priceChange.m5 // 0),
          priceChange1h: (.priceChange.h1 // 0),
          priceChange6h: (.priceChange.h6 // 0),
          priceChange24h: (.priceChange.h24 // 0),
          mcap: (.marketCap // 0),
          pairCreatedAt: .pairCreatedAt,
          url: .url
        }
      else
        { tokenAddress: $addr, status: "no_pairs_found" }
      end
    ' 2>/dev/null)

    if [ -n "$ENRICHED" ]; then
      # Append to enriched file
      jq --argjson item "$ENRICHED" '. + [$item]' "$ENRICHED_FILE" > "$ENRICHED_FILE.tmp" && mv "$ENRICHED_FILE.tmp" "$ENRICHED_FILE"
      ENRICH_COUNT=$((ENRICH_COUNT + 1))
    fi

    # Small delay to respect rate limits (300/min ≈ 5/sec)
    sleep 0.2
  done

  log_info "Enriched $ENRICH_COUNT tokens with DexScreener data"

  # ═══════════════════════════════════════════════════════════════════════════
  # STEP 4: Fuzzy-match tweets to tokens
  # ═══════════════════════════════════════════════════════════════════════════
  log_section "STEP 4: Tweet ↔ Token Matching"

  # Build a combined dataset: for each enriched token, find tweets mentioning
  # its name, symbol, or address (case-insensitive fuzzy match via jq)
  MATCHED_DATA=$(jq --slurpfile tweets "$TWEETS_FILE" '
    . as $tokens |
    [ $tokens[] | . as $tok |
      ($tok.baseToken.name // "" | ascii_downcase) as $name |
      ($tok.baseToken.symbol // "" | ascii_downcase) as $sym |
      ($tok.tokenAddress // "") as $addr |
      {
        token: $tok,
        matched_tweets: [
          $tweets[0][] |
          select(
            (.full_text // .text // "" | ascii_downcase) as $txt |
            ($txt | contains($name) and ($name | length > 2)) or
            ($txt | contains($sym) and ($sym | length > 1)) or
            ($txt | contains($addr[0:12]))
          ) |
          {
            text: (.full_text // .text // ""),
            user: (.user.screen_name // .author // "unknown"),
            favorites: (.favorite_count // .likes // 0),
            retweets: (.retweet_count // .retweets // 0),
            created_at: (.created_at // "")
          }
        ],
        tweet_velocity: (
          [ $tweets[0][] |
            select(
              (.full_text // .text // "" | ascii_downcase) as $txt |
              ($txt | contains($name) and ($name | length > 2)) or
              ($txt | contains($sym) and ($sym | length > 1))
            )
          ] | length
        ),
        total_engagement: (
          [ $tweets[0][] |
            select(
              (.full_text // .text // "" | ascii_downcase) as $txt |
              ($txt | contains($name) and ($name | length > 2)) or
              ($txt | contains($sym) and ($sym | length > 1))
            ) |
            ((.favorite_count // .likes // 0) + (.retweet_count // .retweets // 0))
          ] | add // 0
        )
      }
    ] | sort_by(-.tweet_velocity) | .[0:30]
  ' "$ENRICHED_FILE" 2>/dev/null || echo "[]")

  MATCH_COUNT=$(echo "$MATCHED_DATA" | jq 'length' 2>/dev/null || echo 0)
  log_info "Matched $MATCH_COUNT token-tweet clusters"

  # Save matched data for Grok
  echo "$MATCHED_DATA" > "$SCRIPT_DIR/matched_data.json"

  # ═══════════════════════════════════════════════════════════════════════════
  # STEP 5: Feed data to Grok for narrative analysis
  # ═══════════════════════════════════════════════════════════════════════════
  log_section "STEP 5: Grok Narrative Analysis"

  # Build the user message with enriched data summary
  USER_MSG=$(jq -Rs '.' <<< "$(cat <<MSG_EOF
CYCLE TIMESTAMP: $CYCLE_TS

TWEET STATS: $TWEET_COUNT tweets scraped
TOKEN STATS: $TOKEN_COUNT tokens from Moralis, $ENRICH_COUNT enriched via DexScreener
MATCHED CLUSTERS: $MATCH_COUNT

TOP MATCHED DATA (sorted by tweet velocity):
$(echo "$MATCHED_DATA" | jq -r '
  .[0:15][] |
  "TOKEN: \(.token.baseToken.symbol // "?") | MCAP: $\(.token.mcap // 0) | Vol24h: $\(.token.volume24h // 0) | Δ1h: \(.token.priceChange1h // 0)% | Δ24h: \(.token.priceChange24h // 0)% | Tweets: \(.tweet_velocity) | Engagement: \(.total_engagement) | Liq: $\(.token.liquidity // 0) | Buys24h: \(.token.txns24h_buys // 0) | Sells24h: \(.token.txns24h_sells // 0)"
' 2>/dev/null || echo "No match data available")

CURRENT SEARCH TERMS:
$(jq -r '.searchTerms' "$SEARCH_TERMS_FILE" 2>/dev/null || echo "default")

PREVIOUS CYCLE REASONING:
$(jq -r '.[-1].reasoning // "First cycle — no prior data"' "$NARRATIVES_LOG" 2>/dev/null || echo "First cycle")
MSG_EOF
)")

  # Build Grok API request payload
  GROK_PAYLOAD=$(jq -n \
    --arg system "$SYSTEM_PROMPT" \
    --argjson user_msg "$USER_MSG" \
    '{
      model: "grok-4",
      temperature: 0.3,
      max_tokens: 2000,
      messages: [
        { role: "system", content: $system },
        { role: "user", content: $user_msg }
      ]
    }')

  log_info "Sending enriched data to Grok (grok-4)..."

  GROK_HTTP=$(curl -s -w "\n%{http_code}" \
    -X POST "https://api.x.ai/v1/chat/completions" \
    -H "Authorization: Bearer $GROK_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$GROK_PAYLOAD" \
    -o "$GROK_RESPONSE" 2>/dev/null | tail -1)

  if [ "${GROK_HTTP:-0}" -ge 200 ] && [ "${GROK_HTTP:-0}" -lt 300 ]; then
    log_info "Grok responded (HTTP $GROK_HTTP)"

    # Extract the content from Grok's response
    GROK_CONTENT=$(jq -r '.choices[0].message.content // ""' "$GROK_RESPONSE" 2>/dev/null)

    # Try to parse JSON from Grok's response (it might have markdown wrapping)
    GROK_JSON=$(echo "$GROK_CONTENT" | sed 's/```json//g; s/```//g' | jq '.' 2>/dev/null || echo "")

    if [ -n "$GROK_JSON" ]; then
      REASONING=$(echo "$GROK_JSON" | jq -r '.reasoning // "No reasoning provided"')
      NEW_TERMS=$(echo "$GROK_JSON" | jq -r '.new_search_terms // []')
      TERMS_COUNT=$(echo "$NEW_TERMS" | jq 'length' 2>/dev/null || echo 0)

      log_info "Grok reasoning: ${REASONING:0:120}..."
      log_info "New search terms: $TERMS_COUNT"

      # ═══════════════════════════════════════════════════════════════════════
      # STEP 6: Update search terms for next cycle
      # ═══════════════════════════════════════════════════════════════════════
      log_section "STEP 6: Self-Evolution"

      if [ "$TERMS_COUNT" -gt 0 ] && [ "$TERMS_COUNT" -le 3 ]; then
        # Build new search_terms.json from Grok's suggestions
        # Each term becomes a separate Apify searchTerms query
        FIRST_TERM=$(echo "$NEW_TERMS" | jq -r '.[0] // empty')
        if [ -n "$FIRST_TERM" ]; then
          jq -n --arg terms "$FIRST_TERM" '{
            searchTerms: $terms,
            sort: "Latest",
            maxItems: 400,
            onlyVerifiedUsers: false,
            includeSearchTerms: true
          }' > "$SEARCH_TERMS_FILE"
          log_info "Search terms evolved → $FIRST_TERM"
        fi
      else
        log_warn "Grok returned invalid terms count ($TERMS_COUNT) — keeping current"
      fi

      # ═══════════════════════════════════════════════════════════════════════
      # STEP 7: Push findings to Supabase (Research → X category)
      # ═══════════════════════════════════════════════════════════════════════
      log_section "STEP 7: Push to Research Dashboard"

      # Push the overall cycle narrative as a "trend" finding
      CYCLE_RAW=$(jq -n \
        --arg reasoning "$REASONING" \
        --argjson new_terms "$NEW_TERMS" \
        --arg tweet_count "$TWEET_COUNT" \
        --arg token_count "$TOKEN_COUNT" \
        --arg match_count "$MATCH_COUNT" \
        '{
          cycle: '"$CYCLE"',
          tweet_count: ($tweet_count | tonumber),
          token_count: ($token_count | tonumber),
          match_count: ($match_count | tonumber),
          reasoning: $reasoning,
          new_search_terms: $new_terms
        }')

      push_finding \
        "🧠 Cycle #$CYCLE Narrative Report" \
        "$REASONING" \
        "" \
        "trend" \
        "$CYCLE_RAW" \
        '["spacebot", "narrative", "cycle-report"]'

      # Push top matched tokens as individual "lead" findings
      TOP_TOKENS=$(echo "$MATCHED_DATA" | jq -r '.[0:10][] | @base64' 2>/dev/null || echo "")

      for TOK_B64 in $TOP_TOKENS; do
        TOK=$(echo "$TOK_B64" | base64 -d 2>/dev/null || echo "{}")
        TOK_NAME=$(echo "$TOK" | jq -r '.token.baseToken.symbol // "?"')
        TOK_MCAP=$(echo "$TOK" | jq -r '.token.mcap // 0')
        TOK_VOL=$(echo "$TOK" | jq -r '.token.volume24h // 0')
        TOK_TWEETS=$(echo "$TOK" | jq -r '.tweet_velocity // 0')
        TOK_ENGAGE=$(echo "$TOK" | jq -r '.total_engagement // 0')
        TOK_CHG1H=$(echo "$TOK" | jq -r '.token.priceChange1h // 0')
        TOK_CHG24H=$(echo "$TOK" | jq -r '.token.priceChange24h // 0')
        TOK_URL=$(echo "$TOK" | jq -r '.token.url // ""')
        TOK_ADDR=$(echo "$TOK" | jq -r '.token.tokenAddress // ""')

        # Only push tokens with meaningful tweet velocity
        if [ "$TOK_TWEETS" -gt 0 ] 2>/dev/null; then
          SUMMARY="\$${TOK_NAME} | MCAP: \$${TOK_MCAP} | Vol24h: \$${TOK_VOL} | Δ1h: ${TOK_CHG1H}% | Δ24h: ${TOK_CHG24H}% | Tweets: ${TOK_TWEETS} | Engagement: ${TOK_ENGAGE}"

          push_finding \
            "🪙 $TOK_NAME — $TOK_TWEETS tweets, MCAP \$$TOK_MCAP" \
            "$SUMMARY" \
            "$TOK_URL" \
            "lead" \
            "$TOK" \
            "[\"spacebot\", \"pump.fun\", \"$TOK_NAME\", \"$TOK_ADDR\"]"
        fi
      done

      log_info "Findings pushed to Research dashboard under X category"

    else
      log_warn "Grok response was not valid JSON — skipping evolution"
      REASONING="Parse error — raw: ${GROK_CONTENT:0:200}"
      NEW_TERMS="[]"
    fi

  else
    log_error "Grok API failed (HTTP $GROK_HTTP)"
    # Try fallback model
    log_warn "Retrying with grok-4-0709..."
    GROK_PAYLOAD_FB=$(echo "$GROK_PAYLOAD" | jq '.model = "grok-4-0709"')
    curl -s -X POST "https://api.x.ai/v1/chat/completions" \
      -H "Authorization: Bearer $GROK_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$GROK_PAYLOAD_FB" \
      -o "$GROK_RESPONSE" 2>/dev/null
    REASONING="Fallback cycle — primary model failed"
    NEW_TERMS="[]"
  fi

  # ═══════════════════════════════════════════════════════════════════════════
  # STEP 8: Append cycle to narratives log
  # ═══════════════════════════════════════════════════════════════════════════
  log_section "STEP 8: Cycle Logging"

  CYCLE_END=$(date +%s)
  CYCLE_DURATION=$((CYCLE_END - CYCLE_START))

  CYCLE_ENTRY=$(jq -n \
    --arg ts "$CYCLE_TS" \
    --arg reasoning "${REASONING:-no data}" \
    --argjson new_terms "${NEW_TERMS:-[]}" \
    --arg tweets "$TWEET_COUNT" \
    --arg tokens "$TOKEN_COUNT" \
    --arg matches "$MATCH_COUNT" \
    --arg duration "$CYCLE_DURATION" \
    --arg cycle "$CYCLE" \
    '{
      cycle: ($cycle | tonumber),
      timestamp: $ts,
      duration_seconds: ($duration | tonumber),
      tweets_scraped: ($tweets | tonumber),
      tokens_found: ($tokens | tonumber),
      matches: ($matches | tonumber),
      reasoning: $reasoning,
      new_search_terms: $new_terms
    }')

  jq --argjson entry "$CYCLE_ENTRY" '. + [$entry]' "$NARRATIVES_LOG" > "$NARRATIVES_LOG.tmp" \
    && mv "$NARRATIVES_LOG.tmp" "$NARRATIVES_LOG"

  log_info "Cycle #$CYCLE complete in ${CYCLE_DURATION}s"
  echo "[$CYCLE_TS] Cycle $CYCLE complete — ${TWEET_COUNT} tweets, ${TOKEN_COUNT} tokens, ${MATCH_COUNT} matches, ${CYCLE_DURATION}s" >> "$LOG_FILE"

  # ═══════════════════════════════════════════════════════════════════════════
  # SLEEP 15 MINUTES
  # ═══════════════════════════════════════════════════════════════════════════
  log_section "SLEEPING 15 MINUTES"
  log_info "Next cycle at $(date -u -d '+15 minutes' +"%H:%M:%S UTC" 2>/dev/null || date -u -v+15M +"%H:%M:%S UTC" 2>/dev/null || echo '~15min from now')"
  echo -e "${CYAN}────────────────────────────────────────────────────────────────${NC}"

  sleep 900

done
