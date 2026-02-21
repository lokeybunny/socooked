import { useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UseMeetingRecorderOptions {
  meetingId: string;
  meetingTitle: string;
  customerId: string | null;
  category: string | null;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  participants: { peerId: string; name: string; stream: MediaStream | null }[];
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
}

export function useMeetingRecorder({
  meetingId,
  meetingTitle,
  customerId,
  category,
  localVideoRef,
  participants,
  localStream,
  screenStream,
}: UseMeetingRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);

  const WIDTH = 1280;
  const HEIGHT = 720;

  const startRecording = useCallback(() => {
    try {
      // Create an offscreen canvas for compositing at 720p
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      canvasRef.current = canvas;
      const ctx = canvas.getContext('2d')!;

      // Collect all video elements to draw
      const getVideoElements = (): HTMLVideoElement[] => {
        const vids: HTMLVideoElement[] = [];
        // Local video
        if (localVideoRef.current) vids.push(localVideoRef.current);
        // Remote videos - query from DOM
        document.querySelectorAll<HTMLVideoElement>('video[autoplay]').forEach((v) => {
          if (v !== localVideoRef.current && v.srcObject) vids.push(v);
        });
        return vids;
      };

      // Draw loop
      const draw = () => {
        const videos = getVideoElements();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        if (videos.length === 0) {
          animFrameRef.current = requestAnimationFrame(draw);
          return;
        }

        const cols = videos.length <= 1 ? 1 : 2;
        const rows = Math.ceil(videos.length / cols);
        const cellW = WIDTH / cols;
        const cellH = HEIGHT / rows;

        videos.forEach((vid, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = col * cellW;
          const y = row * cellH;

          if (vid.videoWidth && vid.videoHeight) {
            // Maintain aspect ratio
            const scale = Math.min(cellW / vid.videoWidth, cellH / vid.videoHeight);
            const dw = vid.videoWidth * scale;
            const dh = vid.videoHeight * scale;
            const dx = x + (cellW - dw) / 2;
            const dy = y + (cellH - dh) / 2;
            ctx.drawImage(vid, dx, dy, dw, dh);
          }
        });

        animFrameRef.current = requestAnimationFrame(draw);
      };

      draw();

      // Capture canvas stream at 30fps
      const canvasStream = canvas.captureStream(30);

      // Mix all audio tracks
      const audioCtx = new AudioContext();
      const destination = audioCtx.createMediaStreamDestination();

      const addAudioFromStream = (stream: MediaStream | null) => {
        if (!stream) return;
        stream.getAudioTracks().forEach((track) => {
          const source = audioCtx.createMediaStreamSource(new MediaStream([track]));
          source.connect(destination);
        });
      };

      // Local audio
      addAudioFromStream(localStream);
      // Remote audio
      participants.forEach((p) => addAudioFromStream(p.stream));

      // Combine canvas video + mixed audio
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);

      // Start MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 2_500_000, // ~2.5 Mbps for 720p
      });

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        cancelAnimationFrame(animFrameRef.current);
        audioCtx.close();

        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 1000) {
          toast.error('Recording too short');
          return;
        }

        // Upload
        await uploadRecording(blob);
      };

      recorder.start(1000); // collect chunks every second
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      toast.success('Recording started');
    } catch (err) {
      console.error('Recording error:', err);
      toast.error('Failed to start recording');
    }
  }, [localVideoRef, participants, localStream, screenStream]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast.info('Processing recording...');
    }
  }, []);

  const uploadRecording = async (blob: Blob) => {
    if (!customerId) {
      toast.error('No customer linked to this meeting — recording saved locally only');
      downloadLocally(blob);
      return;
    }

    setUploading(true);
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${meetingTitle.replace(/\s+/g, '_')}_${timestamp}.webm`;

      // Step 1: Ensure customer folder exists on Google Drive
      const { data: customer } = await supabase
        .from('customers')
        .select('full_name, category')
        .eq('id', customerId)
        .single();

      if (!customer) throw new Error('Customer not found');

      const folderCategory = customer.category || category || 'other';

      const ensureRes = await supabase.functions.invoke('google-drive', {
        body: null,
        headers: { 'Content-Type': 'application/json' },
      });

      // Use FormData to upload
      const formData = new FormData();
      formData.append('file', blob, filename);
      formData.append('customerName', customer.full_name);
      formData.append('category', folderCategory);

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const uploadRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/google-drive?action=upload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${anonKey}`,
          },
          body: formData,
        }
      );

      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');

      // Step 2: Create content_asset record
      const { error: assetError } = await supabase.from('content_assets').insert({
        title: filename,
        type: 'video',
        source: 'dashboard',
        customer_id: customerId,
        category: folderCategory,
        status: 'published',
        url: uploadData.url || uploadData.webViewLink || null,
        folder: `Recordings`,
        tags: ['meeting-recording', '720p'],
      });

      if (assetError) throw assetError;

      toast.success('Recording uploaded to customer portal!');
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(`Upload failed: ${err.message}. Downloading locally instead.`);
      downloadLocally(blob);
    } finally {
      setUploading(false);
    }
  };

  const downloadLocally = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meetingTitle.replace(/\s+/g, '_')}_recording.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return { isRecording, uploading, startRecording, stopRecording };
}
