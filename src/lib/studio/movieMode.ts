/**
 * Movie Mode — turns each storyboard "master scene" into a parent cinematic
 * sequence with N sub-scenes, each generating its own continuity-aware clip.
 *
 * This file is the pure data layer: types, defaults, prompt derivation, and
 * runtime math. UI lives in MovieModePanel + MovieSceneTree; queue/playback
 * are in movieQueue.ts (follow-up).
 */

export type ClipStatus =
  | 'idle'
  | 'queued'
  | 'generating_image'
  | 'image_ready'
  | 'generating_video'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'failed';

export type ClipDuration = 5 | 10 | 15;
export type SubScenesPerMaster = 2 | 3 | 4;

/** Default arc applied per sub-scene to give cinematic progression. */
export const SUB_SCENE_BEATS = [
  { label: 'A — Establishing', hint: 'wide establishing shot, set the scene' },
  { label: 'B — Build-up',     hint: 'medium tracking, tension build, character focus' },
  { label: 'C — Reaction',     hint: 'close-up emotional reaction, intimate framing' },
  { label: 'D — Payoff',       hint: 'cinematic payoff shot, resolution or cliffhanger' },
] as const;

export interface SubScene {
  id: string;
  masterNumber: number;
  index: number;            // 0..N-1
  beatLabel: string;
  prompt: string;           // derived from master + beat, user-editable
  status: ClipStatus;
  imageUrl?: string;        // sub-storyboard panel (the "frame")
  videoUrl?: string;        // CDance2 generated clip
  lastFrameUrl?: string;    // captured tail frame → continuity ref for next sub
  durationSec: ClipDuration;
  approved?: boolean;
  error?: string;
}

export interface MasterScene {
  number: number;
  title: string;
  description: string;
  posterRefUrl?: string;    // global poster (shared)
  masterImageUrl?: string;  // the master scene's own storyboard panel image
  subs: SubScene[];
  expanded?: boolean;
}

export interface MovieModeConfig {
  enabled: boolean;
  subsPerScene: SubScenesPerMaster;
  durationSec: ClipDuration;
}

export const DEFAULT_MOVIE_CONFIG: MovieModeConfig = {
  enabled: false,
  subsPerScene: 4,
  durationSec: 10,
};

/** Build a per-sub-scene prompt from the parent shot's data + beat hint. */
export function deriveSubPrompt(
  masterTitle: string,
  masterDescription: string,
  beatIndex: number,
): string {
  const beat = SUB_SCENE_BEATS[beatIndex] ?? SUB_SCENE_BEATS[SUB_SCENE_BEATS.length - 1];
  return [
    `${masterTitle} — ${beat.label}.`,
    masterDescription,
    `Cinematic beat: ${beat.hint}.`,
    'Maintain wardrobe, lighting, lens, and character continuity from the master poster reference.',
  ].filter(Boolean).join(' ');
}

/**
 * Expand a flat shots array into MasterScene[] with N sub-scenes each.
 * `existing` (if provided) preserves prior sub-scene state when reshuffling
 * the subsPerScene count.
 */
export function expandStoryboardToMovie(
  shots: Array<{ number: number; title: string; description: string }>,
  subsPerScene: SubScenesPerMaster,
  durationSec: ClipDuration,
  posterRefUrl?: string,
  existing?: MasterScene[],
): MasterScene[] {
  return shots.map((shot) => {
    const prev = existing?.find((m) => m.number === shot.number);
    const subs: SubScene[] = Array.from({ length: subsPerScene }, (_, i) => {
      const prevSub = prev?.subs[i];
      return prevSub ?? {
        id: `s${shot.number}-${i}`,
        masterNumber: shot.number,
        index: i,
        beatLabel: SUB_SCENE_BEATS[i]?.label ?? `Beat ${i + 1}`,
        prompt: deriveSubPrompt(shot.title, shot.description, i),
        status: 'idle' as ClipStatus,
        durationSec,
      };
    });
    return {
      number: shot.number,
      title: shot.title,
      description: shot.description,
      posterRefUrl,
      subs,
      expanded: prev?.expanded ?? false,
    };
  });
}

export function calcRuntime(masterCount: number, subsPerScene: number, durationSec: number) {
  const clips = masterCount * subsPerScene;
  const totalSec = clips * durationSec;
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return {
    clips,
    totalSec,
    label: `${mm}:${String(ss).padStart(2, '0')}`,
  };
}

export const STATUS_STYLE: Record<ClipStatus, { bg: string; text: string; label: string }> = {
  idle:              { bg: 'bg-zinc-800',          text: 'text-zinc-300',   label: 'Idle' },
  queued:            { bg: 'bg-blue-900/60',       text: 'text-blue-200',   label: 'Queued' },
  generating_image:  { bg: 'bg-amber-900/60',      text: 'text-amber-200',  label: 'Image…' },
  image_ready:       { bg: 'bg-amber-700/60',      text: 'text-amber-100',  label: 'Image ✓' },
  generating_video:  { bg: 'bg-purple-900/60',     text: 'text-purple-200', label: 'Clip…' },
  pending_review:    { bg: 'bg-yellow-700/70',     text: 'text-yellow-100', label: 'Review' },
  approved:          { bg: 'bg-emerald-700/70',    text: 'text-emerald-100',label: 'Approved' },
  rejected:          { bg: 'bg-red-900/70',        text: 'text-red-200',    label: 'Rejected' },
  failed:            { bg: 'bg-red-950/80',        text: 'text-red-300',    label: 'Failed' },
};
