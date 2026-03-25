import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface RotationAccount {
  id: string;
  handle: string;
  status: "active" | "paused" | "capped";
  capped_at?: string;
  posts_today: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const MIN_GAP_MS = 30 * 60 * 1000;

    // ── PST/PDT posting window: 5AM - 9PM Pacific ──
    const getPacificHour = (d: Date): number => {
      const year = d.getUTCFullYear();
      const marStart = new Date(Date.UTC(year, 2, 8));
      marStart.setUTCDate(8 + (7 - marStart.getUTCDay()) % 7);
      const novEnd = new Date(Date.UTC(year, 10, 1));
      novEnd.setUTCDate(1 + (7 - novEnd.getUTCDay()) % 7);
      const offset = (d >= marStart && d < novEnd) ? -7 : -8;
      return (d.getUTCHours() + offset + 24) % 24;
    };
    const pacificHour = getPacificHour(now);
    if (pacificHour < 5 || pacificHour >= 21) {
      return json({ ok: true, processed: 0, skipped: true, reason: `Outside posting window (${pacificHour}h Pacific, allowed 5AM-9PM)` });
    }

    // ── Anti-spam: check when the last post was actually sent ──
    const { data: lastPosted } = await supabase
      .from("shill_scheduled_posts")
      .select("updated_at")
      .in("status", ["posted", "processing"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (lastPosted?.updated_at) {
      const lastPostedMs = new Date(lastPosted.updated_at).getTime();
      const elapsed = now.getTime() - lastPostedMs;
      if (elapsed < MIN_GAP_MS) {
        const waitMin = Math.ceil((MIN_GAP_MS - elapsed) / 60000);
        return json({ ok: true, processed: 0, skipped: true, wait_minutes: waitMin, reason: `Last post was ${Math.floor(elapsed / 60000)}m ago, need ${Math.ceil(MIN_GAP_MS / 60000)}m gap` });
      }
    }

    // ── Hourly rate limit: max 3 posts in the last 60 minutes ──
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const { count: postsLastHour } = await supabase
      .from("shill_scheduled_posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "posted")
      .gte("updated_at", oneHourAgo);

    if ((postsLastHour ?? 0) >= 3) {
      const { data: recentThree } = await supabase
        .from("shill_scheduled_posts")
        .select("updated_at")
        .eq("status", "posted")
        .order("updated_at", { ascending: false })
        .limit(3);

      if (recentThree && recentThree.length >= 3) {
        const thirdPostTime = new Date(recentThree[2].updated_at).getTime();
        const dayHash = now.getUTCDate() + now.getUTCMonth() * 31 + now.getUTCHours();
        const cooldownHours = 1 + (dayHash % 3);
        const cooldownMs = cooldownHours * 60 * 60 * 1000;
        const cooldownEnd = thirdPostTime + cooldownMs;
        const remainingMs = cooldownEnd - now.getTime();

        if (remainingMs > 0) {
          const remainingMin = Math.ceil(remainingMs / 60000);
          return json({
            ok: true, processed: 0, skipped: true,
            cooldown_hours: cooldownHours,
            wait_minutes: remainingMin,
            reason: `3-post burst detected. ${cooldownHours}h cooldown in effect — ${remainingMin}m remaining`,
          });
        }
      }

      return json({ ok: true, processed: 0, skipped: true, reason: "3 posts already sent in the last hour" });
    }

    // ── Load rotation accounts ──
    const { data: rotCfg } = await supabase
      .from("site_configs")
      .select("content")
      .eq("site_id", "smm-auto-shill")
      .eq("section", "shill-rotation-accounts")
      .maybeSingle();

    let rotationAccounts: RotationAccount[] = (rotCfg?.content as any)?.accounts || [];

    // Auto-reset capped accounts at midnight UTC
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    let rotationChanged = false;
    for (const acc of rotationAccounts) {
      if (acc.status === "capped" && acc.capped_at && acc.capped_at < todayStart) {
        acc.status = "active";
        acc.posts_today = 0;
        acc.capped_at = undefined;
        rotationChanged = true;
      }
    }
    if (rotationChanged) {
      await supabase.from("site_configs").upsert({
        site_id: "smm-auto-shill",
        section: "shill-rotation-accounts",
        content: { accounts: rotationAccounts },
      }, { onConflict: "site_id,section" });
    }

    // Get the active account (first active one in the rotation)
    const getActiveAccount = (): RotationAccount | null => {
      return rotationAccounts.find(a => a.status === "active") || null;
    };

    // Only process 1 post per invocation
    const { data: duePosts, error: fetchErr } = await supabase
      .from("shill_scheduled_posts")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(1);

    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!duePosts || duePosts.length === 0) return json({ ok: true, processed: 0 });

    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    const X_COMMUNITY_ID = "2029596385180291485";
    let processed = 0;

    for (const post of duePosts) {
      await supabase.from("shill_scheduled_posts").update({ status: "processing" }).eq("id", post.id);

      try {
        // Load CA address
        const { data: caConfigRow } = await supabase
          .from("site_configs")
          .select("content")
          .eq("site_id", "smm-auto-shill")
          .eq("section", "NysonBlack")
          .maybeSingle();
        const caAddress = (caConfigRow?.content as any)?.ca_address || "7oXNE1dbpHUp6dn1JF8pRgCtzfCy4P2FuBneWjZHpump";
        const CA_SIGNATURE = `\n\nCA - ${caAddress}`;

        // ── Resolve $TICKER placeholder ──
        // Look up the community name from the Away Comm config (by community_id)
        // or from the Home Comm config (targets)
        let tickerName = "";
        let hideTickerFlag = false;
        const postCommunityId = post.community_id || "";

        // Try Away Comm config first
        const { data: sxCfgRow } = await supabase.from("site_configs")
          .select("content").eq("site_id", "smm-auto-shill").eq("section", "shill-x-config").maybeSingle();
        const awayCommunities = (sxCfgRow?.content as any)?.communities || [];
        const matchedAway = awayCommunities.find((c: any) => c.community_id === postCommunityId);
        if (matchedAway) {
          tickerName = matchedAway.community_name || "";
          hideTickerFlag = !!matchedAway.hide_ticker;
        }

        // If not found in Away, try Home Comm targets
        if (!tickerName) {
          const { data: homeCfgRow } = await supabase.from("site_configs")
            .select("content").eq("site_id", "x-shill").eq("section", "targets").maybeSingle();
          const homeTargets = (homeCfgRow?.content as any)?.targets || [];
          const matchedHome = homeTargets.find((t: any) => t.community_id === postCommunityId);
          if (matchedHome) tickerName = matchedHome.community_name || "";
        }

        // Replace $TICKER in caption (case-insensitive)
        let resolvedCaption = post.caption;
        if (tickerName) {
          resolvedCaption = resolvedCaption.replace(/\$TICKER/gi, tickerName);
        }

        // ── Away Comm posting window: 10AM - 5PM PST only ──
        const isAwayComm = !!matchedAway;
        if (isAwayComm) {
          if (pacificHour < 10 || pacificHour >= 17) {
            // Outside Away Comm window — revert to scheduled and skip
            await supabase.from("shill_scheduled_posts").update({ status: "scheduled" }).eq("id", post.id);
            console.log(`[shill-scheduler] ⏳ Away Comm post ${post.id} skipped — ${pacificHour}h Pacific, allowed 10AM-5PM`);
            continue;
          }
        }

        // If hide_ticker is enabled, strip the ticker from the caption
        // (the ticker won't be auto-appended by the system)
        let captionWithSig = resolvedCaption + (hideTickerFlag ? "" : CA_SIGNATURE);

        // ── Signature injection: append @handles from comm scrapes ──
        try {
          const { data: sigCfgRow } = await supabase.from("site_configs")
            .select("content").eq("site_id", "smm-auto-shill").eq("section", "shill-signature-config").maybeSingle();
          const sigCfg = (sigCfgRow?.content as any) || {};

          if (sigCfg.enabled && sigCfg.scrape_ids?.length > 0) {
            // Load members from selected scrapes
            const { data: scrapeRows } = await supabase.from("comm_scrapes")
              .select("members").in("id", sigCfg.scrape_ids);

            let allHandles: string[] = [];
            for (const row of (scrapeRows || [])) {
              const members = (row.members as any[]) || [];
              for (const m of members) {
                const handle = (m.username || m.handle || "").replace(/^@/, "").trim();
                if (!handle) continue;
                if (sigCfg.mode === "verified" && !m.verified) continue;
                allHandles.push(handle);
              }
            }

            // De-duplicate
            allHandles = [...new Set(allHandles)];

            // Remove handles on 5-day cooldown
            const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
            const { data: usedRows } = await supabase.from("signature_usage")
              .select("handle").gte("used_at", fiveDaysAgo);
            const cooldownSet = new Set((usedRows || []).map((r: any) => r.handle.toLowerCase()));
            const available = allHandles.filter(h => !cooldownSet.has(h.toLowerCase()));

            if (available.length > 0) {
              // Shuffle
              for (let i = available.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [available[i], available[j]] = [available[j], available[i]];
              }

              // Calculate max handles that fit within 280 chars
              const sigPrefix = "\n\n⌈ ";
              const sigSuffix = " ⌋";
              const separator = " · ";
              const currentLen = captionWithSig.length;
              const overhead = sigPrefix.length + sigSuffix.length;
              let remaining = 280 - currentLen - overhead;
              const picked: string[] = [];

              for (const h of available) {
                const tag = `@${h}`;
                const needed = picked.length === 0 ? tag.length : separator.length + tag.length;
                if (remaining >= needed) {
                  picked.push(h);
                  remaining -= needed;
                } else break;
              }

              if (picked.length > 0) {
                captionWithSig += sigPrefix + picked.map(h => `@${h}`).join(separator) + sigSuffix;

                // Record usage
                const usageRows = picked.map(h => ({ handle: h, post_id: post.id }));
                await supabase.from("signature_usage").insert(usageRows);
                console.log(`[shill-scheduler] 🏷️ Signature: appended ${picked.length} handles`);
              }
            }
          }
        } catch (sigErr: any) {
          console.error("[shill-scheduler] signature error (non-fatal):", sigErr.message);
        }

        // Determine which account to use — try rotation pool first
        let accountToUse = post.x_account || "xslaves";
        const activeAcc = getActiveAccount();
        if (activeAcc) {
          accountToUse = activeAcc.handle;
        }

        // ── Try posting, with account rotation on daily cap ──
        let postSuccess = false;
        let lastErrMsg = "";
        let triedAccounts = 0;
        const maxRetries = rotationAccounts.filter(a => a.status === "active").length || 1;

        while (!postSuccess && triedAccounts < maxRetries) {
          triedAccounts++;

          const postRes = await fetch(`${SUPABASE_URL}/functions/v1/smm-api?action=upload-video`, {
            method: "POST",
            headers: {
              "apikey": ANON_KEY,
              "Authorization": `Bearer ${ANON_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: captionWithSig,
              video: post.video_url,
              "platform[]": ["x"],
              user: accountToUse,
              community_id: post.community_id || X_COMMUNITY_ID,
            }),
          });

          const postResult = await postRes.json();

          if (!postRes.ok || postResult?.error) {
            lastErrMsg = postResult?.error || postResult?.message || `HTTP ${postRes.status}`;
            const isDailyCap = lastErrMsg.toLowerCase().includes("daily") &&
              (lastErrMsg.toLowerCase().includes("cap") || lastErrMsg.toLowerCase().includes("limit"));

            if (isDailyCap && rotationAccounts.length > 0) {
              // Mark current account as capped
              console.log(`[shill-scheduler] Account @${accountToUse} hit daily cap, rotating...`);
              rotationAccounts = rotationAccounts.map(a =>
                a.handle === accountToUse ? { ...a, status: "capped" as const, capped_at: nowIso } : a
              );
              // Save updated rotation state
              await supabase.from("site_configs").upsert({
                site_id: "smm-auto-shill",
                section: "shill-rotation-accounts",
                content: { accounts: rotationAccounts },
              }, { onConflict: "site_id,section" });

              // Notify via Telegram
              if (post.chat_id && TG_TOKEN) {
                await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: post.chat_id,
                    text: `⚠️ @${accountToUse} hit daily cap (50/50). Auto-rotating to next account...`,
                  }),
                });
              }

              // Try next active account
              const nextAcc = rotationAccounts.find(a => a.status === "active");
              if (nextAcc) {
                accountToUse = nextAcc.handle;
                continue; // retry with new account
              } else {
                // All accounts capped
                lastErrMsg = "All rotation accounts have hit their daily cap. Post queued for retry.";
                break;
              }
            } else {
              // Non-cap error, don't rotate
              break;
            }
          } else {
            // Success!
            postSuccess = true;

            // Increment post count for the account
            rotationAccounts = rotationAccounts.map(a =>
              a.handle === accountToUse ? { ...a, posts_today: (a.posts_today || 0) + 1 } : a
            );
            await supabase.from("site_configs").upsert({
              site_id: "smm-auto-shill",
              section: "shill-rotation-accounts",
              content: { accounts: rotationAccounts },
            }, { onConflict: "site_id,section" });

            const requestId = postResult?.request_id || postResult?.data?.request_id || "";

            // Poll for completion
            let postUrl = "";
            let statusLabel = "submitted";
            if (requestId) {
              for (let poll = 0; poll < 12; poll++) {
                await new Promise((r) => setTimeout(r, 5000));
                try {
                  const statusRes = await fetch(
                    `${SUPABASE_URL}/functions/v1/smm-api?action=upload-status&request_id=${requestId}`,
                    { headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}` } },
                  );
                  const statusData = await statusRes.json();
                  const st = statusData?.status || statusData?.data?.status || "";
                  if (st === "completed" || st === "success" || st === "done") {
                    statusLabel = "completed";
                    postUrl = statusData?.post_url || statusData?.data?.post_url ||
                      statusData?.results?.[0]?.url || statusData?.data?.results?.[0]?.url ||
                      statusData?.posts?.[0]?.post_url || statusData?.data?.posts?.[0]?.post_url || "";
                    break;
                  }
                  if (st === "failed" || st === "error") {
                    statusLabel = "failed";
                    break;
                  }
                } catch (_) { /* continue polling */ }
              }
            }

            if (statusLabel === "failed") {
              await supabase.from("shill_scheduled_posts").update({
                status: "failed",
                request_id: requestId,
                error: "Video processing failed on provider side",
              }).eq("id", post.id);
            } else {
              await supabase.from("shill_scheduled_posts").update({
                status: "posted",
                request_id: requestId,
                post_url: postUrl || null,
                x_account: accountToUse,
              }).eq("id", post.id);

              // ── Repeat Daily: schedule same post for tomorrow same time ──
              if (post.repeat_daily) {
                const nextDay = new Date(new Date(post.scheduled_at).getTime() + 24 * 60 * 60 * 1000).toISOString();
                await supabase.from("shill_scheduled_posts").insert({
                  chat_id: post.chat_id,
                  caption: post.caption,
                  video_url: post.video_url,
                  storage_path: post.storage_path,
                  community_id: post.community_id,
                  x_account: post.x_account,
                  scheduled_at: nextDay,
                  status: "scheduled",
                  repeat_daily: true,
                  all_mode: post.all_mode || false,
                });
                console.log(`[shill-scheduler] 🔁 Repeat: cloned post for ${nextDay}`);
              }

              // ── ALL MODE: clone to other active away communities with staggered times ──
              if (post.all_mode) {
                const { data: sxCfgAll } = await supabase.from("site_configs")
                  .select("content").eq("site_id", "smm-auto-shill").eq("section", "shill-x-config").maybeSingle();
                const allAwayCommunities = ((sxCfgAll?.content as any)?.communities || [])
                  .filter((c: any) => c.enabled && c.community_id !== post.community_id);

                if (allAwayCommunities.length > 0) {
                  const baseTime = new Date(post.scheduled_at).getTime();
                  for (let i = 0; i < allAwayCommunities.length; i++) {
                    const comm = allAwayCommunities[i];
                    // Space each community 30-50 min apart (randomized)
                    const gapMs = (30 + Math.floor(Math.random() * 21)) * 60 * 1000;
                    const staggeredTime = new Date(baseTime + gapMs * (i + 1)).toISOString();

                    // Check if there's already a scheduled post for this community today
                    const dayStart = staggeredTime.slice(0, 10) + "T00:00:00Z";
                    const dayEnd = staggeredTime.slice(0, 10) + "T23:59:59Z";
                    const { count: existing } = await supabase.from("shill_scheduled_posts")
                      .select("id", { count: "exact", head: true })
                      .eq("community_id", comm.community_id)
                      .eq("status", "scheduled")
                      .gte("scheduled_at", dayStart)
                      .lte("scheduled_at", dayEnd);

                    if ((existing ?? 0) === 0) {
                      await supabase.from("shill_scheduled_posts").insert({
                        chat_id: post.chat_id,
                        caption: post.caption,
                        video_url: post.video_url,
                        storage_path: post.storage_path,
                        community_id: comm.community_id,
                        x_account: post.x_account,
                        scheduled_at: staggeredTime,
                        status: "scheduled",
                        repeat_daily: post.repeat_daily || false,
                        all_mode: false, // cloned posts don't cascade all_mode
                      });
                      console.log(`[shill-scheduler] 🌐 ALL MODE: cloned to ${comm.community_name} at ${staggeredTime}`);
                    }
                  }
                }
              }
            }

            // Notify via Telegram
            if (post.chat_id && TG_TOKEN) {
              const statusIcon = statusLabel === "failed" ? "❌" : "✅";
              let msg = `${statusIcon} <b>Scheduled post ${statusLabel === "failed" ? "failed" : "published"}!</b>\n\n📝 "${post.caption}"\n👤 via @${accountToUse}`;
              if (postUrl) msg += `\n\n🔗 <a href="${postUrl}">View Post on X</a>`;
              await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: post.chat_id,
                  text: msg,
                  parse_mode: "HTML",
                  disable_web_page_preview: false,
                }),
              });
            }

            processed++;
          }
        }

        // If we exhausted all accounts without success
        if (!postSuccess) {
          await supabase.from("shill_scheduled_posts").update({
            status: "failed",
            error: lastErrMsg,
          }).eq("id", post.id);

          if (post.chat_id && TG_TOKEN) {
            await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: post.chat_id,
                text: `❌ Scheduled shill failed:\n"${post.caption}"\n\nError: ${lastErrMsg}`,
              }),
            });
          }
        }
      } catch (err: any) {
        console.error(`[shill-scheduler] error processing ${post.id}:`, err.message);
        await supabase.from("shill_scheduled_posts").update({
          status: "failed",
          error: err.message,
        }).eq("id", post.id);
      }
    }

    return json({ ok: true, processed });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
