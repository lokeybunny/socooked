import { useState, useCallback } from 'react';
import type { SMMProfile, ScheduledPost, QueueSettings, AnalyticsData, IGMedia, IGComment, IGConversation, IGMessage, WebhookEvent, PostStatus, Platform, PostType } from './types';
import { mockProfiles, mockPosts, mockQueueSettings, mockAnalytics, mockIGMedia, mockIGComments, mockIGConversations, mockIGMessages, mockWebhookEvents } from './mock-data';

// Simulated async delay
const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

let _posts = [...mockPosts];
let _profiles = [...mockProfiles];
let _queueSettings = [...mockQueueSettings];
let _webhooks = [...mockWebhookEvents];
let _igMessages = [...mockIGMessages];
let _idCounter = 100;
const uid = () => `smm_${++_idCounter}`;

// ─── Mock API Service ───
export const smmApi = {
  // Profiles
  async getProfiles(): Promise<SMMProfile[]> { await delay(); return [..._profiles]; },
  async createProfile(username: string): Promise<SMMProfile> {
    await delay();
    const p: SMMProfile = { id: uid(), username, connected_platforms: [], last_activity: new Date().toISOString(), created_at: new Date().toISOString() };
    _profiles = [p, ..._profiles];
    return p;
  },

  // Posts
  async getPosts(): Promise<ScheduledPost[]> { await delay(); return [..._posts]; },
  async createPost(post: Partial<ScheduledPost>): Promise<ScheduledPost> {
    await delay(600);
    const id = uid();
    const full: ScheduledPost = {
      id, job_id: `job_${id}`, request_id: `req_${id}`,
      profile_id: post.profile_id || 'p1', profile_username: post.profile_username || '',
      title: post.title || '', description: post.description, type: post.type || 'text',
      platforms: post.platforms || [], status: post.status || 'pending',
      scheduled_date: post.scheduled_date || null, post_urls: [], first_comment: post.first_comment,
      platform_overrides: post.platform_overrides, created_at: new Date().toISOString(),
    };
    if (full.scheduled_date) full.status = 'scheduled';
    _posts = [full, ..._posts];
    // Simulate async completion for non-scheduled
    if (full.status === 'pending') {
      setTimeout(() => {
        const idx = _posts.findIndex(p => p.id === full.id);
        if (idx >= 0) { _posts[idx] = { ..._posts[idx], status: 'in_progress' }; }
        setTimeout(() => {
          const idx2 = _posts.findIndex(p => p.id === full.id);
          if (idx2 >= 0) { _posts[idx2] = { ..._posts[idx2], status: 'completed', published_at: new Date().toISOString(), post_urls: full.platforms.map(pl => ({ platform: pl, url: `https://${pl}.com/post/mock_${full.id}` })) }; }
        }, 3000);
      }, 2000);
    }
    return full;
  },
  async updatePost(id: string, changes: Partial<ScheduledPost>): Promise<ScheduledPost> {
    await delay();
    const idx = _posts.findIndex(p => p.id === id);
    if (idx >= 0) _posts[idx] = { ..._posts[idx], ...changes };
    return _posts[idx];
  },
  async cancelPost(id: string): Promise<void> {
    await delay();
    const idx = _posts.findIndex(p => p.id === id);
    if (idx >= 0) _posts[idx] = { ..._posts[idx], status: 'cancelled' };
  },
  async getPostByJobId(jobId: string): Promise<ScheduledPost | null> {
    await delay();
    return _posts.find(p => p.job_id === jobId || p.request_id === jobId) || null;
  },

  // Queue
  async getQueueSettings(profileId: string): Promise<QueueSettings | null> { await delay(); return _queueSettings.find(q => q.profile_id === profileId) || null; },
  async saveQueueSettings(settings: QueueSettings): Promise<void> {
    await delay();
    const idx = _queueSettings.findIndex(q => q.profile_id === settings.profile_id);
    if (idx >= 0) _queueSettings[idx] = settings; else _queueSettings.push(settings);
  },

  // Analytics
  async getAnalytics(profileId: string): Promise<AnalyticsData[]> { await delay(); return mockAnalytics.filter(a => a.profile_id === profileId); },

  // Instagram
  async getIGMedia(): Promise<IGMedia[]> { await delay(); return [...mockIGMedia]; },
  async getIGComments(mediaId: string): Promise<IGComment[]> { await delay(); return mockIGComments.filter(c => c.media_id === mediaId); },
  async getIGConversations(): Promise<IGConversation[]> { await delay(); return [...mockIGConversations]; },
  async getIGMessages(conversationId: string): Promise<IGMessage[]> { await delay(); return _igMessages.filter(m => m.conversation_id === conversationId); },
  async sendIGMessage(conversationId: string, text: string): Promise<IGMessage> {
    await delay();
    const msg: IGMessage = { id: uid(), conversation_id: conversationId, from: 'me', text, timestamp: new Date().toISOString() };
    _igMessages = [..._igMessages, msg];
    return msg;
  },

  // Webhooks
  async getWebhookEvents(): Promise<WebhookEvent[]> { await delay(200); return [..._webhooks]; },
};

// ─── React Hook ───
export function useSMMStore() {
  const [profiles, setProfiles] = useState<SMMProfile[]>([]);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [p, po] = await Promise.all([smmApi.getProfiles(), smmApi.getPosts()]);
    setProfiles(p);
    setPosts(po);
    setLoading(false);
  }, []);

  return { profiles, posts, loading, refresh, setProfiles, setPosts };
}
