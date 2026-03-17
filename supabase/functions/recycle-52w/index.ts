import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json();
    const { action } = body;

    // ─── ENQUEUE: create a bot_task and return immediately ───
    if (action === 'enqueue') {
      const { plan_id, push_live, profile_username, platform, plan_name, brand_context, items } = body;

      if (!plan_id || !items?.length) {
        return new Response(JSON.stringify({ error: 'plan_id and items required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: task, error: taskErr } = await supabase.from('bot_tasks').insert({
        title: `♻️ Recycle 52w — ${plan_name || platform}`,
        description: `Recycling ${items.length} posts × 51 weeks for ${profile_username} on ${platform}`,
        bot_agent: 'social_media',
        priority: 'high',
        status: 'queued',
        meta: {
          type: 'recycle-52w',
          plan_id,
          push_live: !!push_live,
          profile_username,
          platform,
          plan_name,
          brand_context,
          items,
          progress: { current_week: 0, total_weeks: 51, posts_scheduled: 0, cal_events: 0 },
        },
      }).select('id').single();

      if (taskErr) throw taskErr;

      // Kick off processing in the background by calling ourselves
      // Use fetch with no await so we return immediately
      const processUrl = `${SUPABASE_URL}/functions/v1/recycle-52w`;
      fetch(processUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify({ action: 'process', task_id: task.id }),
      }).catch(e => console.error('[recycle-52w] Background kick failed:', e));

      return new Response(JSON.stringify({ task_id: task.id, status: 'queued' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── STATUS: check progress ───
    if (action === 'status') {
      const { task_id } = body;
      const { data, error } = await supabase.from('bot_tasks').select('id, status, meta').eq('id', task_id).single();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── PROCESS: do the actual work (called in background) ───
    if (action === 'process') {
      const { task_id } = body;
      const { data: task, error: fetchErr } = await supabase.from('bot_tasks')
        .select('id, status, meta')
        .eq('id', task_id)
        .single();

      if (fetchErr || !task) {
        return new Response(JSON.stringify({ error: 'Task not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Prevent double-processing
      if (task.status !== 'queued') {
        return new Response(JSON.stringify({ status: task.status, message: 'Already processing or done' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Mark as in-progress
      await supabase.from('bot_tasks').update({
        status: 'in_progress',
        meta: { ...(task.meta as any), progress: { ...(task.meta as any).progress, current_week: 0 } },
      } as any).eq('id', task_id);

      const meta = task.meta as any;
      const { plan_id, push_live, profile_username, platform, plan_name, brand_context, items } = meta;
      const CAMPAIGN_START = '2026-03-17';
      const apiPlatform = platform === 'twitter' ? 'x' : platform;
      const tz = 'America/New_York';

      let totalScheduled = 0;
      let totalCalEvents = 0;
      let dayOffset = items.length; // skip original week

      const BATCH_SIZE = 3; // smaller batches for edge function reliability

      for (let batchStart = 1; batchStart <= 51; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, 51);

        for (let week = batchStart; week <= batchEnd; week++) {
          try {
            // AI caption variation
            let variations: any[] = [];
            try {
              const { data: varData } = await supabase.functions.invoke('recycle-captions', {
                body: {
                  items: items.map((item: any) => ({
                    id: item.id, caption: item.caption, hashtags: item.hashtags, type: item.type,
                  })),
                  week_number: week,
                  total_weeks: 52,
                  platform: apiPlatform,
                  brand_context,
                },
              });
              if (varData?.variations) variations = varData.variations;
            } catch (aiErr) {
              console.warn(`[recycle-52w] AI caption gen failed week ${week}:`, aiErr);
            }

            const calendarEvents: any[] = [];

            for (const item of items) {
              const targetDate = new Date(`${CAMPAIGN_START}T12:00:00`);
              targetDate.setDate(targetDate.getDate() + dayOffset);
              const yyyy = targetDate.getFullYear();
              const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
              const dd = String(targetDate.getDate()).padStart(2, '0');
              const timePart = item.time || '12:00';
              const scheduledDate = `${yyyy}-${mm}-${dd}T${timePart}:00`;

              dayOffset++;

              const variation = variations.find((v: any) => v.id === item.id);
              const caption = variation?.caption || item.caption;
              const hashtags = variation?.hashtags || item.hashtags || [];
              const hashtagStr = hashtags
                .map((h: string) => h.startsWith('#') ? h : `#${h}`)
                .filter((h: string) => h.length > 1)
                .join(' ');

              // Push live via smm-api
              if (push_live && (item.type === 'text' || item.media_url)) {
                try {
                  const postTitle = caption
                    ? `${caption}${hashtagStr ? '\n\n' + hashtagStr : ''}`
                    : hashtagStr || item.type;

                  const isActualVideo = item.media_url && (
                    item.media_url.endsWith('.mp4') || item.media_url.endsWith('.mov') ||
                    item.media_url.endsWith('.webm') || item.media_url.includes('higgsfield')
                  );
                  let postType = 'text';
                  if (item.type === 'video' && isActualVideo) postType = 'video';
                  else if (['video', 'image', 'carousel'].includes(item.type)) postType = 'photos';

                  const uploadAction = postType === 'video' ? 'upload-video'
                    : postType === 'photos' ? 'upload-photos'
                    : 'upload-text';

                  const formBody: Record<string, any> = {
                    user: profile_username,
                    title: postTitle,
                    'platform[]': [apiPlatform],
                    scheduled_date: scheduledDate,
                    timezone: tz,
                  };
                  if (item.media_url) {
                    if (postType === 'video') formBody.video = item.media_url;
                    else if (postType === 'photos') formBody['photos[]'] = [item.media_url];
                  }

                  const smmUrl = `${SUPABASE_URL}/functions/v1/smm-api?action=${uploadAction}`;
                  const smmRes = await fetch(smmUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${ANON_KEY}`,
                      'apikey': ANON_KEY,
                    },
                    body: JSON.stringify(formBody),
                  });
                  if (smmRes.ok) totalScheduled++;
                  else console.warn(`[recycle-52w] Push-live failed week ${week}:`, await smmRes.text());

                  // Throttle to respect rate limits
                  await new Promise(r => setTimeout(r, 8000));
                } catch (pushErr) {
                  console.warn(`[recycle-52w] Push-live error week ${week}:`, pushErr);
                }
              }

              // Sanitize for Postgres
              const sanitize = (s: string) => {
                try {
                  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
                } catch {
                  return s.replace(/[^\x20-\x7E\n\r\t]/g, '');
                }
              };

              calendarEvents.push({
                title: sanitize(`♻️ [${platform.toUpperCase()}] ${(caption || item.type).substring(0, 50)}`),
                description: sanitize(
                  `Recycled from "${plan_name}" (Week ${week + 1}/52)\nProfile: ${profile_username}\nType: ${item.type}${item.media_url ? `\nMedia URL: ${item.media_url}` : ''}\n\n${caption || ''}`
                ),
                start_time: scheduledDate,
                end_time: (() => {
                  const e = new Date(new Date(scheduledDate).getTime() + 30 * 60000);
                  return `${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,'0')}-${String(e.getDate()).padStart(2,'0')}T${String(e.getHours()).padStart(2,'0')}:${String(e.getMinutes()).padStart(2,'0')}:00`;
                })(),
                source: 'smm',
                source_id: `recycle-w${week}-${item.id}`,
                category: 'smm',
                color: platform === 'instagram' ? '#E1306C' :
                       platform === 'facebook' ? '#1877F2' :
                       platform === 'tiktok' ? '#010101' :
                       platform === 'x' ? '#1DA1F2' : '#3b82f6',
              });
            }

            // Insert calendar events
            if (calendarEvents.length > 0) {
              const sourceIds = calendarEvents.map((e: any) => e.source_id).filter(Boolean);
              if (sourceIds.length > 0) {
                await supabase.from('calendar_events').delete().in('source_id', sourceIds);
              }
              const { error: calErr } = await supabase.from('calendar_events').insert(calendarEvents);
              if (calErr) console.error(`[recycle-52w] Calendar insert error week ${week}:`, calErr);
              else totalCalEvents += calendarEvents.length;
            }
          } catch (weekErr) {
            console.warn(`[recycle-52w] Week ${week} processing error:`, weekErr);
          }

          // Update progress
          await supabase.from('bot_tasks').update({
            meta: {
              ...meta,
              progress: { current_week: week, total_weeks: 51, posts_scheduled: totalScheduled, cal_events: totalCalEvents },
            },
          } as any).eq('id', task_id);
        }
      }

      // Mark complete
      await supabase.from('bot_tasks').update({
        status: 'completed',
        meta: {
          ...meta,
          progress: { current_week: 51, total_weeks: 51, posts_scheduled: totalScheduled, cal_events: totalCalEvents },
        },
      } as any).eq('id', task_id);

      // If push_live, reset the plan
      if (push_live && plan_id) {
        await supabase.from('smm_content_plans').update({
          status: 'draft',
          schedule_items: [],
        } as any).eq('id', plan_id);
      }

      return new Response(JSON.stringify({
        status: 'completed',
        posts_scheduled: totalScheduled,
        cal_events: totalCalEvents,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use enqueue, status, or process.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: any) {
    console.error('[recycle-52w] Error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
