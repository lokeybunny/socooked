/**
 * LORE Check — Determines if a Solana token has "community settlement"
 * 
 * Flow:
 * 1. DexScreener → resolve token socials (Twitter/X handle)
 * 2. Apify → scrape recent tweets from that handle
 * 3. Evaluate engagement thresholds → mark as LORE if genuine community
 * 
 * Thresholds: 50+ replies, 500+ views, 10+ RTs on any tweet = LORE
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LORE_THRESHOLDS = {
  minReplies: 50,
  minViews: 500,
  minRetweets: 10,
}

interface LoreResult {
  is_lore: boolean
  twitter_handle: string | null
  twitter_url: string | null
  top_tweet: {
    url: string
    text: string
    replies: number
    views: number
    retweets: number
    likes: number
  } | null
  engagement_summary: string
  tweets_checked: number
}

async function resolveTwitterFromDexScreener(ca: string): Promise<{ handle: string | null; url: string | null }> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`)
    if (!res.ok) return { handle: null, url: null }
    const data = await res.json()
    const pair = data?.pairs?.[0]
    
    // Paths to skip (not real user profiles)
    const SKIP_PATHS = new Set(['i', 'home', 'explore', 'search', 'settings', 'messages', 'notifications'])

    const extractHandle = (url: string): string | null => {
      const match = url.match(/(?:twitter\.com|x\.com)\/([^/?#]+)/i)
      if (!match) return null
      const candidate = match[1].toLowerCase()
      if (SKIP_PATHS.has(candidate)) return null
      return match[1]
    }

    // Check socials for twitter
    const socials = pair?.info?.socials || []
    const twitter = socials.find((s: any) => s.type === 'twitter')
    if (twitter?.url) {
      const handle = extractHandle(twitter.url)
      if (handle) return { handle, url: twitter.url }
    }

    // Also check websites for x.com links
    const websites = pair?.info?.websites || []
    for (const w of websites) {
      const handle = extractHandle(w.url || '')
      if (handle) return { handle, url: w.url }
    }

    // Fallback: check Moralis metadata for twitter links
    try {
      const MORALIS_API_KEY = Deno.env.get('MORALIS_API_KEY')
      if (MORALIS_API_KEY) {
        const metaRes = await fetch(
          `https://solana-gateway.moralis.io/token/mainnet/${ca}/metadata`,
          { headers: { 'X-API-Key': MORALIS_API_KEY, 'Accept': 'application/json' } }
        )
        if (metaRes.ok) {
          const meta = await metaRes.json()
          const desc = (meta?.description || '').toLowerCase()
          // Look for x.com or twitter.com links in description
          const twitterMatch = desc.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,15})/i)
          if (twitterMatch) {
            const handle = twitterMatch[1]
            if (!SKIP_PATHS.has(handle.toLowerCase())) {
              return { handle, url: `https://x.com/${handle}` }
            }
          }
          // Check links object
          if (meta?.links?.twitter) {
            const handle = extractHandle(meta.links.twitter)
            if (handle) return { handle, url: meta.links.twitter }
          }
        }
      }
    } catch {}

    return { handle: null, url: null }
  } catch {
    return { handle: null, url: null }
  }
}

async function scrapeTwitterEngagement(handle: string, apifyToken: string): Promise<any[]> {
  try {
    // Use Apify's tweet scraper to get recent tweets from this handle
    const input = {
      searchQueries: [`from:${handle}`],
      maxTweets: 10,
      addUserInfo: false,
    }

    console.log(`[lore] Scraping tweets from @${handle} via Apify...`)

    // Run the actor synchronously (wait for results)
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/happitap~twitter-tweet-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(60_000), // 60s timeout
      }
    )

    if (!runRes.ok) {
      const errText = await runRes.text().catch(() => '')
      console.error(`[lore] Apify run failed (${runRes.status}):`, errText)
      return []
    }

    const tweets = await runRes.json()
    console.log(`[lore] Got ${tweets?.length || 0} tweets from @${handle}`)
    return Array.isArray(tweets) ? tweets : []
  } catch (err: any) {
    console.error(`[lore] Apify scrape error:`, err.message)
    return []
  }
}

function evaluateLore(tweets: any[]): LoreResult {
  if (!tweets.length) {
    return {
      is_lore: false,
      twitter_handle: null,
      twitter_url: null,
      top_tweet: null,
      engagement_summary: 'No tweets found',
      tweets_checked: 0,
    }
  }

  // Find the best tweet by engagement
  let bestTweet: any = null
  let bestScore = 0

  for (const tw of tweets) {
    const replies = tw.replyCount || tw.reply_count || 0
    const views = tw.viewCount || tw.view_count || 0
    const retweets = tw.retweetCount || tw.retweet_count || 0
    const likes = tw.likeCount || tw.like_count || tw.favoriteCount || 0
    
    const score = replies * 3 + retweets * 2 + likes + (views / 100)
    if (score > bestScore) {
      bestScore = score
      bestTweet = {
        url: tw.url || tw.tweetUrl || '',
        text: (tw.text || tw.full_text || '').slice(0, 280),
        replies,
        views,
        retweets,
        likes,
      }
    }
  }

  // Check if ANY tweet meets the LORE thresholds
  const meetsThreshold = tweets.some((tw: any) => {
    const replies = tw.replyCount || tw.reply_count || 0
    const views = tw.viewCount || tw.view_count || 0
    const retweets = tw.retweetCount || tw.retweet_count || 0
    return replies >= LORE_THRESHOLDS.minReplies &&
           views >= LORE_THRESHOLDS.minViews &&
           retweets >= LORE_THRESHOLDS.minRetweets
  })

  const is_lore = meetsThreshold

  return {
    is_lore,
    twitter_handle: null, // filled by caller
    twitter_url: null,
    top_tweet: bestTweet,
    engagement_summary: is_lore
      ? `LORE ✓ — Community settlement confirmed (${bestTweet?.replies} replies, ${bestTweet?.views} views, ${bestTweet?.retweets} RTs)`
      : `Not LORE — Best tweet: ${bestTweet?.replies || 0} replies, ${bestTweet?.views || 0} views, ${bestTweet?.retweets || 0} RTs (needs 50+ replies, 500+ views, 10+ RTs)`,
    tweets_checked: tweets.length,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const APIFY_TOKEN = Deno.env.get('APIFY_TOKEN')
    if (!APIFY_TOKEN) throw new Error('APIFY_TOKEN not configured')

    const { ca_address, alert_id } = await req.json()
    if (!ca_address) throw new Error('ca_address required')

    console.log(`[lore] Checking LORE status for ${ca_address.slice(0, 8)}...`)

    // Step 1: Resolve Twitter/X handle from DexScreener
    const { handle, url: twitterUrl } = await resolveTwitterFromDexScreener(ca_address)

    if (!handle) {
      console.log(`[lore] No Twitter handle found for ${ca_address.slice(0, 8)}...`)
      
      // Update DB if alert_id provided
      if (alert_id) {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )
        await supabase.from('market_cap_alerts').update({
          audit_data: {
            lore_check: {
              is_lore: false,
              twitter_handle: null,
              engagement_summary: 'No Twitter/X handle found via DexScreener',
              checked_at: new Date().toISOString(),
            },
          },
        }).eq('id', alert_id)
      }

      return new Response(JSON.stringify({
        is_lore: false,
        twitter_handle: null,
        engagement_summary: 'No Twitter/X handle found via DexScreener',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[lore] Found Twitter handle: @${handle}`)

    // Step 2: Scrape tweets via Apify
    const tweets = await scrapeTwitterEngagement(handle, APIFY_TOKEN)

    // Step 3: Evaluate engagement
    const result = evaluateLore(tweets)
    result.twitter_handle = handle
    result.twitter_url = twitterUrl

    console.log(`[lore] Result: is_lore=${result.is_lore}, handle=@${handle}, tweets=${result.tweets_checked}`)

    // Step 4: Update DB
    if (alert_id) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      // Merge lore_check into existing audit_data
      const { data: existingAlert } = await supabase
        .from('market_cap_alerts')
        .select('audit_data')
        .eq('id', alert_id)
        .single()

      const existingAuditData = (existingAlert?.audit_data && typeof existingAlert.audit_data === 'object')
        ? existingAlert.audit_data as Record<string, unknown>
        : {}

      await supabase.from('market_cap_alerts').update({
        is_j7tracker: result.is_lore,
        audit_data: {
          ...existingAuditData,
          lore_check: {
            ...result,
            checked_at: new Date().toISOString(),
          },
        },
      }).eq('id', alert_id)
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[lore] error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
