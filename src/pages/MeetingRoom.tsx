import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff, Users, Minimize2,
} from 'lucide-react';
import MeetingChat from '@/components/meeting/MeetingChat';
import MeetingVideoGate from '@/components/meeting/MeetingVideoGate';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface Participant {
  peerId: string;
  name: string;
  pc: RTCPeerConnection;
  stream: MediaStream | null;
}

export default function MeetingRoom() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [joined, setJoined] = useState(false);
  const [videoWatched, setVideoWatched] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [meeting, setMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peersRef = useRef<Map<string, Participant>>(new Map());
  const myPeerIdRef = useRef<string>(crypto.randomUUID());
  const channelRef = useRef<any>(null);

  // Load meeting info
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('meetings')
        .select('*')
        .eq('room_code', roomCode)
        .single();
      setMeeting(data);
      setLoading(false);
      if (!data) toast.error('Meeting not found');
    };
    load();
  }, [roomCode]);

  // Auto-fill name for logged-in users
  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      setGuestName(user.user_metadata.full_name);
    }
  }, [user]);

  const getLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      return stream;
    } catch {
      // fallback audio only
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        return stream;
      } catch {
        toast.error('Could not access camera or microphone');
        return null;
      }
    }
  }, []);

  // Attach local stream to video element once joined and ref is available
  useEffect(() => {
    if (joined && localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [joined]);

  const createPeerConnection = useCallback((remotePeerId: string, remoteName: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Use screen stream if currently sharing, otherwise camera
    const activeStream = screenStreamRef.current || localStreamRef.current;
    if (activeStream) {
      activeStream.getTracks().forEach(track => pc.addTrack(track, activeStream));
    }

    const participant: Participant = { peerId: remotePeerId, name: remoteName, pc, stream: null };

    pc.ontrack = (event) => {
      const existing = peersRef.current.get(remotePeerId);
      const updated = { ...(existing || participant), stream: event.streams[0] };
      peersRef.current.set(remotePeerId, updated);
      setParticipants(Array.from(peersRef.current.values()));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: {
            candidate: event.candidate,
            from: myPeerIdRef.current,
            to: remotePeerId,
          },
        });
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channelRef.current?.send({
          type: 'broadcast',
          event: 'offer',
          payload: { offer, from: myPeerIdRef.current, name: guestName, to: remotePeerId },
        });
      } catch (err) {
        console.error('Renegotiation failed:', err);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE state [${remoteName}]:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.warn('ICE connection failed, attempting restart');
        pc.restartIce();
      }
    };

    peersRef.current.set(remotePeerId, participant);
    setParticipants(Array.from(peersRef.current.values()));
    return pc;
  }, [guestName]);

  const joinRoom = useCallback(async () => {
    if (!guestName.trim()) { toast.error('Enter your name'); return; }

    const stream = await getLocalStream();
    if (!stream) return;

    setJoined(true);
    const myPeerId = myPeerIdRef.current;

    const channel = supabase.channel(`meeting:${roomCode}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'join' }, async ({ payload }: any) => {
        // Someone joined, create offer
        const pc = createPeerConnection(payload.peerId, payload.name);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channel.send({
          type: 'broadcast',
          event: 'offer',
          payload: { offer, from: myPeerId, name: guestName, to: payload.peerId },
        });
      })
      .on('broadcast', { event: 'offer' }, async ({ payload }: any) => {
        if (payload.to !== myPeerId) return;
        const pc = createPeerConnection(payload.from, payload.name);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        channel.send({
          type: 'broadcast',
          event: 'answer',
          payload: { answer, from: myPeerId, name: guestName, to: payload.from },
        });
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }: any) => {
        if (payload.to !== myPeerId) return;
        const peer = peersRef.current.get(payload.from);
        if (peer) {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
        }
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }: any) => {
        if (payload.to !== myPeerId) return;
        const peer = peersRef.current.get(payload.from);
        if (peer) {
          await peer.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      })
      .on('broadcast', { event: 'leave' }, ({ payload }: any) => {
        const peer = peersRef.current.get(payload.peerId);
        if (peer) {
          peer.pc.close();
          peersRef.current.delete(payload.peerId);
          setParticipants(Array.from(peersRef.current.values()));
        }
      })
      .subscribe(() => {
        // Announce presence
        channel.send({
          type: 'broadcast',
          event: 'join',
          payload: { peerId: myPeerId, name: guestName },
        });
      });
  }, [roomCode, guestName, getLocalStream, createPeerConnection]);

  const toggleMic = () => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setMicOn(!micOn);
    }
  };

  const toggleCam = () => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
      setCamOn(!camOn);
    }
  };

  const toggleScreen = async () => {
    if (screenOn) {
      // Stop screen share
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      // Revert to camera
      const camStream = localStreamRef.current;
      const videoTrack = camStream?.getVideoTracks()[0];
      peersRef.current.forEach(p => {
        const sender = p.pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack);
        } else if (sender && !videoTrack) {
          // No camera track, remove screen track
          sender.replaceTrack(null);
        }
      });
      if (localVideoRef.current) localVideoRef.current.srcObject = camStream;
      setScreenOn(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screen;
        const screenTrack = screen.getVideoTracks()[0];
        // Replace or add video track in all peer connections
        peersRef.current.forEach(p => {
          const sender = p.pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          } else {
            // No video sender (audio-only) — add the screen track
            p.pc.addTrack(screenTrack, screen);
          }
        });
        if (localVideoRef.current) localVideoRef.current.srcObject = screen;
        screenTrack.onended = () => {
          toggleScreen();
        };
        setScreenOn(true);
      } catch {
        toast.error('Screen sharing cancelled');
      }
    }
  };

  const leaveRoom = () => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'leave',
      payload: { peerId: myPeerIdRef.current },
    });
    peersRef.current.forEach(p => p.pc.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    channelRef.current?.unsubscribe();
    navigate('/meetings');
  };

  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      peersRef.current.forEach(p => p.pc.close());
      channelRef.current?.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading meeting...</p>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Video className="h-12 w-12 mx-auto text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Meeting not found.</p>
          <Button variant="outline" onClick={() => navigate('/')}>Go Home</Button>
        </div>
      </div>
    );
  }

  // Video gate: must watch before joining
  if (!videoWatched && meeting.category) {
    return (
      <MeetingVideoGate
        category={meeting.category}
        onComplete={() => setVideoWatched(true)}
      />
    );
  }

  if (!joined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="glass-card p-8 w-full max-w-md space-y-6 text-center">
          <div className="space-y-2">
            <Video className="h-10 w-10 mx-auto text-primary" />
            <h1 className="text-xl font-bold text-foreground">{meeting.title}</h1>
            <p className="text-sm text-muted-foreground">Room: {meeting.room_code}</p>
          </div>
          <div className="space-y-2 text-left">
            <label className="text-sm font-medium text-foreground">Your Name</label>
            <Input
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              placeholder="Enter your name"
              onKeyDown={e => e.key === 'Enter' && joinRoom()}
            />
          </div>
          <Button className="w-full" onClick={joinRoom}>
            <Video className="h-4 w-4 mr-2" /> Join Meeting
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Video className="h-5 w-5 text-primary" />
          <span className="font-medium text-foreground">{meeting.title}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{participants.length + 1} participant{participants.length !== 0 ? 's' : ''}</span>
        </div>
      </div>

      {/* Fullscreen overlay */}
      {fullscreenId && (
        <div
          className="fixed inset-0 z-50 bg-black flex items-center justify-center cursor-pointer"
          onDoubleClick={() => setFullscreenId(null)}
        >
          {fullscreenId === 'local' ? (
            <video
              ref={el => { if (el) el.srcObject = screenStreamRef.current || localStreamRef.current; }}
              autoPlay muted playsInline
              className="w-full h-full object-contain"
            />
          ) : (
            (() => {
              const p = participants.find(p => p.peerId === fullscreenId);
              return p?.stream ? (
                <video
                  autoPlay playsInline
                  className="w-full h-full object-contain"
                  ref={el => { if (el) el.srcObject = p.stream; }}
                />
              ) : null;
            })()
          )}
          <button
            onClick={() => setFullscreenId(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-background/30 backdrop-blur-sm text-white hover:bg-background/50 transition-colors"
          >
            <Minimize2 className="h-5 w-5" />
          </button>
          <div className="absolute bottom-4 left-4 bg-background/60 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-white">
            {fullscreenId === 'local' ? `${guestName} (You)` : participants.find(p => p.peerId === fullscreenId)?.name}
          </div>
          <div className="absolute bottom-4 right-4 text-xs text-white/50">
            Double-click to exit
          </div>
        </div>
      )}

      {/* Video Grid */}
      <div className="flex-1 p-4 overflow-auto">
        <div className={`grid gap-4 h-full ${
          participants.length === 0 ? 'grid-cols-1' :
          participants.length <= 1 ? 'grid-cols-1 md:grid-cols-2' :
          participants.length <= 3 ? 'grid-cols-2' :
          'grid-cols-2 md:grid-cols-3'
        }`}>
          {/* Local video */}
          <div
            className="relative bg-muted rounded-xl overflow-hidden aspect-video cursor-pointer"
            onDoubleClick={() => setFullscreenId('local')}
          >
            <video
              ref={localVideoRef}
              autoPlay muted playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-3 left-3 bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-foreground">
              {guestName} (You)
            </div>
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted">
                <VideoOff className="h-10 w-10 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Remote videos */}
          {participants.map(p => (
            <div
              key={p.peerId}
              className="relative bg-muted rounded-xl overflow-hidden aspect-video cursor-pointer"
              onDoubleClick={() => setFullscreenId(p.peerId)}
            >
              <video
                autoPlay playsInline
                className="w-full h-full object-cover"
                ref={el => { if (el && p.stream) el.srcObject = p.stream; }}
              />
              <div className="absolute bottom-3 left-3 bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-foreground">
                {p.name}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 p-4 border-t border-border">
        <Button
          variant={micOn ? 'secondary' : 'destructive'}
          size="icon"
          className="h-12 w-12 rounded-full"
          onClick={toggleMic}
        >
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
        <Button
          variant={camOn ? 'secondary' : 'destructive'}
          size="icon"
          className="h-12 w-12 rounded-full"
          onClick={toggleCam}
        >
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>
        <Button
          variant={screenOn ? 'outline' : 'secondary'}
          size="icon"
          className="h-12 w-12 rounded-full"
          onClick={toggleScreen}
        >
          {screenOn ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
        </Button>
        <Button
          variant="destructive"
          size="icon"
          className="h-12 w-12 rounded-full"
          onClick={leaveRoom}
        >
          <PhoneOff className="h-5 w-5" />
        </Button>
        <MeetingChat channel={channelRef.current} myName={guestName} myPeerId={myPeerIdRef.current} />
      </div>
    </div>
  );
}
