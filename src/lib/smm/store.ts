import { useState, useCallback } from 'react';
import type { SMMProfile, ScheduledPost, QueueSettings, AnalyticsData, IGMedia, IGComment, IGConversation, IGMessage, WebhookEvent, PostStatus, Platform, PostType } from './types';
import { supabase } from '@/integrations/supabase/client';

const UPLOAD_ACTIONS = new Set(['upload-video', 'upload-photos', 'upload-document', 'upload-text']);
const UPLOAD_MIN_INTERVAL_MS = 8000;
const UPLOAD_RETRY_BUFFER_MS = 2000;
let lastUploadRequestAt = 0;
let uploadCooldownUntil = 0;
let uploadQueue: Promise<void> = Promise.resolve();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function extractRetryAfterSeconds(source: unknown): number | null {
  if (!source) return null;

  if (typeof source === 'number' && Number.isFinite(source) && source > 0) {
    return source;
  }

  if (typeof source === 'string') {
    const retryMatch = source.match(/"retry_after_seconds"\s*:\s*(\d+)/i) || source.match(/retry[_\s-]?after[_\s-]?seconds\s*[:=]\s*(\d+)/i);
    if (retryMatch) {
      const seconds = Number(retryMatch[1]);
      if (Number.isFinite(seconds) && seconds > 0) return seconds;
    }

    try {
      return extractRetryAfterSeconds(JSON.parse(source));
    } catch {
      return null;
    }
  }

  if (typeof source === 'object') {
    const retryAfter = (source as { retry_after_seconds?: unknown }).retry_after_seconds;
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }

  return null;
}

function parseRetryAfterMs(payload: any, attempt: number, errorMessage?: string): number {
  const seconds = extractRetryAfterSeconds(payload) ?? extractRetryAfterSeconds(errorMessage);
  if (Number.isFinite(seconds) && seconds > 0) {
    return (seconds * 1000) + UPLOAD_RETRY_BUFFER_MS;
  }

  const base = Math.min(30000, 1000 * Math.pow(2, attempt));
  return base + Math.floor(Math.random() * 1000);
}

async function withUploadThrottle<T>(action: string, run: () => Promise<T>): Promise<T> {
  if (!UPLOAD_ACTIONS.has(action)) return run();

  const execute = async () => {
    const now = Date.now();
    const cooldownWaitMs = Math.max(0, uploadCooldownUntil - now);
    if (cooldownWaitMs > 0) await sleep(cooldownWaitMs);

    const afterCooldown = Date.now();
    const intervalWaitMs = Math.max(0, UPLOAD_MIN_INTERVAL_MS - (afterCooldown - lastUploadRequestAt));
    if (intervalWaitMs > 0) await sleep(intervalWaitMs);

    try {
      return await run();
    } finally {
      lastUploadRequestAt = Date.now();
    }
  };

  const pending = uploadQueue.then(execute, execute);
  uploadQueue = pending.then(() => undefined, () => undefined);
  return pending;
}


// Helper to build the edge function URL with query params
function buildUrl(action: string, params?: Record<string, string>) {
  const searchParams = new URLSearchParams({ action });
  if (params) Object.entries(params).forEach(([k, v]) => { if (v) searchParams.set(k, v); });
  return searchParams.toString();
}

async function invokeSMMViaHttp(action: string, queryString: string, body?: any) {
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smm-api?${queryString}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body || {}),
  });

  const responseText = await response.text();
  let payload: any = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = responseText;
  }

  if (!response.ok) {
    const errorMessage = typeof payload === 'object' && payload
      ? payload.error || payload.message || `HTTP ${response.status}`
      : String(payload || `HTTP ${response.status}`);
    const error = new Error(`${errorMessage}${typeof payload === 'object' && payload ? `, ${JSON.stringify(payload)}` : ''}`);
    (error as any).status = response.status;
    (error as any).payload = payload;
    throw error;
  }

  return payload;
}

async function invokeSMM(action: string, params?: Record<string, string>, body?: any) {
  const queryString = buildUrl(action, params);

  const call = async (attempt = 0): Promise<any> => {
    const data = UPLOAD_ACTIONS.has(action)
      ? await invokeSMMViaHttp(action, queryString, body)
      : await supabase.functions.invoke(`smm-api?${queryString}`, { body: body || undefined }).then(({ data, error }) => {
          if (error) throw new Error((data as any)?.error || error.message || 'Unknown error');
          return data;
        });

    if (data && typeof data === 'object' && data.success === false) {
      const rawError = String((data as any).error || (data as any).message || 'Unknown error');
      const suggestion: string = (data as any).suggestion || '';
      let friendlyMsg = rawError;

      if ((data as any).error_subcode === 2534022 || /fen[eê]tre autoris[eé]e|outside.*allowed.*window|messaging.*not.*available/i.test(rawError + suggestion)) {
        friendlyMsg = 'Can\'t message this user — Instagram requires them to message you first (24-hour window policy).';
      }

      throw new Error(`${friendlyMsg}${UPLOAD_ACTIONS.has(action) ? `, ${JSON.stringify(data)}` : ''}`);
    }

    return data;
  };

  const runWithRetry = async (attempt = 0): Promise<any> => {
    try {
      return await call(attempt);
    } catch (error: any) {
      if (!UPLOAD_ACTIONS.has(action)) throw error;
      if (attempt >= 2) throw error;

      const isRateLimited = error?.status === 429 || /rate_limit|too many requests|429/i.test(error?.message || '');
      if (!isRateLimited) throw error;

      const waitMs = parseRetryAfterMs(error?.payload, attempt, error?.message);
      uploadCooldownUntil = Math.max(uploadCooldownUntil, Date.now() + waitMs);
      await sleep(waitMs + Math.floor(Math.random() * 750));
      return runWithRetry(attempt + 1);
    }
  };

  return withUploadThrottle(action, () => runWithRetry(0));
}

// ─── API Service (Real Upload-Post API via Edge Function) ───
export const smmApi = {
  // ─── Profiles ───
  async getProfiles(): Promise<SMMProfile[]> {
    try {
      const data = await invokeSMM('list-profiles');
      console.log('[SMM getProfiles] raw response keys:', data ? Object.keys(data) : 'null');
      // API may return { profiles: [...] } or { users: [...] } or just [...]
      const rawProfiles = data?.profiles || data?.users || (Array.isArray(data) ? data : []);
      if (!rawProfiles.length) return [];
      console.log('[SMM getProfiles] first profile social_accounts:', JSON.stringify(rawProfiles[0]?.social_accounts));
      return rawProfiles.map((p: any) => {
        // API returns social_accounts as an object keyed by platform
        const socials = p.social_accounts || {};
        const connected_platforms = Object.entries(socials)
          .map(([platform, info]: [string, any]) => {
            // Empty string or falsy means not connected
            if (!info || info === '') return null;
            // info could be a string (handle) or an object
            const isString = typeof info === 'string';
            return {
              platform: platform === 'x' ? 'twitter' : platform,
              connected: true,
              reauth_required: isString ? false : (info.reauth_required || false),
              display_name: isString ? info : (info.display_name || info.handle || info.username || info.name || platform),
            };
          })
          .filter(Boolean) as SMMProfile['connected_platforms'];

        return {
          id: p.username,
          username: p.username,
          connected_platforms,
          last_activity: p.last_activity || p.created_at || new Date().toISOString(),
          created_at: p.created_at || new Date().toISOString(),
        };
      });
    } catch (e) {
      console.error('getProfiles error:', e);
      return [];
    }
  },

  async createProfile(username: string): Promise<SMMProfile> {
    const data = await invokeSMM('create-profile', undefined, { username });
    return {
      id: username,
      username,
      connected_platforms: [],
      last_activity: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
  },

  async deleteProfile(username: string): Promise<void> {
    await invokeSMM('delete-profile', undefined, { username });
  },

  async generateConnectJWT(username: string): Promise<{ access_url: string }> {
    const data = await invokeSMM('generate-jwt', undefined, { username });
    return { access_url: data.access_url || '' };
  },

  // ─── Posts / Uploads ───
  async getPosts(): Promise<ScheduledPost[]> {
    try {
      const [scheduled, history, calendarResult, plansResult] = await Promise.all([
        invokeSMM('list-scheduled', { limit: '100' }).catch(() => ({ scheduled_posts: [] })),
        invokeSMM('upload-history', { limit: '100' }).catch(() => ({ history: [] })),
        supabase
          .from('calendar_events')
          .select('id, title, description, start_time, source_id, created_at')
          .eq('source', 'smm')
          .order('created_at', { ascending: false }),
        supabase
          .from('smm_content_plans')
          .select('profile_username, platform, schedule_items')
          .order('created_at', { ascending: false }),
      ]);

      const posts: ScheduledPost[] = [];

      // Build plan index: maps schedule item id → { profile, platform, media_url, type }
      const planIndex = new Map<string, { profile_username: string; platform: string; media_url?: string; type?: string }>();

      for (const plan of plansResult.data || []) {
        const items = Array.isArray(plan.schedule_items) ? plan.schedule_items : [];
        for (const item of items) {
          const itemRecord = item && typeof item === 'object' && !Array.isArray(item)
            ? item as { id?: unknown; media_url?: unknown; type?: unknown }
            : null;
          const itemId = typeof itemRecord?.id === 'string' ? itemRecord.id : '';
          if (!itemId || planIndex.has(itemId)) continue;
          planIndex.set(itemId, {
            profile_username: plan.profile_username,
            platform: plan.platform,
            media_url: typeof itemRecord?.media_url === 'string' ? itemRecord.media_url : undefined,
            type: typeof itemRecord?.type === 'string' ? itemRecord.type : undefined,
          });
        }
      }

      if (scheduled?.scheduled_posts) {
        scheduled.scheduled_posts.forEach((p: any) => {
          posts.push(mapApiPostToScheduledPost(p, 'scheduled'));
        });
      }

      const historyItems = history?.history || history?.uploads || [];
      if (Array.isArray(historyItems)) {
        historyItems.forEach((p: any) => {
          if (!posts.find(ep => ep.job_id === p.job_id)) {
            posts.push(mapApiPostToScheduledPost(p, p.status || 'completed'));
          }
        });
      }

      const existingKeys = new Set(
        posts.map(post => `${post.job_id || post.id}||${post.scheduled_date || ''}||${post.platforms.join(',')}||${stripPlatformLabel(post.title)}`)
      );

      for (const event of calendarResult.data || []) {
        const calendarPost = mapCalendarEventToScheduledPost(event, planIndex);
        if (!calendarPost) continue;

        const key = `${calendarPost.job_id || calendarPost.id}||${calendarPost.scheduled_date || ''}||${calendarPost.platforms.join(',')}||${stripPlatformLabel(calendarPost.title)}`;
        if (existingKeys.has(key)) continue;

        existingKeys.add(key);
        posts.push(calendarPost);
      }

      return posts.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } catch (e) {
      console.error('getPosts error:', e);
      return [];
    }
  },

  async createPost(post: {
    user: string;
    type: PostType;
    platforms: Platform[];
    title: string;
    description?: string;
    first_comment?: string;
    platform_overrides?: Record<string, { title?: string; first_comment?: string }>;
    media_url?: string;
    scheduled_date?: string | null;
    add_to_queue?: boolean;
    timezone?: string;
  }): Promise<any> {
    const action = post.type === 'video' ? 'upload-video'
      : post.type === 'photos' ? 'upload-photos'
      : post.type === 'document' ? 'upload-document'
      : 'upload-text';

    const formBody: Record<string, any> = {
      user: post.user,
      title: post.title,
    };

    // Platforms — remap 'twitter' back to 'x' for the API
    post.platforms.forEach(p => {
      if (!formBody['platform[]']) formBody['platform[]'] = [];
      const apiPlatform = p === 'twitter' ? 'x' : p;
      if (Array.isArray(formBody['platform[]'])) formBody['platform[]'].push(apiPlatform);
    });

    if (post.description) formBody.description = post.description;
    if (post.first_comment) formBody.first_comment = post.first_comment;
    if (post.scheduled_date) formBody.scheduled_date = post.scheduled_date;
    if (post.add_to_queue) formBody.add_to_queue = true;
    if (post.timezone) formBody.timezone = post.timezone;

    // For URL-based uploads
    if (post.media_url) {
      if (post.type === 'video') formBody.video = post.media_url;
      else if (post.type === 'document') formBody.document = post.media_url;
      else if (post.type === 'photos') {
        formBody['photos[]'] = [post.media_url];
      }
    }

    // Platform-specific overrides
    if (post.platform_overrides) {
      Object.entries(post.platform_overrides).forEach(([platform, overrides]) => {
        if (overrides.title) formBody[`${platform}_title`] = overrides.title;
        if (overrides.first_comment) formBody[`${platform}_first_comment`] = overrides.first_comment;
      });
    }

    // Always use async for immediate uploads
    if (!post.scheduled_date && !post.add_to_queue) {
      formBody.async_upload = true;
    }

    const data = await invokeSMM(action, undefined, formBody);

    // Create bot_task so social-media agent shows activity on AI Staff page
    try {
      const taskTitle = `📱 ${post.title.substring(0, 60)}${post.title.length > 60 ? '...' : ''}`;
      const platformNames = post.platforms.map(p => p === 'twitter' ? 'x' : p);
      await supabase.from('bot_tasks').insert({
        title: taskTitle,
        description: post.description || post.title,
        bot_agent: 'social-media',
        priority: 'medium',
        status: post.scheduled_date ? 'queued' : post.add_to_queue ? 'queued' : 'completed',
        meta: {
          type: post.type,
          platforms: platformNames,
          user: post.user,
          scheduled: !!post.scheduled_date,
          queued: !!post.add_to_queue,
          request_id: data?.request_id,
          job_id: data?.job_id,
          source: 'dashboard-composer',
        },
      });
    } catch (e) {
      console.warn('[smm] bot_task creation failed:', e);
    }

    return data;
  },

  async cancelPost(jobId: string): Promise<void> {
    await invokeSMM('cancel-scheduled', { job_id: jobId });
  },

  async editPost(jobId: string, changes: { scheduled_date?: string; title?: string; caption?: string }): Promise<any> {
    const data = await invokeSMM('edit-scheduled', { job_id: jobId }, changes);
    return data;
  },

  async getPostStatus(opts: { request_id?: string; job_id?: string }): Promise<any> {
    const params: Record<string, string> = {};
    if (opts.request_id) params.request_id = opts.request_id;
    if (opts.job_id) params.job_id = opts.job_id;
    const data = await invokeSMM('upload-status', params);
    return data;
  },

  // ─── Queue ───
  async getQueueSettings(profileUsername: string): Promise<QueueSettings | null> {
    try {
      const data = await invokeSMM('queue-settings', { profile: profileUsername });
      if (!data) return null;
      return {
        profile_id: profileUsername,
        timezone: data.timezone || 'UTC',
        slots: (data.slots || []).map((s: any) => ({ day: s.day, time: s.time })),
      };
    } catch {
      return null;
    }
  },

  async saveQueueSettings(settings: QueueSettings): Promise<void> {
    await invokeSMM('update-queue-settings', undefined, {
      profile: settings.profile_id,
      timezone: settings.timezone,
      slots: settings.slots,
    });
  },

  async getQueuePreview(profileUsername: string): Promise<any[]> {
    try {
      const data = await invokeSMM('queue-preview', { profile: profileUsername });
      return data?.preview || [];
    } catch {
      return [];
    }
  },

  // ─── Analytics ───
  async getAnalytics(profileUsername: string, platforms?: string): Promise<AnalyticsData[]> {
    try {
      const data = await invokeSMM('analytics', {
        profile_username: profileUsername,
        platforms: platforms || 'instagram,tiktok,facebook,linkedin,youtube,x',
      });
      if (!data) return [];
      // The API returns platform-keyed data
      const result: AnalyticsData[] = [];
      Object.entries(data).forEach(([rawPlatform, metrics]: [string, any]) => {
        if (rawPlatform === 'success' || rawPlatform === 'error') return;
        if (metrics?.success === false) return; // skip platforms with errors
        const platform = rawPlatform === 'x' ? 'twitter' : rawPlatform;
        result.push({
          profile_id: profileUsername,
          platform: platform as Platform,
          followers: metrics.followers || 0,
          impressions: metrics.impressions || 0,
          reach: metrics.reach || 0,
          likes: metrics.likes || metrics.engagement?.likes || 0,
          comments: metrics.comments || metrics.engagement?.comments || 0,
          shares: metrics.shares || metrics.engagement?.shares || 0,
          saves: metrics.saves || 0,
          series: (metrics.time_series || metrics.reach_timeseries || []).map((s: any) => ({
            date: s.date || s.end_time || '',
            impressions: s.impressions || s.value || 0,
            reach: s.reach || s.value || 0,
            engagement: s.engagement || 0,
          })),
        });
      });
      return result;
    } catch (e) {
      console.error('getAnalytics error:', e);
      return [];
    }
  },

  // ─── Platform Resources ───
  async getFacebookPages(profile?: string): Promise<any[]> {
    try {
      const data = await invokeSMM('facebook-pages', profile ? { profile } : undefined);
      return data?.pages || [];
    } catch { return []; }
  },

  async getLinkedInPages(profile?: string): Promise<any[]> {
    try {
      const data = await invokeSMM('linkedin-pages', profile ? { profile } : undefined);
      return data?.pages || [];
    } catch { return []; }
  },

  async getPinterestBoards(profile?: string): Promise<any[]> {
    try {
      const data = await invokeSMM('pinterest-boards', profile ? { profile } : undefined);
      return data?.boards || [];
    } catch { return []; }
  },

  // ─── Instagram ───
  async getIGMedia(user: string): Promise<IGMedia[]> {
    try {
      const data = await invokeSMM('ig-media', { user });
      if (!data?.media) return [];
      return data.media.map((m: any) => ({
        id: m.id,
        media_url: m.thumbnail_url || m.media_url || '',
        permalink: m.permalink || '',
        media_type: m.media_type || 'IMAGE',
        caption: m.caption || '',
        timestamp: m.timestamp || '',
        like_count: m.like_count || 0,
        comments_count: m.comments_count || 0,
      }));
    } catch (e) {
      console.error('getIGMedia error:', e);
      return [];
    }
  },

  async getIGComments(user: string, postId: string): Promise<IGComment[]> {
    try {
      const data = await invokeSMM('ig-comments', { user, post_id: postId });
      if (!data?.comments) return [];
      return data.comments.map((c: any) => ({
        id: c.id,
        media_id: postId,
        username: c.user?.username || 'unknown',
        text: c.text || '',
        timestamp: c.timestamp || '',
      }));
    } catch (e) {
      console.error('getIGComments error:', e);
      return [];
    }
  },

  async getIGConversations(user: string): Promise<IGConversation[]> {
    try {
      const data = await invokeSMM('ig-conversations', { user });
      if (!data?.conversations) return [];

      // We need the IG handle to distinguish self from others.
      // First try to get it from the profiles we already fetched.
      let selfHandle = '';
      try {
        const profiles = await this.getProfiles();
        const profile = profiles.find(p => p.username === user);
        const igAccount = profile?.connected_platforms.find(cp => cp.platform === 'instagram');
        selfHandle = (igAccount?.display_name || '').toLowerCase();
      } catch { /* ignore */ }

      return data.conversations.map((c: any, idx: number) => {
        const participants = c.participants?.data || [];
        // Find the OTHER participant (not self)
        const otherUser = participants.find((p: any) =>
          p.username.toLowerCase() !== selfHandle
        ) || participants.find((p: any) =>
          p.username.toLowerCase() !== user.toLowerCase()
        ) || participants[1] || participants[0];

        const messages = c.messages?.data || [];
        const lastMsg = messages[0];

        // Extract attachment URL from shared posts/videos/stories
        const extractAttachmentUrl = (m: any): string => {
          // Instagram shares come as attachments.data[].url or story replies
          const att = m.attachments?.data?.[0];
          if (att?.url) return att.url;
          if (att?.video_data?.url) return att.video_data.url;
          if (att?.image_data?.url) return att.image_data.url;
          // Shared post links sometimes in shares.data
          const share = m.shares?.data?.[0];
          if (share?.link) return share.link;
          // Story replies
          if (m.story?.url) return m.story.url;
          return '';
        };

        const lastAttachment = lastMsg ? extractAttachmentUrl(lastMsg) : '';

        return {
          id: c.id || otherUser?.id || `conv-${idx}`,
          participant: otherUser?.username || 'Unknown',
          participant_id: otherUser?.id || '',
          last_message: lastMsg?.message || (lastAttachment ? '🔗 Shared link' : ''),
          last_timestamp: lastMsg?.created_time || '',
          unread: c.unread || false,
          messages: messages.map((m: any) => ({
            id: m.id,
            from: m.from?.username || '',
            text: m.message || '',
            timestamp: m.created_time || '',
            attachment_url: extractAttachmentUrl(m),
          })),
        };
      });
    } catch (e) {
      console.error('getIGConversations error:', e);
      return [];
    }
  },

  async sendIGDM(user: string, recipientId: string, message: string): Promise<any> {
    return invokeSMM('ig-dm-send', undefined, {
      platform: 'instagram',
      user,
      recipient_id: recipientId,
      message,
    });
  },

  async replyToIGComment(user: string, commentId: string, message: string): Promise<any> {
    return invokeSMM('ig-comment-reply', undefined, {
      platform: 'instagram',
      user,
      comment_id: commentId,
      message,
    });
  },

  // ─── Account Info ───
  async getMe(): Promise<any> {
    return invokeSMM('me');
  },

  // ─── Webhook Notifications ───
  async configureNotifications(config: { webhook_url: string; events: string[] }): Promise<any> {
    return invokeSMM('configure-notifications', undefined, config);
  },

  // ─── Next Queue Slot ───
  async getNextQueueSlot(profileUsername: string): Promise<any> {
    try {
      const data = await invokeSMM('queue-next-slot', { profile: profileUsername });
      return data;
    } catch { return null; }
  },

  // ─── Platform Resources ───
  async getProfileDetail(username: string): Promise<any> {
    try {
      return await invokeSMM('get-profile', { username });
    } catch { return null; }
  },
  // ─── Dedup: remove same-day calendar events with identical content ───
  async dedupCalendarEvents(): Promise<number> {
    try {
      // Fetch all SMM calendar events
      const { data: events, error } = await supabase
        .from('calendar_events')
        .select('id, title, description, start_time, source_id, created_at')
        .eq('source', 'smm')
        .order('created_at', { ascending: true });

      if (error || !events || events.length === 0) return 0;

      // Group by day + normalised caption to find dupes
      const seen = new Map<string, string>(); // key -> kept id
      const dupeIds: string[] = [];

      for (const ev of events) {
        const day = ev.start_time ? ev.start_time.substring(0, 10) : '';
        // Normalise: strip emojis, whitespace, case
        const normTitle = (ev.title || '').replace(/[\u{1F000}-\u{1FFFF}]/gu, '').replace(/\[.*?\]/g, '').trim().toLowerCase();
        const normDesc = (ev.description || '').replace(/Recycled from.*?\n/i, '').trim().toLowerCase().substring(0, 120);
        const key = `${day}||${normTitle}||${normDesc}`;

        if (seen.has(key)) {
          dupeIds.push(ev.id);
        } else {
          seen.set(key, ev.id);
        }
      }

      if (dupeIds.length === 0) return 0;

      // Delete in batches of 100
      for (let i = 0; i < dupeIds.length; i += 100) {
        const batch = dupeIds.slice(i, i + 100);
        await supabase.from('calendar_events').delete().in('id', batch);
      }

      console.log(`[smm dedup] Removed ${dupeIds.length} duplicate calendar events`);
      return dupeIds.length;
    } catch (e) {
      console.error('[smm dedup] error:', e);
      return 0;
    }
  },
};

// ─── Helper: Map API response to our ScheduledPost type ───
function mapApiPostToScheduledPost(p: any, defaultStatus: string): ScheduledPost {
  return {
    id: p.id || p.job_id || p.request_id || '',
    job_id: p.job_id || '',
    request_id: p.request_id || '',
    profile_id: p.user || p.profile || p.profile_username || '',
    profile_username: p.user || p.profile || p.profile_username || '',
    title: p.title || p.caption || '',
    description: p.description,
    type: p.type || p.media_type || 'text',
    platforms: (Array.isArray(p.platforms) ? p.platforms : (p.platform ? [p.platform] : []))
      .map((pl: string) => pl === 'x' ? 'twitter' : pl),
    media_url: p.media_url || p.video_url || p.photo_url,
    preview_url: p.preview_url || p.thumbnail_url,
    status: (p.status || defaultStatus) as PostStatus,
    scheduled_date: p.scheduled_date || p.scheduled_at || null,
    published_at: p.published_at || p.completed_at,
    post_urls: (p.platform_results || p.results || []).map((r: any) => ({
      platform: r.platform,
      url: r.url || r.post_url || '',
    })),
    first_comment: p.first_comment,
    error: p.error || p.error_message,
    created_at: p.created_at || p.timestamp || new Date().toISOString(),
  };
}

/** Strip [INSTAGRAM], [TIKTOK] etc. labels from titles */
function stripPlatformLabel(title: string): string {
  return title.replace(/\s*\[(INSTAGRAM|TIKTOK|FACEBOOK|LINKEDIN|PINTEREST|YOUTUBE|X|TWITTER)\]\s*/gi, ' ').trim();
}

function inferCalendarEventPlatform(title: string, sourceId: string, fallback?: string): Platform | null {
  const fromTitle = (title.match(/\[([^\]]+)\]/)?.[1] || '').trim().toLowerCase();
  const normalizedTitlePlatform = fromTitle === 'x' ? 'twitter' : fromTitle;
  const normalizedFallback = fallback === 'x' ? 'twitter' : fallback;

  if (normalizedTitlePlatform && ['instagram', 'facebook', 'tiktok', 'linkedin', 'pinterest', 'youtube', 'twitter'].includes(normalizedTitlePlatform)) {
    return normalizedTitlePlatform as Platform;
  }
  if (normalizedFallback && ['instagram', 'facebook', 'tiktok', 'linkedin', 'pinterest', 'youtube', 'twitter'].includes(normalizedFallback)) {
    return normalizedFallback as Platform;
  }
  if (sourceId.includes('-tt-')) return 'tiktok';
  if (sourceId.includes('-ig-')) return 'instagram';
  if (sourceId.includes('-fb-')) return 'facebook';
  if (sourceId.includes('-li-')) return 'linkedin';
  if (sourceId.includes('-pin-')) return 'pinterest';
  if (sourceId.includes('-yt-')) return 'youtube';
  if (sourceId.includes('-x-')) return 'twitter';
  return null;
}

function inferCalendarEventType(description?: string, planType?: string): PostType {
  if (planType === 'video') return 'video';
  if (planType === 'carousel' || planType === 'image' || planType === 'photos') return 'photos';
  if (planType === 'document') return 'document';
  const typeMatch = description?.match(/Type:\s*(video|carousel|image|text|document)/i)?.[1]?.toLowerCase();
  if (typeMatch === 'carousel' || typeMatch === 'image') return 'photos';
  if (typeMatch === 'video') return 'video';
  if (typeMatch === 'document') return 'document';
  return 'text';
}

function mapCalendarEventToScheduledPost(
  event: { id: string; title: string | null; description: string | null; start_time: string | null; source_id: string | null; created_at: string },
  planIndex: Map<string, { profile_username: string; platform: string; media_url?: string; type?: string }>
): ScheduledPost | null {
  const sourceId = event.source_id || event.id;
  const baseSourceId = sourceId.replace(/^recycle-w\d+-/, '');
  const planMeta = planIndex.get(sourceId) || planIndex.get(baseSourceId);
  const platform = inferCalendarEventPlatform(event.title || '', sourceId, planMeta?.platform);

  if (!platform || !event.start_time) return null;

  const profileUsername = planMeta?.profile_username || '';
  const cleanTitle = stripPlatformLabel(event.title || '');

  return {
    id: event.id,
    job_id: sourceId,
    request_id: '',
    profile_id: profileUsername,
    profile_username: profileUsername,
    title: cleanTitle,
    description: event.description || undefined,
    type: inferCalendarEventType(event.description || undefined, planMeta?.type),
    platforms: [platform],
    media_url: planMeta?.media_url,
    preview_url: undefined,
    status: 'scheduled',
    scheduled_date: event.start_time,
    published_at: undefined,
    post_urls: [],
    first_comment: undefined,
    error: undefined,
    created_at: event.created_at || new Date().toISOString(),
  };
}

// ─── React Hook ───
export function useSMMStore() {
  const [profiles, setProfiles] = useState<SMMProfile[]>([]);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [p, po] = await Promise.all([smmApi.getProfiles(), smmApi.getPosts()]);
      setProfiles(p);
      setPosts(po);
    } catch (e) {
      console.error('SMM refresh error:', e);
    }
    setLoading(false);
  }, []);

  return { profiles, posts, loading, refresh, setProfiles, setPosts };
}
