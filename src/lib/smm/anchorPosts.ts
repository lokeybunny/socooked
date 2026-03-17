import type { ScheduledPost } from './types';

const CAMPAIGN_START_DAY = '2026-03-17';
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const PLATFORM_SLOT_PATTERN = /-(?:ig|tt|fb|li|pin|yt|x|twitter|instagram|facebook|linkedin|pinterest|youtube|tiktok)-(\d+)$/i;
const GENERIC_CAMPAIGN_TERMS = new Set([
  'music', 'newmusic', 'sharethevibes', 'musicdiscovery', 'musicvibes', 'sharegoodmusic',
  'weekendvibes', 'playlistgoals', 'goodvibes', 'instamusic', 'vibes', 'week', 'day',
]);
const ARTIST_MARKERS = {
  drake: ['drake'],
  lamb: ['@lamb.wavv', '@lamb.wavvv', 'lamb.wavv', 'lamb.wavvv', 'lambwavv', 'lambwavvv'],
  oranj: ['@oranjgoodman', 'oranj goodman', 'oranjgoodman', 'ojg-', 'oranj'],
  bryson: ['bryson tiller', 'brysontiller', 'bryson'],
} as const;

type ArtistKey = keyof typeof ARTIST_MARKERS;

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

function extractArtistKey(post: ScheduledPost): ArtistKey | null {
  const haystack = `${post.job_id || ''} ${post.title || ''} ${post.description || ''}`.toLowerCase();

  if (ARTIST_MARKERS.oranj.some(marker => haystack.includes(marker))) return 'oranj';
  if (ARTIST_MARKERS.lamb.some(marker => haystack.includes(marker))) return 'lamb';
  if (ARTIST_MARKERS.drake.some(marker => haystack.includes(marker))) return 'drake';

  return null;
}

function extractCampaignKeyFromText(text?: string): string {
  if (!text) return '_default';

  const candidates = [
    ...text.matchAll(/@([a-z0-9._-]+)/gi),
    ...text.matchAll(/#([a-z0-9._-]+)/gi),
  ].map(match => normalizeCampaignKey(match[1] || ''));

  const specificCandidate = candidates.find(candidate => candidate !== '_default' && !GENERIC_CAMPAIGN_TERMS.has(candidate));
  return specificCandidate || '_default';
}

function extractCampaignKey(post: ScheduledPost): string {
  const artistKey = extractArtistKey(post);
  if (artistKey) return artistKey;

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
  if (descMatch) {
    const normalizedFromDescription = normalizeCampaignKey(descMatch[1]);
    if (normalizedFromDescription !== '_default') return normalizedFromDescription;
  }

  const fromTitle = extractCampaignKeyFromText(post.title);
  if (fromTitle !== '_default') return fromTitle;

  const fromDescription = extractCampaignKeyFromText(post.description);
  if (fromDescription !== '_default') return fromDescription;

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

function getPostPriority(post: ScheduledPost): number {
  let score = 0;
  if (/^recycle-w\d+-/i.test(post.job_id || '')) score += 4;
  if (/Recycled from "([^"]+)"/i.test(post.description || '')) score += 3;
  if (extractDayOffset(post) !== null) score += 2;
  if (post.media_url) score += 1;
  return score;
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

function dedupeFinalCalendarPosts(posts: ScheduledPost[]): ScheduledPost[] {
  const ordered = [...posts].sort((a, b) =>
    (a.scheduled_date || '').localeCompare(b.scheduled_date || '') ||
    getPostPriority(b) - getPostPriority(a) ||
    a.created_at.localeCompare(b.created_at)
  );

  const seen = new Set<string>();
  const keptIds = new Set<string>();

  for (const post of ordered) {
    if (!post.scheduled_date || TERMINAL_STATUSES.has(post.status)) {
      keptIds.add(post.id);
      continue;
    }

    const campaign = extractCampaignKey(post);
    if (campaign === '_default') {
      keptIds.add(post.id);
      continue;
    }

    const profile = post.profile_username || post.profile_id || 'unknown';
    const day = post.scheduled_date.slice(0, 10);
    const dedupeKey = `${profile}::${day}::${campaign}`;

    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    keptIds.add(post.id);
  }

  return posts.filter(post => keptIds.has(post.id));
}

export function anchorPostsToCampaignStart(posts: ScheduledPost[]): ScheduledPost[] {
  const schedulable = posts.filter(post => post.scheduled_date && !TERMINAL_STATUSES.has(post.status));
  if (schedulable.length === 0) return posts;

  const recycledPosts = schedulable.filter(isRecycledCampaignPost);
  if (recycledPosts.length === 0) return dedupeFinalCalendarPosts(posts);

  const passthroughScheduled = schedulable.filter(post => !isRecycledCampaignPost(post));
  const inactivePosts = posts.filter(post => !post.scheduled_date || TERMINAL_STATUSES.has(post.status));

  const byCampaign = new Map<string, ScheduledPost[]>();
  for (const post of recycledPosts) {
    const profile = post.profile_username || post.profile_id || 'unknown';
    const campaign = extractCampaignKey(post);
    const bucketKey = `${profile}::${campaign}`;

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

  return dedupeFinalCalendarPosts([...allAnchored, ...passthroughScheduled, ...inactivePosts]);
}
