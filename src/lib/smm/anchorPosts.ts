import type { ScheduledPost } from './types';

const CAMPAIGN_START_DAY = '2026-03-17';
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const PLATFORM_SLOT_PATTERN = /-(?:ig|tt|fb|li|pin|yt|x|twitter|instagram|facebook|linkedin|pinterest|youtube|tiktok)-(\d+)$/i;

function isRecycledCampaignPost(post: ScheduledPost): boolean {
  return /^recycle-w\d+-/i.test(post.job_id || '') || /Recycled from "([^"]+)"/i.test(post.description || '');
}

function normalizeCampaignKey(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/\bmusic\s+week\s+\d+\b/g, '')
    .replace(/\bweek\s+\d+\b/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || '_default';
}

/**
 * Extract a stable artist/song key from recycled posts.
 *
 * Examples:
 * - recycle-w1-lamb-day3 -> lamb
 * - recycle-w2-drake-ig-4 -> drake
 * - Recycled from "Lamb.wavvv Music Week 1" -> lamb-wavvv
 */
function extractCampaignKey(post: ScheduledPost): string {
  const jobId = (post.job_id || '').toLowerCase();
  const recycleMatch = jobId.match(/^recycle-w\d+-(.+)$/i);

  if (recycleMatch) {
    const normalizedFromJobId = normalizeCampaignKey(
      recycleMatch[1]
        .replace(/-day\d+$/i, '')
        .replace(PLATFORM_SLOT_PATTERN, '')
        .replace(/-\d+$/i, '')
    );

    if (normalizedFromJobId !== '_default') return normalizedFromJobId;
  }

  const descMatch = (post.description || '').match(/Recycled from "([^"]+)"/i);
  if (descMatch) return normalizeCampaignKey(descMatch[1]);

  return '_default';
}

function extractDayOffset(post: ScheduledPost): number | null {
  const jobId = post.job_id || '';
  const explicitDayMatch = jobId.match(/-day(\d+)$/i);
  if (explicitDayMatch) {
    const offset = Number(explicitDayMatch[1]) - 1;
    return offset >= 0 ? offset : null;
  }

  const platformSlotMatch = jobId.match(PLATFORM_SLOT_PATTERN);
  if (platformSlotMatch) {
    const offset = Number(platformSlotMatch[1]) - 1;
    return offset >= 0 ? offset : null;
  }

  return null;
}

function comparePosts(a: ScheduledPost, b: ScheduledPost): number {
  return (a.scheduled_date || '').localeCompare(b.scheduled_date || '') || a.created_at.localeCompare(b.created_at);
}

function withAnchoredDate(post: ScheduledPost, dayOffset: number): ScheduledPost {
  const targetDate = new Date(`${CAMPAIGN_START_DAY}T12:00:00`);
  targetDate.setDate(targetDate.getDate() + dayOffset);

  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  const timePart = post.scheduled_date?.split('T')[1] || '12:00:00';

  return {
    ...post,
    scheduled_date: `${yyyy}-${mm}-${dd}T${timePart}`,
  };
}

/**
 * Recycled campaigns should stack by artist/song while enforcing exactly
 * one post per campaign per calendar day.
 */
export function anchorPostsToCampaignStart(posts: ScheduledPost[]): ScheduledPost[] {
  const schedulable = posts.filter(post => post.scheduled_date && !TERMINAL_STATUSES.has(post.status));
  if (schedulable.length === 0) return posts;

  const recycledPosts = schedulable.filter(isRecycledCampaignPost);
  if (recycledPosts.length === 0) return posts;

  const passthroughScheduled = schedulable.filter(post => !isRecycledCampaignPost(post));
  const inactivePosts = posts.filter(post => !post.scheduled_date || TERMINAL_STATUSES.has(post.status));

  const byCampaign = new Map<string, ScheduledPost[]>();
  for (const post of recycledPosts) {
    const platform = post.platforms[0] || 'unknown';
    const profile = post.profile_username || post.profile_id || 'unknown';
    const campaign = extractCampaignKey(post);
    const bucketKey = `${profile}::${platform}::${campaign}`;

    if (!byCampaign.has(bucketKey)) byCampaign.set(bucketKey, []);
    byCampaign.get(bucketKey)!.push(post);
  }

  const allAnchored: ScheduledPost[] = [];

  for (const scopedPosts of byCampaign.values()) {
    const sortedPosts = [...scopedPosts].sort(comparePosts);
    const byDayOffset = new Map<number, ScheduledPost>();
    const unslotted: ScheduledPost[] = [];

    for (const post of sortedPosts) {
      const dayOffset = extractDayOffset(post);
      if (dayOffset === null) {
        unslotted.push(post);
        continue;
      }

      if (!byDayOffset.has(dayOffset)) {
        byDayOffset.set(dayOffset, post);
      }
    }

    const orderedOffsets = [...byDayOffset.keys()].sort((a, b) => a - b);
    orderedOffsets.forEach(dayOffset => {
      const post = byDayOffset.get(dayOffset);
      if (post) allAnchored.push(withAnchoredDate(post, dayOffset));
    });

    let nextOffset = orderedOffsets.length > 0 ? Math.max(...orderedOffsets) + 1 : 0;
    for (const post of unslotted) {
      allAnchored.push(withAnchoredDate(post, nextOffset));
      nextOffset += 1;
    }
  }

  return [...allAnchored, ...passthroughScheduled, ...inactivePosts];
}
