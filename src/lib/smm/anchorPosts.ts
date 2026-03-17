import type { ScheduledPost } from './types';

const CAMPAIGN_START_DAY = '2026-03-17';

/**
 * Extract a campaign/song identifier from a recycled post's job_id.
 * e.g. "recycle-w11-lamb-day3" → "lamb"
 *      "recycle-w2-drake-day1" → "drake"
 * Falls back to '_default' for non-recycled posts.
 */
function extractCampaignKey(post: ScheduledPost): string {
  const jobId = post.job_id || '';
  // Match recycle-w{N}-{campaign}-day{N} or recycle-w{N}-{campaign}
  const match = jobId.match(/^recycle-w\d+-(.+?)(?:-day\d+)?$/);
  if (match) return match[1];

  // Also try to extract plan name from description: 'Recycled from "Plan Name"'
  const descMatch = (post.description || '').match(/Recycled from "([^"]+)"/);
  if (descMatch) return descMatch[1].toLowerCase().replace(/\s+/g, '-');

  return '_default';
}

/**
 * Deduplicates and redistributes scheduled posts to consecutive days
 * starting from CAMPAIGN_START_DAY (Mar 17, 2026).
 *
 * Groups by profile + platform + CAMPAIGN so multiple songs/campaigns
 * each get their own 7-day cycle and naturally STACK on the same days.
 */
export function anchorPostsToCampaignStart(posts: ScheduledPost[]): ScheduledPost[] {
  const schedulable = posts.filter(p => p.scheduled_date && !['completed', 'failed', 'cancelled'].includes(p.status));
  if (schedulable.length === 0) return posts;

  // Group by profile + platform + campaign so each song gets independent daily slots
  const byCampaign = new Map<string, ScheduledPost[]>();
  for (const post of schedulable) {
    const platform = post.platforms[0] || 'unknown';
    const profile = post.profile_username || post.profile_id || 'unknown';
    const campaign = extractCampaignKey(post);
    const bucketKey = `${profile}::${platform}::${campaign}`;
    if (!byCampaign.has(bucketKey)) byCampaign.set(bucketKey, []);
    byCampaign.get(bucketKey)!.push(post);
  }

  const allAnchored: ScheduledPost[] = [];
  const anchoredIds = new Set<string>();

  for (const [, scopedPosts] of byCampaign) {
    // Dedupe by job_id within this campaign
    const byJobId = new Map<string, ScheduledPost>();
    for (const post of scopedPosts) {
      const key = post.job_id || post.id;
      if (!byJobId.has(key)) byJobId.set(key, post);
    }

    const sorted = Array.from(byJobId.values()).sort((a, b) =>
      (a.scheduled_date || '').localeCompare(b.scheduled_date || '') || a.created_at.localeCompare(b.created_at)
    );

    // Strict dedup: only 1 post per campaign (already scoped by campaign key).
    // Remove any duplicate entries — keep the first occurrence only.
    const seenJobIds = new Set<string>();
    const deduped: ScheduledPost[] = [];
    for (const post of sorted) {
      if (!post.scheduled_date) continue;
      const key = post.job_id || post.id;
      if (seenJobIds.has(key)) continue;
      seenJobIds.add(key);
      deduped.push(post);
    }

    // Assign each post in this campaign to sequential days from campaign start
    for (let i = 0; i < deduped.length; i++) {
      const post = deduped[i];
      const targetDate = new Date(`${CAMPAIGN_START_DAY}T12:00:00`);
      targetDate.setDate(targetDate.getDate() + i);
      const yyyy = targetDate.getFullYear();
      const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
      const dd = String(targetDate.getDate()).padStart(2, '0');
      const timePart = post.scheduled_date!.split('T')[1] || '12:00:00';

      allAnchored.push({
        ...post,
        scheduled_date: `${yyyy}-${mm}-${dd}T${timePart}`,
      });
      anchoredIds.add(post.id);
    }
  }

  const rest = posts.filter(p => !anchoredIds.has(p.id) && !schedulable.some(sp => sp.id === p.id));
  return [...allAnchored, ...rest];
}
