import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Send, X } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

interface MeetingChatProps {
  channel: any;
  myName: string;
  myPeerId: string;
}

export default function MeetingChat({ channel, myName, myPeerId }: MeetingChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!channel) return;
    const handler = ({ payload }: any) => {
      const msg: ChatMessage = payload;
      setMessages(prev => [...prev, msg]);
      if (!open) setUnread(prev => prev + 1);
    };
    channel.on('broadcast', { event: 'chat-message' }, handler);
    // No cleanup needed — channel unsub handles it
  }, [channel, open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  const sendMessage = () => {
    if (!draft.trim() || !channel) return;
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: myName,
      text: draft.trim(),
      timestamp: Date.now(),
    };
    channel.send({ type: 'broadcast', event: 'chat-message', payload: msg });
    setMessages(prev => [...prev, msg]);
    setDraft('');
  };

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="icon"
        className="h-12 w-12 rounded-full relative"
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>
    );
  }

  return (
    <div className="fixed right-4 bottom-24 w-80 h-96 bg-background border border-border rounded-xl shadow-lg flex flex-col z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-foreground flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Chat
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-3 py-2">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-8">No messages yet</p>
        )}
        {messages.map(m => {
          const isMe = m.sender === myName;
          return (
            <div key={m.id} className={`mb-2 flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <span className="text-[10px] text-muted-foreground mb-0.5">{m.sender}</span>
              <div className={`px-3 py-1.5 rounded-lg text-sm max-w-[85%] ${isMe ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </ScrollArea>

      <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Type a message..."
          className="h-8 text-sm"
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
        />
        <Button size="icon" className="h-8 w-8 shrink-0" onClick={sendMessage} disabled={!draft.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
