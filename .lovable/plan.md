# SmartImage Cache + Movie Mode for Story Prompt Composer

This is a large two-part build. I'll ship it in phases so each piece is testable before the next layers on.

---

## Phase 1 — SmartImage Cache (quick win)

**New:** `src/lib/studio/imageRehostCache.ts`
- In-memory `Map<originalUrl, hostedUrl>` (module-scoped, survives component remounts)
- Optional `localStorage` persistence under key `studio:rehostCache:v1` (capped ~200 entries, LRU eviction)
- API: `getCachedRehost(url)`, `setCachedRehost(orig, hosted)`, `clearRehostCache()`
- Reads localStorage once on init; writes are debounced

**Edit:** `src/components/studio/SmartImage.tsx`
- Before calling `story-composer/image-rehost`, check cache → if hit, swap src immediately, no network
- On successful rehost, write `{original → hosted}` into cache
- Retry button bypasses cache (cache-bust)

---

## Phase 2 — Movie Mode foundation (UI + state)

**Edit:** `src/components/studio/StudioComposer.tsx`
- Add `☑ Enable Movie Mode` checkbox in the prompt composer header (next to existing batch/settings toggles)
- When enabled, reveal a **Movie Mode panel** with:
  - Sub-scenes per master scene: `2 / 3 / 4` selector
  - Clip duration: `5s / 10s / 15s` selector
  - Live runtime readout: `N master × M sub × Ds = total runtime`
  - Estimated generation count + cost hint

**New:** `src/lib/studio/movieMode.ts`
- Types: `MasterScene`, `SubScene`, `MovieClip`, `ClipStatus` (`queued | generating | pending_review | approved | rejected | stitched`)
- `expandStoryboardToMovie(shots, subPerScene, durationSec)` → builds `MasterScene[]` with `SubScene[]` children, inheriting poster + master scene context
- Runtime calculator helper

---

## Phase 3 — Sub-storyboard wall

**New:** `src/components/studio/MovieSceneTree.tsx`
- Each master shot card becomes expandable (chevron) → reveals 4 sub-scene tiles inline beneath it
- Each sub-scene tile shows: thumbnail (SmartImage), status pill, sub-prompt (auto-derived: wide → medium → close → payoff), Generate / Approve / Reject / Regenerate buttons
- Uses existing `generate-image` action per sub-scene with poster as master reference + previous sub-scene's last frame as continuity reference (when present)
- Last-frame capture: for video clips, store `lastFrameUrl` on the sub-scene; feed into the next sub-scene's generation as `referenceImage`

---

## Phase 4 — Movie Timeline + Approval Queue

**New:** `src/components/studio/MovieTimeline.tsx`
- Horizontal scrubbable strip below storyboard wall
- One block per sub-scene clip, color-coded by status, width ∝ duration
- Click block → opens approval card (approve / reject / regenerate)
- Only `approved` clips count toward final movie

**New:** `src/components/studio/MovieApprovalQueue.tsx`
- Sidebar listing all `pending_review` clips with inline preview + 3 actions

---

## Phase 5 — Assembly + Playback

**New:** `src/components/studio/MoviePlayer.tsx`
- `▶ Play Movie` button (enabled when ≥1 approved clip)
- Native sequential `<video>` playback of approved clips in master→sub order (no server-side stitching yet; queue clips and auto-advance on `ended`)
- Fullscreen, scrub between clips, skip scene
- Export MP4: defer to a follow-up (would require an `ffmpeg`-based edge function — out of scope for this pass; we'll wire a stub button that says "Export coming next")

---

## Phase 6 — Generation queue manager

**New:** `src/lib/studio/movieQueue.ts`
- Concurrency-limited (default 2) queue around CDance2 calls
- Retry on failure (max 2), pause/resume, prioritize by scene index
- Status events feed back into `MasterScene` / `SubScene` state

---

## Out of scope for this pass (architected for, not built)
- Server-side MP4 stitching (will require edge function with ffmpeg or external service)
- AI dialogue / voice / soundtrack generation
- Subtitle support, advanced AI cinematographer
- Supabase cloud cache (localStorage is enough for now)

These are stubbed with TODOs and clean extension points.

---

## Technical notes

- All new state lives in `StudioComposer` local state + a single `useMovieMode` hook in `src/lib/studio/hooks.ts` (extension of existing file). No DB migrations this pass — movie state is session-scoped + localStorage-backed.
- All new colors/components use existing semantic tokens (`bg-card`, `border-border`, `text-foreground`, neon-green accent for Movie Mode active state).
- `SmartImage` change is backward-compatible — existing call sites unchanged.

---

## Suggested order of approval
Phase 1 alone is ~15 min and immediately reduces cost. Phases 2–6 together are the full Movie Mode. Reply "ship it" to do all 6, or "phase 1 only" to do just the cache first.