import { useRef, useState, useCallback } from 'react';

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;

interface RecordingOptions {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: MediaStream[];
  meetingTitle: string;
}

export function useRecording() {
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animFrameRef = useRef<number>(0);
  const timerRef = useRef<number>(0);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  const getOrCreateVideo = useCallback((id: string, stream: MediaStream): HTMLVideoElement => {
    let vid = videoElementsRef.current.get(id);
    if (!vid || vid.srcObject !== stream) {
      vid = document.createElement('video');
      vid.srcObject = stream;
      vid.muted = true;
      vid.playsInline = true;
      vid.play().catch(() => {});
      videoElementsRef.current.set(id, vid);
    }
    return vid;
  }, []);

  const startRecording = useCallback((opts: RecordingOptions): boolean => {
    const { localStream, screenStream, remoteStreams } = opts;
    if (!localStream && !screenStream) return false;

    // Create offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d')!;

    // Collect all audio tracks into a single destination
    const audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();

    const addAudioFrom = (stream: MediaStream) => {
      stream.getAudioTracks().forEach(track => {
        const src = audioCtx.createMediaStreamSource(new MediaStream([track]));
        src.connect(dest);
      });
    };

    if (localStream) addAudioFrom(localStream);
    remoteStreams.forEach(s => addAudioFrom(s));

    // Compositor: draw all streams onto canvas
    const drawFrame = () => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Determine active video stream (screen share takes priority)
      const activeStream = screenStream || localStream;
      const allStreams: { id: string; stream: MediaStream }[] = [];

      if (activeStream) allStreams.push({ id: 'local', stream: activeStream });
      remoteStreams.forEach((s, i) => allStreams.push({ id: `remote-${i}`, stream: s }));

      const count = allStreams.length;
      if (count === 0) {
        animFrameRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      // Grid layout
      const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
      const rows = Math.ceil(count / cols);
      const cellW = WIDTH / cols;
      const cellH = HEIGHT / rows;

      allStreams.forEach(({ id, stream }, idx) => {
        const vid = getOrCreateVideo(id, stream);
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = col * cellW;
        const y = row * cellH;

        if (vid.readyState >= 2) {
          // Cover-fit within cell
          const vw = vid.videoWidth || cellW;
          const vh = vid.videoHeight || cellH;
          const scale = Math.max(cellW / vw, cellH / vh);
          const sw = cellW / scale;
          const sh = cellH / scale;
          const sx = (vw - sw) / 2;
          const sy = (vh - sh) / 2;
          ctx.drawImage(vid, sx, sy, sw, sh, x, y, cellW, cellH);
        }
      });

      animFrameRef.current = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    // Combine canvas video + mixed audio
    const canvasStream = canvas.captureStream(FPS);
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    const recorder = new MediaRecorder(combined, {
      mimeType: 'video/webm;codecs=vp8,opus',
      videoBitsPerSecond: 2_500_000,
    });

    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);
    setRecordingTime(0);

    timerRef.current = window.setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);

    return true;
  }, [getOrCreateVideo]);

  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(new Blob(chunksRef.current, { type: 'video/webm' }));
        return;
      }

      recorder.onstop = () => {
        cancelAnimationFrame(animFrameRef.current);
        clearInterval(timerRef.current);
        videoElementsRef.current.forEach(v => { v.srcObject = null; });
        videoElementsRef.current.clear();
        setRecording(false);
        resolve(new Blob(chunksRef.current, { type: 'video/webm' }));
      };

      recorder.stop();
    });
  }, []);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, []);

  return { recording, recordingTime, startRecording, stopRecording, formatTime };
}
