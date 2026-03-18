import { describe, expect, it } from 'vitest';
import type { ScheduledPost } from './types';
import { anchorPostsToCampaignStart } from './anchorPosts';

function buildPost(overrides: Partial<ScheduledPost> & Pick<ScheduledPost, 'id' | 'job_id' | 'title' | 'scheduled_date'>): ScheduledPost {
  return {
    id: overrides.id,
    job_id: overrides.job_id,
    request_id: '',
    profile_id: overrides.profile_id || 'NysonBlack',
    profile_username: overrides.profile_username || 'NysonBlack',
    title: overrides.title,
    description: overrides.description,
    type: overrides.type || 'video',
    platforms: overrides.platforms || ['instagram'],
    media_url: overrides.media_url,
    preview_url: overrides.preview_url,
    status: overrides.status || 'scheduled',
    scheduled_date: overrides.scheduled_date,
    published_at: overrides.published_at,
    post_urls: overrides.post_urls || [],
    first_comment: overrides.first_comment,
    platform_overrides: overrides.platform_overrides,
    error: overrides.error,
    created_at: overrides.created_at || overrides.scheduled_date || '2026-03-17T12:00:00.000Z',
    origin: overrides.origin,
  };
}

describe('anchorPostsToCampaignStart', () => {
  it('keeps one recycled post per artist/song per day slot and dedupes same-day entries', () => {
    const posts = [
      buildPost({ id: '1', job_id: 'recycle-w1-lamb-day1', title: 'Lamb 1', scheduled_date: '2026-03-24T18:00:00.000Z', description: 'Recycled from "Lamb.wavvv Music Week 1"' }),
      buildPost({ id: '3', job_id: 'recycle-w1-lamb-day2', title: 'Lamb 2', scheduled_date: '2026-03-25T18:00:00.000Z', description: 'Recycled from "Lamb.wavvv Music Week 1"' }),
    ];

    const anchored = anchorPostsToCampaignStart(posts);

    expect(anchored).toHaveLength(2);
    expect(anchored.map(post => post.scheduled_date?.slice(0, 10))).toEqual(['2026-03-17', '2026-03-18']);
  });

  it('collapses duplicate day-offset posts across platforms so each artist appears once per day', () => {
    const posts = [
      buildPost({ id: '1', job_id: 'recycle-w1-drake-ig-1', title: 'Drake IG 1', scheduled_date: '2026-03-17T12:00:00.000Z', description: 'Recycled from "Drake Music Week 1"', platforms: ['instagram'] }),
      buildPost({ id: '4', job_id: 'recycle-w1-drake-ig-2', title: 'Drake IG 2', scheduled_date: '2026-03-18T12:00:00.000Z', description: 'Recycled from "Drake Music Week 1"', platforms: ['instagram'] }),
      buildPost({ id: '5', job_id: 'manual-post', title: 'Manual', scheduled_date: '2026-04-01T10:00:00.000Z', description: 'Manual schedule', platforms: ['instagram'] }),
    ];

    const anchored = anchorPostsToCampaignStart(posts);
    const drake = anchored.filter(post => post.description?.includes('Drake Music Week 1'));
    const manual = anchored.find(post => post.job_id === 'manual-post');

    expect(drake).toHaveLength(2);
    expect(drake.map(post => post.scheduled_date?.slice(0, 10))).toEqual(['2026-03-17', '2026-03-18']);
    expect(manual?.scheduled_date).toBe('2026-04-01T10:00:00.000Z');
  });

  it('dedupes opaque scheduled API items by day and inferred artist key', () => {
    const posts = [
      buildPost({ id: '1', job_id: 'opaque-1', title: '💯 Drake vibes all week #Drake #Music', scheduled_date: '2026-03-25T19:00:00.000Z', platforms: ['instagram'] }),
      buildPost({ id: '2', job_id: 'opaque-2', title: '💯 Drake vibes all week #Drake #Music', scheduled_date: '2026-03-25T20:00:00.000Z', platforms: ['tiktok'] }),
      buildPost({ id: '3', job_id: 'opaque-3', title: '💯 Kick off your week with @lamb.wavvv #NewMusic', scheduled_date: '2026-03-25T01:00:00.000Z', platforms: ['instagram'] }),
      buildPost({ id: '4', job_id: 'opaque-4', title: '💯 Kick off your week with @lamb.wavvv #MusicDiscovery', scheduled_date: '2026-03-25T02:00:00.000Z', platforms: ['instagram'] }),
    ];

    const anchored = anchorPostsToCampaignStart(posts);

    expect(anchored).toHaveLength(2);
    const jobIds = anchored.map(post => post.job_id).sort();
    expect(jobIds).toEqual(['opaque-1', 'opaque-3']);
  });

  it('normalizes Lamb and Oranj handle variants into one artist slot per day', () => {
    const posts = [
      buildPost({ id: '1', job_id: 'opaque-lamb-1', title: 'Kick off with @lamb.wavvv', scheduled_date: '2026-03-25T18:00:00.000Z', platforms: ['instagram'] }),
      buildPost({ id: '2', job_id: 'opaque-lamb-2', title: 'Kick off with @lamb.wavv', scheduled_date: '2026-03-25T19:00:00.000Z', platforms: ['tiktok'] }),
      buildPost({ id: '3', job_id: 'opaque-oranj-1', title: 'New drop from @oranjgoodman', scheduled_date: '2026-03-25T20:00:00.000Z', platforms: ['instagram'] }),
      buildPost({ id: '4', job_id: 'opaque-oranj-2', title: 'New drop from Oranj Goodman', scheduled_date: '2026-03-25T21:00:00.000Z', platforms: ['tiktok'] }),
    ];

    const anchored = anchorPostsToCampaignStart(posts);

    expect(anchored).toHaveLength(2);
    expect(anchored.map(post => post.job_id)).toEqual(['opaque-lamb-1', 'opaque-oranj-1']);
  });

  it('preserves distinct same-day times so manual reschedules are not overwritten', () => {
    const posts = [
      buildPost({ id: '1', job_id: 'opaque-a', title: 'Post A #Drake', scheduled_date: '2026-03-25T12:00:00.000Z', platforms: ['instagram'] }),
      buildPost({ id: '2', job_id: 'opaque-b', title: 'Post B @lamb.wavvv', scheduled_date: '2026-03-25T12:30:00.000Z', platforms: ['instagram'] }),
      buildPost({ id: '3', job_id: 'opaque-c', title: 'Post C @oranjgoodman', scheduled_date: '2026-03-25T15:00:00.000Z', platforms: ['tiktok'] }),
    ];

    const anchored = anchorPostsToCampaignStart(posts);

    expect(anchored.map(post => post.scheduled_date)).toEqual([
      '2026-03-25T12:00:00.000Z',
      '2026-03-25T12:30:00.000Z',
      '2026-03-25T15:00:00.000Z',
    ]);
  });

  it('still resolves exact same-time collisions into spaced slots', () => {
    const posts = [
      buildPost({ id: '1', job_id: 'opaque-a', title: 'Post A #Drake', scheduled_date: '2026-03-25T12:00:00.000Z', platforms: ['instagram'] }),
      buildPost({ id: '2', job_id: 'opaque-b', title: 'Post B @lamb.wavvv', scheduled_date: '2026-03-25T12:00:00.000Z', platforms: ['instagram'] }),
      buildPost({ id: '3', job_id: 'opaque-c', title: 'Post C @oranjgoodman', scheduled_date: '2026-03-25T12:00:00.000Z', platforms: ['tiktok'] }),
    ];

    const anchored = anchorPostsToCampaignStart(posts);
    const times = anchored
      .filter(p => p.scheduled_date)
      .map(p => {
        const t = p.scheduled_date!.split('T')[1];
        return parseInt(t.split(':')[0], 10);
      })
      .sort((a, b) => a - b);

    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(3);
    }
  });

  it('preserves real calendar schedule dates for recycled calendar events', () => {
    const posts = [
      buildPost({
        id: 'calendar-1',
        job_id: 'recycle-w2-drake-ig-4',
        title: 'Drake scheduled today',
        description: 'Recycled from "Drake Music Week 1"\nMedia URL: https://example.com/drake.mp4',
        scheduled_date: '2026-03-18T12:00:00.000Z',
        origin: 'calendar',
        platforms: ['instagram'],
      }),
    ];

    const anchored = anchorPostsToCampaignStart(posts);

    expect(anchored).toHaveLength(1);
    expect(anchored[0].scheduled_date).toBe('2026-03-18T12:00:00.000Z');
  });
});
