import type { SMMProfile, ScheduledPost, QueueSettings, QueuePreviewSlot, AnalyticsData, IGMedia, IGComment, IGConversation, IGMessage, WebhookEvent } from './types';

const now = new Date();
const d = (offset: number) => new Date(now.getTime() + offset * 3600000).toISOString();

export const mockProfiles: SMMProfile[] = [
  {
    id: 'p1', username: 'acme_brand', last_activity: d(-2), created_at: d(-720),
    connected_platforms: [
      { platform: 'instagram', connected: true, reauth_required: false, display_name: '@acme_brand' },
      { platform: 'facebook', connected: true, reauth_required: false, display_name: 'Acme Brand Page' },
      { platform: 'tiktok', connected: true, reauth_required: true, display_name: '@acme_brand' },
      { platform: 'linkedin', connected: false, reauth_required: false, display_name: '' },
    ],
  },
  {
    id: 'p2', username: 'jane_fitness', last_activity: d(-5), created_at: d(-480),
    connected_platforms: [
      { platform: 'instagram', connected: true, reauth_required: false, display_name: '@jane_fitness' },
      { platform: 'youtube', connected: true, reauth_required: false, display_name: 'Jane Fitness' },
      { platform: 'tiktok', connected: true, reauth_required: false, display_name: '@janefitness' },
    ],
  },
  {
    id: 'p3', username: 'urban_eats', last_activity: d(-12), created_at: d(-240),
    connected_platforms: [
      { platform: 'instagram', connected: true, reauth_required: false, display_name: '@urban_eats' },
      { platform: 'facebook', connected: true, reauth_required: true, display_name: 'Urban Eats' },
    ],
  },
];

export const mockPosts: ScheduledPost[] = [
  { id: 's1', job_id: 'job_001', request_id: 'req_001', profile_id: 'p1', profile_username: 'acme_brand', title: 'New product launch 🚀', type: 'photos', platforms: ['instagram', 'facebook'], status: 'scheduled', scheduled_date: d(2), post_urls: [], created_at: d(-1) },
  { id: 's2', job_id: 'job_002', request_id: 'req_002', profile_id: 'p1', profile_username: 'acme_brand', title: 'Behind the scenes video', type: 'video', platforms: ['tiktok', 'instagram'], status: 'scheduled', scheduled_date: d(6), post_urls: [], created_at: d(-3) },
  { id: 's3', job_id: 'job_003', request_id: 'req_003', profile_id: 'p2', profile_username: 'jane_fitness', title: 'Morning routine tips', type: 'video', platforms: ['youtube', 'tiktok'], status: 'completed', scheduled_date: null, published_at: d(-4), post_urls: [{ platform: 'youtube', url: 'https://youtube.com/watch?v=mock' }, { platform: 'tiktok', url: 'https://tiktok.com/@janefitness/mock' }], created_at: d(-5) },
  { id: 's4', job_id: 'job_004', request_id: 'req_004', profile_id: 'p2', profile_username: 'jane_fitness', title: 'Meal prep Monday', type: 'photos', platforms: ['instagram'], status: 'failed', scheduled_date: null, error: 'Media upload timeout', post_urls: [], created_at: d(-8) },
  { id: 's5', job_id: 'job_005', request_id: 'req_005', profile_id: 'p3', profile_username: 'urban_eats', title: 'Weekend specials menu', type: 'text', platforms: ['facebook', 'instagram'], status: 'queued', scheduled_date: d(24), post_urls: [], created_at: d(-1) },
  { id: 's6', job_id: 'job_006', request_id: 'req_006', profile_id: 'p1', profile_username: 'acme_brand', title: 'Q4 wrap-up LinkedIn article', type: 'document', platforms: ['linkedin'], status: 'completed', scheduled_date: null, published_at: d(-48), post_urls: [{ platform: 'linkedin', url: 'https://linkedin.com/posts/mock' }], created_at: d(-50) },
  { id: 's7', job_id: 'job_007', request_id: 'req_007', profile_id: 'p3', profile_username: 'urban_eats', title: 'New chef introduction', type: 'video', platforms: ['instagram'], status: 'in_progress', scheduled_date: null, post_urls: [], created_at: d(0) },
  { id: 's8', job_id: 'job_008', request_id: 'req_008', profile_id: 'p1', profile_username: 'acme_brand', title: 'Flash sale announcement', type: 'photos', platforms: ['instagram', 'facebook', 'tiktok'], status: 'scheduled', scheduled_date: d(4), post_urls: [], created_at: d(-0.5) },
];

export const mockQueueSettings: QueueSettings[] = [
  { profile_id: 'p1', timezone: 'America/New_York', slots: [{ day: 1, time: '09:00' }, { day: 1, time: '14:00' }, { day: 3, time: '10:00' }, { day: 3, time: '16:00' }, { day: 5, time: '12:00' }] },
  { profile_id: 'p2', timezone: 'America/Los_Angeles', slots: [{ day: 0, time: '08:00' }, { day: 2, time: '11:00' }, { day: 4, time: '15:00' }, { day: 6, time: '09:00' }] },
  { profile_id: 'p3', timezone: 'America/Chicago', slots: [{ day: 1, time: '11:00' }, { day: 4, time: '13:00' }] },
];

export const mockAnalytics: AnalyticsData[] = [
  { profile_id: 'p1', platform: 'instagram', followers: 12400, impressions: 45200, reach: 31800, likes: 3200, comments: 410, shares: 890, saves: 1200,
    series: Array.from({ length: 14 }, (_, i) => ({ date: new Date(now.getTime() - (13 - i) * 86400000).toISOString().slice(0, 10), impressions: 2800 + Math.floor(Math.random() * 1200), reach: 2000 + Math.floor(Math.random() * 800), engagement: 200 + Math.floor(Math.random() * 150) })) },
  { profile_id: 'p1', platform: 'facebook', followers: 8900, impressions: 22100, reach: 18400, likes: 1800, comments: 220, shares: 560, saves: 340,
    series: Array.from({ length: 14 }, (_, i) => ({ date: new Date(now.getTime() - (13 - i) * 86400000).toISOString().slice(0, 10), impressions: 1400 + Math.floor(Math.random() * 600), reach: 1100 + Math.floor(Math.random() * 400), engagement: 100 + Math.floor(Math.random() * 80) })) },
  { profile_id: 'p2', platform: 'instagram', followers: 34200, impressions: 98500, reach: 67300, likes: 8900, comments: 1200, shares: 2100, saves: 4500,
    series: Array.from({ length: 14 }, (_, i) => ({ date: new Date(now.getTime() - (13 - i) * 86400000).toISOString().slice(0, 10), impressions: 6000 + Math.floor(Math.random() * 2000), reach: 4000 + Math.floor(Math.random() * 1500), engagement: 500 + Math.floor(Math.random() * 300) })) },
  { profile_id: 'p2', platform: 'tiktok', followers: 52100, impressions: 210000, reach: 180000, likes: 24000, comments: 3200, shares: 8100, saves: 6700,
    series: Array.from({ length: 14 }, (_, i) => ({ date: new Date(now.getTime() - (13 - i) * 86400000).toISOString().slice(0, 10), impressions: 12000 + Math.floor(Math.random() * 5000), reach: 10000 + Math.floor(Math.random() * 4000), engagement: 1500 + Math.floor(Math.random() * 800) })) },
];

export const mockIGMedia: IGMedia[] = [
  { id: 'ig1', media_url: 'https://picsum.photos/seed/ig1/400/400', permalink: '', media_type: 'IMAGE', caption: 'Amazing sunset 🌅', timestamp: d(-24), like_count: 342, comments_count: 18 },
  { id: 'ig2', media_url: 'https://picsum.photos/seed/ig2/400/400', permalink: '', media_type: 'IMAGE', caption: 'Product showcase', timestamp: d(-48), like_count: 189, comments_count: 7 },
  { id: 'ig3', media_url: 'https://picsum.photos/seed/ig3/400/400', permalink: '', media_type: 'IMAGE', caption: 'Team photo 📸', timestamp: d(-72), like_count: 523, comments_count: 31 },
  { id: 'ig4', media_url: 'https://picsum.photos/seed/ig4/400/400', permalink: '', media_type: 'IMAGE', caption: 'Behind the scenes', timestamp: d(-96), like_count: 267, comments_count: 12 },
  { id: 'ig5', media_url: 'https://picsum.photos/seed/ig5/400/400', permalink: '', media_type: 'IMAGE', caption: 'New collection drop', timestamp: d(-120), like_count: 891, comments_count: 45 },
  { id: 'ig6', media_url: 'https://picsum.photos/seed/ig6/400/400', permalink: '', media_type: 'IMAGE', caption: 'Monday motivation', timestamp: d(-144), like_count: 156, comments_count: 9 },
];

export const mockIGComments: IGComment[] = [
  { id: 'c1', media_id: 'ig1', username: 'user_fan', text: 'This is incredible! 😍', timestamp: d(-23) },
  { id: 'c2', media_id: 'ig1', username: 'brand_partner', text: 'Love the colors', timestamp: d(-22) },
  { id: 'c3', media_id: 'ig3', username: 'team_member', text: 'Great day!', timestamp: d(-70) },
  { id: 'c4', media_id: 'ig5', username: 'loyal_customer', text: 'Need this!! When does it drop?', timestamp: d(-118) },
  { id: 'c5', media_id: 'ig5', username: 'influencer_x', text: 'Collab? DM me 🤝', timestamp: d(-117) },
];

export const mockIGConversations: IGConversation[] = [
  { id: 'conv1', participant: 'loyal_customer', participant_id: 'u1', last_message: 'Thanks for the info!', last_timestamp: d(-1), unread: true, messages: [] },
  { id: 'conv2', participant: 'influencer_x', participant_id: 'u2', last_message: 'Sounds great, let\'s chat', last_timestamp: d(-5), unread: false, messages: [] },
  { id: 'conv3', participant: 'brand_partner', participant_id: 'u3', last_message: 'Sending over the brief now', last_timestamp: d(-12), unread: false, messages: [] },
];

export const mockIGMessages: IGMessage[] = [
  { id: 'm1', conversation_id: 'conv1', from: 'loyal_customer', text: 'Hey, when does the new collection ship?', timestamp: d(-3) },
  { id: 'm2', conversation_id: 'conv1', from: 'me', text: 'Hi! It ships next Monday 🚀', timestamp: d(-2) },
  { id: 'm3', conversation_id: 'conv1', from: 'loyal_customer', text: 'Thanks for the info!', timestamp: d(-1) },
  { id: 'm4', conversation_id: 'conv2', from: 'influencer_x', text: 'Love your brand! Open to collab?', timestamp: d(-8) },
  { id: 'm5', conversation_id: 'conv2', from: 'me', text: 'Absolutely! What do you have in mind?', timestamp: d(-6) },
  { id: 'm6', conversation_id: 'conv2', from: 'influencer_x', text: 'Sounds great, let\'s chat', timestamp: d(-5) },
  { id: 'm7', conversation_id: 'conv3', from: 'brand_partner', text: 'Ready for the Q1 campaign?', timestamp: d(-14) },
  { id: 'm8', conversation_id: 'conv3', from: 'me', text: 'Yes! Send the brief when ready', timestamp: d(-13) },
  { id: 'm9', conversation_id: 'conv3', from: 'brand_partner', text: 'Sending over the brief now', timestamp: d(-12) },
];

export const mockWebhookEvents: WebhookEvent[] = [
  { id: 'wh1', type: 'upload_completed', message: 'Video uploaded to Instagram for acme_brand', timestamp: d(-0.5), read: false },
  { id: 'wh2', type: 'post_published', message: 'Post published on Facebook for urban_eats', timestamp: d(-1), read: false },
  { id: 'wh3', type: 'upload_failed', message: 'Upload failed for jane_fitness on TikTok', timestamp: d(-3), read: true },
  { id: 'wh4', type: 'upload_completed', message: 'Carousel uploaded to Instagram for acme_brand', timestamp: d(-6), read: true },
];
