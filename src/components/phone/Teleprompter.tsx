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

function buildScript(lead: any | null, _competitors: string[]): { section: string; lines: string[] }[] {
  const businessName = lead?.company || lead?.full_name || 'the business';
  const ownerName = lead?.full_name ? lead.full_name.split(' ')[0] : '[Prospect\'s Name]';
  const yourName = '[Your Name]';
  const companyName = '[Your Company Name]';

  return [
    {
      section: '🚪 1. Gatekeeper / Confirmation',
      lines: [
        '"Hi, this is ' + yourName + ' with ' + companyName + '. I\'m trying to reach the owner / decision-maker for ' + businessName + ' — is that you, or is there someone else who handles growth / marketing?"',
        '',
        '(Once confirmed → proceed)',
      ],
    },
    {
      section: '🔥 2. Opener / Pattern Interrupt',
      lines: [
        '"Hi ' + ownerName + ', this is ' + yourName + ' with ' + companyName + '. Quick question — am I speaking with the owner or the main decision-maker?"',
        '',
        '(Wait for yes →)',
        '',
        '"Great! Alright ' + ownerName + ', I\'ve got some good news and some bad news for you. Which do you want first?"',
        '',
        '(They almost always pick "bad news" — curiosity wins. If they pick good news:)',
        '"Haha okay, but the bad news sets up the good one perfectly — you sure?"',
        '',
        '(Usually flips them.)',
      ],
    },
    {
      section: '😏 3. Bad News Reveal',
      lines: [
        '"The bad news is... we\'re going to make a lot of money together. Unfortunately... I have to prove it to you first."',
        '',
        '(Pause for 1-2 seconds. Let it land.)',
        '',
        'TONE: Playful, not serious. Big grin/smile in your voice.',
        'The joke flips "bad news" into something positive —',
        'you sound confident and non-salesy.',
      ],
    },
    {
      section: '✨ 4. Immediate Pivot to Good News',
      lines: [
        '"Haha, but seriously — the good news is I can help get your business hundreds of high-quality, real reviews that actually show up and drive more customers, turn those into steady leads, and I\'ll even build you a sharp, modern website completely free — no cost, no strings upfront."',
        '',
        '"We\'re not here to take your money today. This is a partnership play: We bring in quality leads through our system (it\'s pretty dialed-in for businesses like yours), you get the reviews, traffic, and site boost... and if it works (which we prove fast), we both make money as things grow. I just handle the heavy lifting on the front end for free to show you."',
        '',
        '"Sound like something worth hearing more about?"',
        '',
        '(Wait for response — most will say "Prove it how?" or "What\'s the catch?")',
      ],
    },
    {
      section: '🤝 5. Explain Free Value / Partnership',
      lines: [
        '"Exactly — no catch on the upfront side. We create the reviews momentum, optimize or build the free site to capture leads better, and in exchange (only if you\'re seeing results), we get to follow up with some of the new customers we help bring in — with your full approval — to keep the review flywheel spinning and the leads coming."',
        '',
        '"We\'ve got a system that\'s been crushing it for similar local/service businesses — flawless lead gen without the usual ad spend headaches."',
        '',
        '"But I don\'t want to explain it all on this call — I\'d rather show you quick examples and walk through how we\'d prove it for your business specifically."',
      ],
    },
    {
      section: '📅 6. Transition to Next Step',
      lines: [
        '"So here\'s the deal: Let\'s hop on a quick 15-minute Zoom — I\'ll show you real results from partners, how we start with zero cost to you, and if it doesn\'t look like a slam-dunk win for both of us, we part friends, no hard feelings."',
        '',
        '"Totally no pressure, just value to see if we\'re a fit."',
        '',
        '"You open to that? What\'s your schedule like — maybe tomorrow or Wednesday afternoon work?"',
        '',
        '── HANDLE OBJECTIONS ──',
        '',
        '"What\'s the proof?"',
        '→ "That\'s why the 15 min — I\'ll show before/afters and exactly how we prove it works for you first."',
        '',
        '"Sounds too good"',
        '→ "Haha, that\'s the \'bad news\' part — I gotta back it up! But yeah, that\'s why we start free."',
      ],
    },
    {
      section: '🎯 7. Close / Confirmation',
      lines: [
        '"Awesome! I\'ll shoot over a calendar link for [time]. Looking forward to making some money together, ' + ownerName + '. Talk soon!"',
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
  const baseLines = script.flatMap(s => [
    `── ${s.section} ──`,
    ...s.lines,
    '', // gap between sections
  ]);

  // Session-editable lines
  const [editMode, setEditMode] = useState(false);
  const [editedLines, setEditedLines] = useState<string[] | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // Reset edits when lead changes
  useEffect(() => { setEditedLines(null); }, [lead]);

  const allLines = editedLines ?? baseLines;

  const handleLineClick = (idx: number) => {
    if (!editMode) return;
    setIsPlaying(false);
    setEditingIdx(idx);
    setTimeout(() => editInputRef.current?.focus(), 30);
  };

  const commitEdit = (idx: number, value: string) => {
    const updated = [...allLines];
    updated[idx] = value;
    setEditedLines(updated);
    setEditingIdx(null);
  };

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
    <div
      className="fixed z-50 w-[700px] max-w-[95vw] max-h-[90vh] rounded-lg overflow-hidden border border-primary/30 bg-black shadow-2xl"
      style={{
        top: `calc(50% + ${pos.y}px)`,
        left: `calc(50% + ${pos.x}px)`,
        transform: 'translate(-50%, -50%)',
      }}
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
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-8 w-8 p-0", editMode ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground")}
              onClick={() => { setEditMode(!editMode); setEditingIdx(null); }}
              title={editMode ? "Done editing" : "Edit script"}
            >
              {editMode ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
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
            const isEditing = editingIdx === i;

            if (isEditing) {
              return (
                <div key={i} className="mb-2 flex justify-center">
                  <textarea
                    ref={editInputRef}
                    defaultValue={safeLine}
                    className="w-full max-w-[90%] bg-white/10 text-white border border-primary/40 rounded px-3 py-2 text-center font-medium resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                    style={{ fontSize }}
                    rows={Math.max(1, Math.ceil(safeLine.length / 40))}
                    onBlur={(e) => commitEdit(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(i, (e.target as HTMLTextAreaElement).value); }
                      if (e.key === 'Escape') setEditingIdx(null);
                    }}
                  />
                </div>
              );
            }

            return (
              <p
                key={i}
                className={cn(
                  'leading-relaxed transition-colors text-center',
                  isSection
                    ? 'text-primary font-bold uppercase tracking-wider mt-8 mb-4'
                    : safeLine === ''
                    ? 'h-4'
                    : 'text-white font-medium mb-2',
                  editMode && !isSection && safeLine !== '' && 'cursor-pointer hover:bg-white/5 rounded px-2 py-0.5'
                )}
                style={{ fontSize: isSection ? fontSize * 0.55 : fontSize }}
                onClick={() => handleLineClick(i)}
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
  );
}
