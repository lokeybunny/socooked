import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { Play, Pause, RotateCcw, Minus, Plus, ChevronUp, ChevronDown } from 'lucide-react';

interface TeleprompterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: any | null;
}

function buildScript(lead: any | null): { section: string; lines: string[] }[] {
  // Extract business context from lead
  const businessName = lead?.company || lead?.full_name || 'your business';
  const meta = lead?.meta && typeof lead.meta === 'object' ? lead.meta : {};
  const categories: string[] = meta.yelp_categories || meta.gmaps_categories || [];
  const industry = categories[0] || meta.category_name || lead?.category || '';
  const notes = lead?.notes || '';
  const rating = meta.yelp_rating || meta.gmaps_rating || null;
  const reviewCount = meta.yelp_review_count || meta.gmaps_review_count || null;
  const website = meta.website || null;

  // Build a business-aware intro snippet
  let bizContext = '';
  if (industry) {
    bizContext = `I see you're in the ${industry} space`;
    if (rating) bizContext += ` — ${rating}★ on ${meta.yelp_rating ? 'Yelp' : 'Google'}`;
    if (reviewCount) bizContext += ` with ${reviewCount} reviews`;
    bizContext += '.';
  }

  return [
    {
      section: '1️⃣ FIND THE OWNER',
      lines: [
        'Hey quick question —',
        'are you the owner of this business',
        'or do you help manage the page?',
      ],
    },
    {
      section: '2️⃣ IF THEY ARE THE OWNER',
      lines: [
        'Nice. Let me ask you something straight —',
        'is the business making good money right now',
        'or struggling a bit?',
        '',
        '── ALTERNATIVE ──',
        'Respect. Quick question —',
        'is the business doing well financially',
        'right now or are you trying to grow it?',
        '',
        '── ULTRA-DIRECT ──',
        'Straight up —',
        'is the business printing money right now',
        'or are you trying to make it grow?',
      ],
    },
    {
      section: '3️⃣ IF DOING WELL',
      lines: [
        'Good. That usually means',
        "there's room to scale even more.",
        '',
        'Out of curiosity —',
        "what's currently bringing you",
        'most of your customers?',
      ],
    },
    {
      section: '4️⃣ IF SLOW / STRUGGLING',
      lines: [
        'Appreciate the honesty.',
        'Most businesses we talk to',
        'say the same thing.',
        '',
        'Usually it comes down to',
        'lead flow or visibility online.',
        '',
        "What's currently bringing you",
        'most of your customers?',
      ],
    },
    {
      section: '5️⃣ TRANSITION — GURU ENTERPRISE',
      lines: [
        'Got it.',
        ...(bizContext ? [bizContext, ''] : []),
        'I work with GURU Enterprise',
        'by Warren Guru',
        'and we help businesses install systems',
        'that bring in consistent leads',
        'from their website and social media.',
        '',
        'Not just posts —',
        'actual customer inquiries.',
        ...(industry ? [
          '',
          `For ${industry} businesses like yours,`,
          'we typically focus on',
          'local search visibility,',
          'review generation,',
          'and direct lead capture.',
        ] : []),
      ],
    },
    {
      section: '6️⃣ QUALIFICATION',
      lines: [
        'Quick thing though —',
        'we only work with owners',
        'who are serious about growth.',
        '',
        'If the strategy actually made sense,',
        'would you be open to investing',
        'in scaling the business?',
      ],
    },
    {
      section: '7️⃣ BOOK THE CALL',
      lines: [
        'Perfect.',
        '',
        'Best move is a quick',
        '15-minute strategy call with Warren',
        'so he can look at what you\'re doing',
        'and show you what we\'d change.',
        '',
        'Grab a time here:',
        '[Send Calendar Link]',
      ],
    },
  ];
}

export function Teleprompter({ open, onOpenChange, lead }: TeleprompterProps) {
  const script = buildScript(lead);
  const allLines = script.flatMap(s => [
    `── ${s.section} ──`,
    ...s.lines,
    '', // gap between sections
  ]);

  const [scrollSpeed, setScrollSpeed] = useState(35); // pixels per second
  const [isPlaying, setIsPlaying] = useState(false);
  const [fontSize, setFontSize] = useState(28);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const animate = useCallback((timestamp: number) => {
    if (!containerRef.current) return;
    if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
    const delta = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;
    containerRef.current.scrollTop += scrollSpeed * delta;
    animRef.current = requestAnimationFrame(animate);
  }, [scrollSpeed]);

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = 0;
      animRef.current = requestAnimationFrame(animate);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, animate]);

  const reset = () => {
    setIsPlaying(false);
    if (containerRef.current) containerRef.current.scrollTop = 0;
  };

  // Reset on open
  useEffect(() => {
    if (open) {
      setIsPlaying(false);
      setTimeout(() => {
        if (containerRef.current) containerRef.current.scrollTop = 0;
      }, 50);
    }
  }, [open]);

  const businessName = lead?.company || lead?.full_name || 'Unknown';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] p-0 gap-0 overflow-hidden bg-black border-primary/30">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-primary/20 bg-black">
          <div className="min-w-0">
            <DialogHeader>
              <DialogTitle className="text-primary font-mono text-sm">📟 TELEPROMPTER</DialogTitle>
            </DialogHeader>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">Lead: <span className="text-foreground font-medium">{businessName}</span></p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setFontSize(f => Math.max(16, f - 2))}>
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground font-mono w-8 text-center">{fontSize}</span>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setFontSize(f => Math.min(48, f + 2))}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Prompter area */}
        <div
          ref={containerRef}
          className="overflow-y-auto px-8 py-16 bg-black"
          style={{ height: '55vh' }}
        >
          {/* Top padding so text starts centered */}
          <div style={{ height: '30vh' }} />
          {allLines.map((line, i) => {
            const isSection = line.startsWith('──');
            const isAlt = line.startsWith('── ALT') || line.startsWith('── ULTRA');
            return (
              <p
                key={i}
                className={cn(
                  'leading-relaxed transition-colors text-center',
                  isSection
                    ? 'text-primary font-bold uppercase tracking-wider mt-8 mb-4'
                    : line === ''
                    ? 'h-4'
                    : 'text-white font-medium mb-2'
                )}
                style={{ fontSize: isSection ? fontSize * 0.55 : fontSize }}
              >
                {line}
              </p>
            );
          })}
          {/* Bottom padding */}
          <div style={{ height: '50vh' }} />
        </div>


        {/* Controls */}
        <div className="flex items-center gap-4 px-4 py-3 border-t border-primary/20 bg-black">
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0 rounded-full border border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={reset}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <div className="flex-1 flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground font-mono shrink-0">SLOW</span>
            <Slider
              value={[scrollSpeed]}
              onValueChange={([v]) => setScrollSpeed(v)}
              min={10}
              max={120}
              step={5}
              className="flex-1"
            />
            <span className="text-[10px] text-muted-foreground font-mono shrink-0">FAST</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => { if (containerRef.current) containerRef.current.scrollTop -= 80; }}>
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => { if (containerRef.current) containerRef.current.scrollTop += 80; }}>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
