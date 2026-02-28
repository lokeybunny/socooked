import { useState } from 'react';
import { cn } from '@/lib/utils';
import CortexTerminal from './CortexTerminal';
import { Sparkles } from 'lucide-react';

const AI_TABS = [
  { id: 'nanob', label: 'NanoB', hint: 'Gemini image generation & editing', placeholder: 'generate a hero banner for a tech startup…' },
  { id: 'banana2', label: 'Banana2', hint: 'Gemini 3 Pro image generation', placeholder: 'a photorealistic portrait in golden hour light…' },
  { id: 'kling3', label: 'Kling3', hint: 'Video generation (coming soon)', placeholder: 'create a 5s product reveal animation…' },
  { id: 'seed2', label: 'Seed2', hint: 'Seed-based generation (coming soon)', placeholder: 'generate variations from seed…' },
] as const;

export default function AIGenerationTerminal() {
  const [activeTab, setActiveTab] = useState<string>(AI_TABS[0].id);
  const tab = AI_TABS.find(t => t.id === activeTab)!;

  return (
    <div className="mt-6 border border-border/50 rounded-lg bg-[hsl(var(--card))] overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-0">
        <Sparkles className="h-3.5 w-3.5 text-primary mr-1" />
        <span className="text-xs font-semibold text-foreground/80 mr-3 font-mono">AI Generation</span>
        {AI_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'px-3 py-1.5 text-xs font-mono rounded-t-md transition-colors',
              activeTab === t.id
                ? 'bg-primary/15 text-primary font-semibold border border-b-0 border-border/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Active terminal */}
      <CortexTerminal
        key={activeTab}
        module="ai-generation"
        subModule={tab.id}
        label={`AI · ${tab.label}`}
        hint={tab.hint}
        placeholder={tab.placeholder}
        edgeFunction="clawd-bot"
      />
    </div>
  );
}
