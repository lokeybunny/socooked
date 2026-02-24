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
  if (error) throw error;
  return data;
}

// ─── API Service (Real Upload-Post API via Edge Function) ───
export const smmApi = {
  // ─── Profiles ───
  async getProfiles(): Promise<SMMProfile[]> {
    try {
      const data = await invokeSMM('list-profiles');
      if (!data?.profiles) return [];
      return data.profiles.map((p: any) => {
        // API returns social_accounts as an object keyed by platform
        const socials = p.social_accounts || {};
        const connected_platforms = Object.entries(socials)
          .map(([platform, info]: [string, any]) => {
            // Empty string or falsy means not connected
            if (!info || info === '') return null;
            return {
              platform: platform === 'x' ? 'twitter' : platform,
              connected: true,
              reauth_required: info.reauth_required || false,
              display_name: info.display_name || info.handle || platform,
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
        invokeSMM('upload-history', { limit: '50' }).catch(() => ({ uploads: [] })),
      ]);

      const posts: ScheduledPost[] = [];

      // Map scheduled posts
      if (scheduled?.scheduled_posts) {
        scheduled.scheduled_posts.forEach((p: any) => {
          posts.push(mapApiPostToScheduledPost(p, 'scheduled'));
        });
      }

      // Map history
      if (history?.uploads) {
        history.uploads.forEach((p: any) => {
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

    // Platforms
    post.platforms.forEach(p => {
      if (!formBody['platform[]']) formBody['platform[]'] = [];
      if (Array.isArray(formBody['platform[]'])) formBody['platform[]'].push(p);
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
        platforms: platforms || 'instagram,tiktok,facebook,linkedin,youtube',
      });
      if (!data) return [];
      // The API returns platform-keyed data
      const result: AnalyticsData[] = [];
      Object.entries(data).forEach(([platform, metrics]: [string, any]) => {
        if (platform === 'success' || platform === 'error') return;
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
          series: (metrics.time_series || []).map((s: any) => ({
            date: s.date || s.end_time || '',
            impressions: s.impressions || s.value || 0,
            reach: s.reach || 0,
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
        media_url: m.thumbnail_url || m.permalink || '',
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
      return data.conversations.map((c: any) => ({
        id: c.id,
        participant: c.participant || c.name || 'Unknown',
        last_message: c.last_message || '',
        last_timestamp: c.last_timestamp || '',
        unread: c.unread || false,
      }));
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
};

// ─── Helper: Map API response to our ScheduledPost type ───
function mapApiPostToScheduledPost(p: any, defaultStatus: string): ScheduledPost {
  return {
    id: p.id || p.job_id || p.request_id || '',
    job_id: p.job_id || '',
    request_id: p.request_id || '',
    profile_id: p.user || p.profile || '',
    profile_username: p.user || p.profile || '',
    title: p.title || p.caption || '',
    description: p.description,
    type: p.type || p.media_type || 'text',
    platforms: Array.isArray(p.platforms) ? p.platforms : (p.platform ? [p.platform] : []),
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
