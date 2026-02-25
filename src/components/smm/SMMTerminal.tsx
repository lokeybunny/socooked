import { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal, Send, Loader2, ChevronUp, ChevronDown, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'success' | 'info';
  text: string;
  timestamp: Date;
}

interface SMMTerminalProps {
  profileUsername: string;
}

export default function SMMTerminal({ profileUsername }: SMMTerminalProps) {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: '0', type: 'info', text: '⚡ SMM Scheduler ready. Type a command to control your social accounts.', timestamp: new Date() },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const addLine = useCallback((type: TerminalLine['type'], text: string) => {
    setLines(prev => [...prev, { id: crypto.randomUUID(), type, text, timestamp: new Date() }]);
  }, []);

  const handleSubmit = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd || loading) return;

    addLine('input', `> ${cmd}`);
    setInput('');
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('smm-scheduler', {
        body: {
          prompt: cmd,
          profile: profileUsername,
        },
      });

      if (error) {
        addLine('error', `✗ ${error.message}`);
        setLoading(false);
        return;
      }

      if (data?.type === 'clarify') {
        addLine('info', `? ${data.message}`);
      } else if (data?.type === 'executed') {
        for (const action of data.actions || []) {
          if (action.success) {
            addLine('success', `✓ ${action.description}`);
            // Show key result data compactly
            if (action.data) {
              const preview = formatResult(action.data);
              if (preview) addLine('output', preview);
            }
          } else {
            addLine('error', `✗ ${action.description}: ${action.error}`);
          }
        }
      } else if (data?.type === 'message') {
        addLine('output', data.message);
      } else {
        addLine('output', JSON.stringify(data, null, 2));
      }
    } catch (e: any) {
      addLine('error', `✗ ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [input, loading, profileUsername, addLine]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={cn(
      'fixed bottom-0 right-0 left-16 z-50 transition-all duration-300',
      'bg-[hsl(var(--card))] border-t border-border/50',
      expanded ? 'h-72' : 'h-12',
    )}>
      {/* Header bar — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full h-12 flex items-center gap-2 px-4 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
      >
        <Terminal className="h-3.5 w-3.5 text-primary" />
        <span className="font-semibold text-foreground/80">SMM Scheduler</span>
        <span className="opacity-50">—</span>
        <span className="opacity-60 truncate">prompt-driven control · {profileUsername}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {loading && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </div>
      </button>

      {/* Terminal body */}
      {expanded && (
        <div className="flex flex-col h-[calc(100%-3rem)]">
          {/* Log output */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs space-y-0.5">
            {lines.map(line => (
              <div key={line.id} className={cn(
                'leading-5 whitespace-pre-wrap break-all',
                line.type === 'input' && 'text-primary font-medium',
                line.type === 'output' && 'text-muted-foreground',
                line.type === 'error' && 'text-destructive',
                line.type === 'success' && 'text-primary',
                line.type === 'info' && 'text-muted-foreground/70 italic',
              )}>
                {line.type === 'success' && <CheckCircle2 className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {line.type === 'error' && <XCircle className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {line.type === 'info' && <HelpCircle className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {line.text}
              </div>
            ))}
            {loading && (
              <div className="text-muted-foreground/50 animate-pulse">processing…</div>
            )}
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-4 py-2 border-t border-border/30">
            <span className="text-primary font-mono text-xs font-bold">›</span>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="schedule a post tomorrow at 3pm on IG and X…"
              className="flex-1 bg-transparent text-foreground font-mono text-xs outline-none placeholder:text-muted-foreground/40"
              disabled={loading}
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !input.trim()}
              className="p-1 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatResult(data: any): string {
  if (!data || typeof data !== 'object') return '';
  // Show request_id / job_id if present
  const parts: string[] = [];
  if (data.request_id) parts.push(`request: ${data.request_id}`);
  if (data.job_id) parts.push(`job: ${data.job_id}`);
  if (data.status) parts.push(`status: ${data.status}`);
  if (data.scheduled_posts?.length !== undefined) parts.push(`${data.scheduled_posts.length} scheduled`);
  if (data.history?.length !== undefined) parts.push(`${data.history.length} entries`);
  if (data.message) parts.push(data.message);
  return parts.length ? `  → ${parts.join(' · ')}` : '';
}
