export type TaskType = 't2v' | 'i2v' | 'ti2v' | 's2v' | 'animate';

export type JobStatus = 'queued' | 'provisioning' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface GenerationJob {
  id: string;
  user_id: string;
  task_type: TaskType;
  prompt: string;
  negative_prompt: string | null;
  settings_json: GenerationSettings;
  input_image_url: string | null;
  input_audio_url: string | null;
  output_video_url: string | null;
  output_thumbnail_url: string | null;
  status: JobStatus;
  progress: number;
  worker_job_id: string | null;
  backend_logs: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerationSettings {
  resolution?: string;
  duration?: number;
  fps?: number;
  aspect_ratio?: string;
  seed?: number;
  guidance_scale?: number;
  motion_intensity?: number;
  style_preset?: string;
}

export interface WorkerHealth {
  online: boolean;
  message: string;
  supported_modes: string[];
  queue_depth: number;
  last_success: string | null;
  hardware_tier: string;
}

export interface GenerationPreset {
  id: string;
  user_id: string;
  name: string;
  task_type: TaskType;
  preset_json: GenerationSettings & { prompt?: string; negative_prompt?: string };
  created_at: string;
}

export const TASK_LABELS: Record<TaskType, string> = {
  t2v: 'Text → Video',
  i2v: 'Image → Video',
  ti2v: 'Text + Image → Video',
  s2v: 'Speech → Video',
  animate: 'Animate / Character',
};

export const STATUS_COLORS: Record<JobStatus, string> = {
  queued: 'bg-yellow-500/20 text-yellow-400',
  provisioning: 'bg-blue-500/20 text-blue-400',
  running: 'bg-purple-500/20 text-purple-400',
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-muted text-muted-foreground',
};

export const STYLE_PRESETS = [
  'cinematic', 'music video', 'realistic', 'surreal', 'product ad',
  'anime-inspired', 'dramatic lighting', 'luxury commercial',
] as const;

export const RESOLUTIONS = ['512x512', '768x768', '1024x576', '576x1024', '1280x720', '720x1280'] as const;
export const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const;
export const DURATIONS = [2, 4, 6, 8, 10, 16] as const;
export const FPS_OPTIONS = [8, 12, 16, 24, 30] as const;

export const CAMERA_MOVES = [
  'static', 'pan left', 'pan right', 'tilt up', 'tilt down', 'dolly in',
  'dolly out', 'orbit', 'crane up', 'crane down', 'tracking shot',
] as const;

export const LIGHTING_STYLES = [
  'natural', 'golden hour', 'blue hour', 'neon', 'studio', 'moody',
  'high contrast', 'soft diffused', 'dramatic rim', 'volumetric',
] as const;

export const SHOT_TYPES = [
  'wide shot', 'medium shot', 'close-up', 'extreme close-up',
  'aerial', 'low angle', 'high angle', 'dutch angle', 'POV',
] as const;
