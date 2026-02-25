import { useState, useCallback } from 'react';
import type { SMMProfile, ScheduledPost, QueueSettings, AnalyticsData, IGMedia, IGComment, IGConversation, IGMessage, WebhookEvent, PostStatus, Platform, PostType } from './types';
import { supabase } from '@/integrations/supabase/client';

// Helper to build the edge function URL with query params
function buildUrl(action: string, params?: Record<string, string>) {
  const searchParams = new URLSearchParams({ action });
  if (params) Object.entries(params).forEach(([k, v]) => { if (v) searchParams.set(k, v); });
  return searchParams.toString();
}

async function invokeSMM(action: string, params?: Record<string, string>, body?: any) {
  const queryString = buildUrl(action, params);
  const { data, error } = await supabase.functions.invoke(`smm-api?${queryString}`, {
    body: body || undefined,
  });
  if (error) {
    // Try to extract a meaningful message from the response
    const msg = (data as any)?.error || error.message || 'Unknown error';
    throw new Error(msg);
  }
  // Also check for API-level errors in the response body
  if (data && typeof data === 'object' && data.success === false && data.error) {
    // Map known platform errors to user-friendly messages
    const rawError: string = data.error;
    const suggestion: string = data.suggestion || '';
    let friendlyMsg = rawError;

    // Instagram 24-hour messaging window policy
    if (data.error_subcode === 2534022 || /fen[eê]tre autoris[eé]e|outside.*allowed.*window|messaging.*not.*available/i.test(rawError + suggestion)) {
      friendlyMsg = 'Can\'t message this user — Instagram requires them to message you first (24-hour window policy).';
    }
    // DM daily limit
    else if (data.error_code === 429 || /daily.*limit|rate.*limit|quota/i.test(rawError)) {
      friendlyMsg = 'Daily DM limit reached. Try again tomorrow.';
    }

    throw new Error(friendlyMsg);
  }
  return data;
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
      // Get both scheduled and history
      const [scheduled, history] = await Promise.all([
        invokeSMM('list-scheduled').catch(() => ({ scheduled_posts: [] })),
        invokeSMM('upload-history', { limit: '50' }).catch(() => ({ history: [] })),
      ]);

      const posts: ScheduledPost[] = [];

      // Map scheduled posts
      if (scheduled?.scheduled_posts) {
        scheduled.scheduled_posts.forEach((p: any) => {
          posts.push(mapApiPostToScheduledPost(p, 'scheduled'));
        });
      }

      // Map history
      const historyItems = history?.history || history?.uploads || [];
      if (Array.isArray(historyItems)) {
        historyItems.forEach((p: any) => {
          // Don't duplicate if already in scheduled
          if (!posts.find(ep => ep.job_id === p.job_id)) {
            posts.push(mapApiPostToScheduledPost(p, p.status || 'completed'));
          }
        });
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
      // Photos via URL need photos[] array
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
