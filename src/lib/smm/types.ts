// ─── SMM Types ───

export type Platform = 'facebook' | 'instagram' | 'twitter' | 'linkedin' | 'pinterest' | 'tiktok' | 'youtube';

export interface SMMProfile {
  id: string;
  username: string;
  connected_platforms: { platform: Platform; connected: boolean; reauth_required: boolean; display_name: string }[];
  last_activity: string;
  created_at: string;
}

export type PostType = 'video' | 'photos' | 'text' | 'document';
export type PostStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'scheduled' | 'queued' | 'cancelled';

export interface ScheduledPost {
  id: string;
  job_id: string;
  request_id: string;
  profile_id: string;
  profile_username: string;
  title: string;
  description?: string;
  type: PostType;
  platforms: Platform[];
  media_url?: string;
  preview_url?: string;
  status: PostStatus;
  scheduled_date: string | null;
  published_at?: string;
  post_urls: { platform: Platform; url: string }[];
  first_comment?: string;
  platform_overrides?: Record<Platform, { title?: string; first_comment?: string }>;
  error?: string;
  created_at: string;
}

export interface QueueSlot {
  day: number; // 0-6
  time: string; // HH:mm
}

export interface QueueSettings {
  profile_id: string;
  timezone: string;
  slots: QueueSlot[];
}

export interface QueuePreviewSlot {
  slot_time: string;
  available: boolean;
  post?: ScheduledPost;
}

export interface AnalyticsData {
  profile_id: string;
  platform: Platform;
  followers: number;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  series: { date: string; impressions: number; reach: number; engagement: number }[];
}

export interface IGMedia {
  id: string;
  media_url: string;
  permalink: string;
  media_type: string;
  caption: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
}

export interface IGComment {
  id: string;
  media_id: string;
  username: string;
  text: string;
  timestamp: string;
}

export interface IGConversation {
  id: string;
  participant: string;
  participant_id: string;
  last_message: string;
  last_timestamp: string;
  unread: boolean;
  messages: IGMessage[];
}

export interface IGMessage {
  id: string;
  conversation_id: string;
  from: string;
  text: string;
  timestamp: string;
  attachment_url?: string;
}

export interface WebhookEvent {
  id: string;
  type: 'upload_completed' | 'upload_failed' | 'post_published';
  message: string;
  timestamp: string;
  read: boolean;
}
