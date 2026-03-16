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
  return [
    {
      section: '📞 STU25 Cold Call Script',
      lines: [''],
    },
    {
      section: '🚪 PRE-STEP 1 — Immediate Owner Request',
      lines: [
        'As soon as someone answers:',
        '',
        '"Hey — can you put me through to the owner real quick?"',
        '',
        '(Pause.)',
      ],
    },
    {
      section: '❓ PRE-STEP 2 — If They Ask "Who\'s Calling?"',
      lines: [
        'Keep it short. Do not explain anything.',
        '',
        '"It\'s something meant specifically for the owner."',
        '"Just put me through to them real quick."',
      ],
    },
    {
      section: '🔒 PRE-STEP 3 — If They Ask "What Is This Regarding?"',
      lines: [
        'Still no pitch.',
        '',
        '"It\'ll make more sense once I speak with the owner directly."',
        '"Can you connect me?"',
      ],
    },
    {
      section: '📵 PRE-STEP 4 — If They Say "Owner Isn\'t Available"',
      lines: [
        'Now your only objective is to collect a callback window.',
        '',
        '"No problem."',
        '"When\'s the best time to reach them directly?"',
        '',
        '(Pause.)',
      ],
    },
    {
      section: '✅ PRE-STEP 5 — Lock the Callback Time',
      lines: [
        'Once they answer:',
        '',
        '"Perfect."',
        '"I\'ll call back around that time."',
        '',
        'Then hang up.',
        '',
        'Your caller now logs:',
        '• Owner name (if known)',
        '• Best callback window',
        '• Business name',
        '• Lead status: Owner Callback',
      ],
    },
    {
      section: '🎯 Important Call Behavior',
      lines: [
        'The caller should:',
        '• Never pitch to staff',
        '• Never explain the offer',
        '• Only gather callback timing',
        '• Keep the conversation under 20 seconds',
        '',
        'The gatekeeper\'s job is to filter sales calls,',
        'so the less information you give them,',
        'the less reason they have to block you.',
      ],
    },
    {
      section: '⚡ Extra Line That Often Works',
      lines: [
        'If they keep asking questions:',
        '',
        '"Look, I\'d rather just speak to them directly about it."',
        '',
        'Then repeat:',
        '',
        '"When\'s the best time to reach them?"',
      ],
    },
    // ── OWNER ON THE PHONE ──
    {
      section: '━━━ OWNER ON THE PHONE ━━━',
      lines: [''],
    },
    {
      section: '📞 Step 1 — Get the Decision Maker',
      lines: [
        '"Hey, is this the owner?"',
        '',
        'If yes:',
        '"Perfect. Who am I speaking with?"',
        '',
        'If they ask who you are first:',
        '"This is Warren with STU25."',
      ],
    },
    {
      section: '🛡️ Step 2 — Disarming Opener',
      lines: [
        '"Hey [Name], I\'m gonna be upfront with you real quick."',
        '"This may honestly be a good use of my time… or a complete waste of it."',
        '',
        '(pause a second — this usually makes them curious)',
      ],
    },
    {
      section: '🚫 Step 3 — Position Yourself as NOT Selling',
      lines: [
        '"I\'m not trying to sell you any shit, so don\'t worry about that."',
        '',
        '"I actually spent a few hours messing around with some AI tools and built a website specifically for your business."',
      ],
    },
    {
      section: '🎨 Step 4 — Personalization',
      lines: [
        '"I pulled some of the photos and info from your Craigslist ad and used that to design everything."',
        '',
        '"So it\'s literally customized around your business already."',
      ],
    },
    {
      section: '🎁 Step 5 — Remove Resistance',
      lines: [
        '"I\'m not selling the site to you."',
        '"I\'ll actually give it to you for free."',
      ],
    },
    {
      section: '💰 Step 6 — Introduce the Money Angle',
      lines: [
        '"The only reason I\'m calling is because I figured we might be able to make some money together off it."',
      ],
    },
    {
      section: '📧 Step 7 — Simple Ask',
      lines: [
        '"Would you be open if I just emailed it to you so you can take a look?"',
      ],
    },
    {
      section: '🤝 Step 8 — Close',
      lines: [
        '"And if you actually like it, my partner and I can hop on a quick call and show you how we\'d get it live for you and how the revenue split works."',
      ],
    },
    {
      section: '🔑 Delivery Tips',
      lines: [
        'When reading this:',
        '• Speak slow and relaxed',
        '• Act like you might hang up at any moment',
        '• Don\'t sound like a salesperson',
        '• Sound like a guy with an opportunity',
        '',
        'The magic line is:',
        '"This might be a waste of my time."',
        'It disarms the business owner immediately.',
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
