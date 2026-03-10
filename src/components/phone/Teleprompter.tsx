import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { Play, Pause, RotateCcw, Minus, Plus, ChevronUp, ChevronDown, X, GripHorizontal, Pencil, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface TeleprompterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: any | null;
}

function buildScript(lead: any | null, competitors: string[]): { section: string; lines: string[] }[] {
  // Extract business context from lead
  const meta = lead?.meta && typeof lead.meta === 'object' ? lead.meta : {};
  const metaCategories: string[] = meta.yelp_categories || meta.gmaps_categories || [];
  // Use specific niche from meta only — never broad category like "brick-and-mortar" or status like "potential"
  const industry = metaCategories[0] || meta.category_name || '';

  return [
    {
      section: '🚪 GATEKEEPER BYPASS (Owner Only)',
      lines: [
        '── FIRST CONTACT ──',
        'Is the owner available?',
        '',
        '── IF THEY ASK "WHO IS THIS?" ──',
        'Are you the owner?',
        '',
        '── IF THEY SAY NO ──',
        'Put me through to the owner.',
        '',
        '── IF THEY ASK AGAIN WHO YOU ARE ──',
        'Just connect me with the owner.',
        '',
        '── IF THEY ASK WHAT IT\'S ABOUT ──',
        "It's for the owner. Go ahead and connect me.",
        '',
        '── TONE ──',
        '• calm',
        '• direct',
        '• confident',
        '• slightly impatient',
        '',
        'No explaining.',
        'No pitching.',
        'No conversations with gatekeepers.',
        '',
        'Just redirect to the owner every time.',
      ],
    },
    {
      section: '🔥 GURU Enterprise – SWERVE Style Cold Script',
      lines: [],
    },
    {
      section: '1️⃣ Find the Owner',
      lines: [
        'Quick question —',
        'are you the owner of the business',
        'or do you help manage the page?',
      ],
    },
    {
      section: '2️⃣ Once Owner Confirms',
      lines: [
        'Alright cool.',
        '',
        "Let me be up front with you,",
        "and I'm gonna take a second of your time.",
        '',
        "If you don't like what I say,",
        'you can hang up respectfully —',
        'no hard feelings.',
      ],
    },
    {
      section: '3️⃣ Straightforward Hook',
      lines: [
        "Here's the deal.",
        '',
        "You're either going to make",
        'a lot more money working with us,',
        "or this won\'t make sense",
        'and we both move on.',
        '',
        "Either way, I'm not here",
        'to waste your time.',
      ],
    },
    {
      section: '4️⃣ Competitor Positioning (Early Authority)',
      lines: competitors.length > 0
        ? [
            'Full transparency —',
            "we're already working with",
            'a few businesses in your space like:',
            '',
            ...competitors.slice(0, 3).map(c => `• ${c}`),
            '',
            "So we're already seeing",
            "what's actually working",
            'in your market right now.',
          ]
        : [
            'Full transparency —',
            "we're already working with",
            'a few businesses in your space.',
            '',
            "So we're already seeing",
            "what's actually working",
            'in your market right now.',
          ],
    },
    {
      section: '5️⃣ What You Do',
      lines: [
        'Me and my partner Warren',
        'from GURU Enterprise',
        'basically do three things:',
        '',
        '• run ads that bring in customers',
        '• fix every mistake on your website and social media',
        '• install AI systems that run your digital presence 24/7',
        '',
        "If we don't improve results…",
        "you don\'t pay.",,
      ],
    },
    {
      section: '6️⃣ Position Warren',
      lines: [
        'Just so you know how we work —',
        '',
        'I handle the front end',
        'talking with business owners,',
        'and Warren is the brain',
        'behind the systems —',
        'the ads, AI automation,',
        'and the backend that actually',
        'drives results.',
      ],
    },
    {
      section: '7️⃣ Engagement Question',
      lines: [
        'Let me ask you something —',
        '',
        "Who's currently managing",
        'your ads, website,',
        'and social media growth',
        'right now?',
      ],
    },
    {
      section: '8️⃣ Control the Frame',
      lines: [
        '── IF NO ONE / THEMSELVES ──',
        '',
        "Yeah… that's what we see",
        'most of the time.',
        '',
        '── IF AN AGENCY ──',
        '',
        'Got it. A lot of the businesses',
        'we work with said the same thing',
        'before we stepped in.',
      ],
    },
    {
      section: '9️⃣ Close for Meeting',
      lines: [
        'Look —',
        'the easiest way to see',
        'if this makes sense is',
        'a quick Zoom call with me and Warren.',
        '',
        "He'll look at what you've got running",
        "and show you what we'd fix",
        'to bring in more customers.',
      ],
    },
    {
      section: '🔟 Command Close',
      lines: [
        'It takes about 15 minutes.',
        '',
        'Are you free later today or tomorrow?',
      ],
    },
  ];
}

export function Teleprompter({ open, onOpenChange, lead }: TeleprompterProps) {
  const [competitors, setCompetitors] = useState<string[]>([]);

  // Fetch competitors from CRM matching the lead's specific niche (not broad category)
  useEffect(() => {
    if (!open || !lead) { setCompetitors([]); return; }

    // Get the lead's specific niche industries from meta
    const meta = lead?.meta && typeof lead.meta === 'object' ? lead.meta : {};
    const metaCategories: string[] = meta.yelp_categories || meta.gmaps_categories || [];
    // Use specific niche keywords (e.g. "Dentists", "General Dentistry") — NOT broad category like "brick-and-mortar"
    const nicheKeywords = metaCategories.map((c: string) => c.toLowerCase());

    if (nicheKeywords.length === 0) { setCompetitors([]); return; }

    const leadId = lead?.id;

    supabase
      .from('customers')
      .select('company, full_name, meta')
      .neq('id', leadId)
      .limit(200)
      .then(({ data }) => {
        const names = (data || [])
          .filter(c => {
            const cMeta = c.meta && typeof c.meta === 'object' ? c.meta as Record<string, any> : {};
            const cCats: string[] = (cMeta.yelp_categories || cMeta.gmaps_categories || [])
              .map((cat: string) => cat.toLowerCase());
            // Must share at least one specific niche category
            return nicheKeywords.some(nk => cCats.some(cc => cc.includes(nk) || nk.includes(cc)));
          })
          .map(c => c.company || c.full_name)
          .filter(Boolean) as string[];
        setCompetitors(names.slice(0, 3));
      });
  }, [open, lead]);

  const script = buildScript(lead, competitors);
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

  // Draggable state
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const onDragStart = useCallback((e: React.MouseEvent) => {
    draggingRef.current = true;
    dragStartRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      setPos({ x: ev.clientX - dragStartRef.current.x, y: ev.clientY - dragStartRef.current.y });
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  // Reset position on open
  useEffect(() => {
    if (open) setPos({ x: 0, y: 0 });
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" onClick={() => onOpenChange(false)}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="absolute top-1/2 left-1/2 w-[700px] max-w-[95vw] max-h-[90vh] rounded-lg overflow-hidden border border-primary/30 bg-black shadow-2xl"
        style={{ transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — draggable */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-primary/20 bg-black cursor-grab active:cursor-grabbing select-none"
          onMouseDown={onDragStart}
        >
          <div className="flex items-center gap-2 min-w-0">
            <GripHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-primary font-mono text-sm font-bold">📟 TELEPROMPTER</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">Lead: <span className="text-foreground font-medium">{businessName}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setFontSize(f => Math.max(16, f - 2))}>
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground font-mono w-8 text-center">{fontSize}</span>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setFontSize(f => Math.min(48, f + 2))}>
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
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
            const safeLine = line ?? '';
            const isSection = safeLine.startsWith('──');
            return (
              <p
                key={i}
                className={cn(
                  'leading-relaxed transition-colors text-center',
                  isSection
                    ? 'text-primary font-bold uppercase tracking-wider mt-8 mb-4'
                    : safeLine === ''
                    ? 'h-4'
                    : 'text-white font-medium mb-2'
                )}
                style={{ fontSize: isSection ? fontSize * 0.55 : fontSize }}
              >
                {safeLine}
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
              min={5}
              max={200}
              step={1}
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
      </div>
    </div>
  );
}
