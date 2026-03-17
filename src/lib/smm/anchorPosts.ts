import type { ScheduledPost } from './types';

const CAMPAIGN_START_DAY = '2026-03-17';

/**
 * Deduplicates and redistributes scheduled posts to consecutive days
 * starting from CAMPAIGN_START_DAY (Mar 17, 2026).
 * 
 * Works PER-PLATFORM so each platform gets its own 1-per-day timeline.
 * Multiple platforms can share the same calendar day without conflict.
 */
export function anchorPostsToCampaignStart(posts: ScheduledPost[]): ScheduledPost[] {
  const schedulable = posts.filter(p => p.scheduled_date && !['completed', 'failed', 'cancelled'].includes(p.status));
  if (schedulable.length === 0) return posts;

  // Group by platform
  const byPlatform = new Map<string, ScheduledPost[]>();
  for (const post of schedulable) {
    const platform = post.platforms[0] || 'unknown';
    if (!byPlatform.has(platform)) byPlatform.set(platform, []);
    byPlatform.get(platform)!.push(post);
  }

  const allAnchored: ScheduledPost[] = [];
  const anchoredIds = new Set<string>();

  for (const [, platformPosts] of byPlatform) {
    // Deduplicate by job_id within this platform
    const byJobId = new Map<string, ScheduledPost>();
    for (const post of platformPosts) {
      const key = post.job_id || post.id;
      if (!byJobId.has(key)) byJobId.set(key, post);
    }

    // Sort by original scheduled date, then created_at
    const sorted = Array.from(byJobId.values()).sort((a, b) =>
      (a.scheduled_date || '').localeCompare(b.scheduled_date || '') || a.created_at.localeCompare(b.created_at)
    );

    // Deduplicate by normalised title within same day
    const seenKey = new Set<string>();
    const deduped: ScheduledPost[] = [];
    for (const post of sorted) {
      if (!post.scheduled_date) continue;
      const day = post.scheduled_date.substring(0, 10);
      const titleKey = post.title.slice(0, 50).toLowerCase().replace(/\s+/g, ' ');
      const compositeKey = `${day}||${titleKey}`;
      if (seenKey.has(compositeKey)) continue;
      seenKey.add(compositeKey);
      deduped.push(post);
    }

    // Redistribute: 1 post per day for this platform, starting from campaign start
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

  // Merge: anchored posts + non-schedulable posts (completed/failed/cancelled or no date)
  const rest = posts.filter(p => !anchoredIds.has(p.id) && !schedulable.some(sp => sp.id === p.id));
  return [...allAnchored, ...rest];
}
