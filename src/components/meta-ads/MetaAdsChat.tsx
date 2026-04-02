import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Send, Sparkles, User, GraduationCap, Lightbulb, Target, PenTool,
  BarChart3, Zap, RefreshCw, Copy, ThumbsUp
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SYSTEM_PROMPT = `You are an elite Meta Ads (Facebook & Instagram) strategist, media buyer, and trainer built into a premium CRM. You help users plan, build, optimize, and understand Meta ad campaigns.

Your personality:
- Confident, clear, practical — never cheesy or generic
- Explain WHY you recommend things
- Ask smart follow-up questions when needed
- Give structured, actionable recommendations
- Sound like a hybrid of an elite media buyer, conversion strategist, and helpful coach

You help with:
- Campaign strategy and structure
- Ad copy writing (hooks, headlines, CTAs)
- Audience targeting recommendations
- Budget allocation and scaling
- Creative direction and briefs
- Performance analysis and troubleshooting
- Teaching ad concepts when asked

Always be specific. Use real examples. Give confident, practical recommendations.`;

const TRAINER_ADDON = `

TRAINER MODE IS ON. Be more educational:
- Explain ad concepts in plain English
- Define terms like CTR, CPC, CPM, ROAS, CPL when they come up
- Teach campaign structure
- Explain warm vs cold audiences
- Give mini lessons during the workflow
- Explain why certain objectives are chosen
- Point out common beginner mistakes`;

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-ads-chat`;

const suggestedPrompts = [
  { icon: Target, text: 'Build me a lead campaign for a local med spa' },
  { icon: PenTool, text: 'Write 10 ad hooks for a realtor cash offer service' },
  { icon: BarChart3, text: 'Why might my CTR be low?' },
  { icon: Lightbulb, text: 'What audience should I target for a dentist?' },
  { icon: Zap, text: 'Create a retargeting campaign for ecommerce' },
  { icon: GraduationCap, text: 'Teach me how to test 3 creatives correctly' },
];

export default function MetaAdsChat({ trainerMode }: { trainerMode: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text.trim(), timestamp: new Date() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    let assistantContent = '';

    try {
      const systemContent = SYSTEM_PROMPT + (trainerMode ? TRAINER_ADDON : '');
      const apiMessages = [
        { role: 'system' as const, content: systemContent },
        ...updatedMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ];

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (resp.status === 429) {
        toast.error('Rate limited — please wait a moment and try again.');
        setIsLoading(false);
        return;
      }
      if (resp.status === 402) {
        toast.error('AI credits exhausted. Please add funds in Settings > Workspace > Usage.');
        setIsLoading(false);
        return;
      }
      if (!resp.ok || !resp.body) throw new Error('Failed to start stream');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const upsertAssistant = (chunk: string) => {
        assistantContent += chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
          }
          return [...prev, { id: crypto.randomUUID(), role: 'assistant', content: assistantContent, timestamp: new Date() }];
        });
      };

      let done = false;
      while (!done) {
        const { done: rDone, value } = await reader.read();
        if (rDone) break;
        buffer += decoder.decode(value, { stream: true });

        let ni: number;
        while ((ni = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, ni);
          buffer = buffer.slice(ni + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch { buffer = line + '\n' + buffer; break; }
        }
      }
    } catch (e) {
      console.error('Chat error:', e);
      toast.error('Failed to get AI response');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4">
      <Card className="flex flex-col h-[700px]">
        <CardHeader className="pb-3 border-b border-border/50 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> AI Ads Strategist
              {trainerMode && (
                <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-500">
                  <GraduationCap className="h-3 w-3 mr-1" /> Trainer Mode
                </Badge>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setMessages([])} className="text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>
        </CardHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
              <div className="space-y-2">
                <Sparkles className="h-10 w-10 text-primary mx-auto" />
                <h3 className="text-lg font-semibold text-foreground">Meta Ads AI Strategist</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  I'm your expert Meta ads strategist. Ask me to build campaigns, write ad copy, suggest audiences, analyze performance, or teach you any ads concept.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {suggestedPrompts.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(p.text)}
                    className="flex items-center gap-2 p-3 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors text-left text-sm"
                  >
                    <p.icon className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-foreground">{p.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted text-foreground rounded-bl-md'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/20">
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground" onClick={() => { navigator.clipboard.writeText(msg.content); toast.success('Copied'); }}>
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground">
                        <ThumbsUp className="h-3 w-3 mr-1" /> Helpful
                      </Button>
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex gap-3">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 text-sm text-muted-foreground">
                Thinking...
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border/50 shrink-0">
          <div className="flex gap-2">
            <Textarea
              placeholder="Ask about campaigns, ad copy, targeting, performance..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="resize-none min-h-[44px] max-h-[120px] rounded-xl"
              rows={1}
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="shrink-0 rounded-xl h-[44px] w-[44px]"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Sidebar with quick context */}
      <div className="space-y-4 hidden lg:block">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Quick Topics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {[
              'Campaign Structure',
              'Ad Copy Formulas',
              'Audience Strategy',
              'Budget Planning',
              'Creative Testing',
              'Scaling Rules',
              'Retargeting Setup',
              'Lead Form Best Practices',
            ].map((topic) => (
              <button
                key={topic}
                onClick={() => sendMessage(`Explain ${topic.toLowerCase()} for Meta ads`)}
                className="w-full text-left text-xs py-1.5 px-2 rounded-md hover:bg-muted/50 text-foreground transition-colors"
              >
                {topic}
              </button>
            ))}
          </CardContent>
        </Card>

        {trainerMode && (
          <Card className="border-green-500/20 bg-green-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-green-500 flex items-center gap-1">
                <GraduationCap className="h-3 w-3" /> Trainer Tips
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[11px] text-muted-foreground space-y-2">
              <p>• Ask "explain ___" to learn any concept</p>
              <p>• Ask "what mistakes do beginners make with ___?"</p>
              <p>• Ask "walk me through ___"</p>
              <p>• The AI will explain its reasoning in detail</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
