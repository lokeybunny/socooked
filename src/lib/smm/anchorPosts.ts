import type { ScheduledPost } from './types';

const CAMPAIGN_START_DAY = '2026-03-17';

/**
 * Deduplicates and redistributes scheduled posts to consecutive days
 * starting from CAMPAIGN_START_DAY (Mar 17, 2026).
 * Used by Calendar, Overview, History, and Queue to keep dates aligned.
 */
export function anchorPostsToCampaignStart(posts: ScheduledPost[]): ScheduledPost[] {
  const basePosts = posts.filter(p => p.scheduled_date && !['completed', 'failed', 'cancelled'].includes(p.status));
  if (basePosts.length === 0) return posts; // return original if nothing to anchor

  // Deduplicate by job_id
  const byJobId = new Map<string, ScheduledPost>();
  for (const post of basePosts) {
    const key = post.job_id || post.id;
    if (!byJobId.has(key)) byJobId.set(key, post);
  }
  const uniquePosts = Array.from(byJobId.values());

  // Deduplicate by title prefix
  const seenTitle = new Set<string>();
  const dedupedByContent: ScheduledPost[] = [];
  const sorted = [...uniquePosts].sort((a, b) =>
    (a.scheduled_date || '').localeCompare(b.scheduled_date || '') || a.created_at.localeCompare(b.created_at)
  );
  for (const post of sorted) {
    if (!post.scheduled_date) continue;
    const titleKey = post.title.slice(0, 50).toLowerCase().replace(/\s+/g, ' ');
    if (seenTitle.has(titleKey)) continue;
    seenTitle.add(titleKey);
    dedupedByContent.push(post);
  }

  // Redistribute to consecutive days from campaign start
  const anchored = dedupedByContent.map((post, index) => {
    const targetDate = new Date(`${CAMPAIGN_START_DAY}T12:00:00`);
    targetDate.setDate(targetDate.getDate() + index);
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const timePart = post.scheduled_date!.split('T')[1] || '12:00:00';
    return {
      ...post,
      scheduled_date: `${yyyy}-${mm}-${dd}T${timePart}`,
    };
  });

  // Merge: return anchored posts + non-schedulable posts (completed/failed/cancelled or no date)
  const anchoredIds = new Set(dedupedByContent.map(p => p.id));
  const rest = posts.filter(p => !anchoredIds.has(p.id) && !basePosts.some(bp => bp.id === p.id));
  return [...anchored, ...rest];
}
