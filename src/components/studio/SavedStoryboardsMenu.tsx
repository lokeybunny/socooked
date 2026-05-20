import { useEffect, useState } from 'react';
import { Bookmark, Trash2, FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import {
  listSavedStoryboards, deleteSavedStoryboard, SavedStoryboard,
} from '@/lib/studio/savedStoryboards';

interface Props {
  onLoad: (s: SavedStoryboard) => void;
  refreshKey?: number; // bump to force re-read after saves
}

export function SavedStoryboardsMenu({ onLoad, refreshKey }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SavedStoryboard[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) setItems(listSavedStoryboards());
  }, [open, refreshKey]);

  const handleDelete = (id: string, name: string) => {
    deleteSavedStoryboard(id);
    setItems(listSavedStoryboards());
    toast({ title: 'Deleted', description: name });
  };

  const handleLoad = (s: SavedStoryboard) => {
    setLoadingId(s.id);
    try {
      onLoad(s);
      setOpen(false);
      toast({ title: 'Storyboard restored', description: s.name });
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs bg-black/40 border-white/10 hover:border-yellow-400/40"
          title="Saved storyboards"
        >
          <Bookmark className="w-3 h-3" /> Saved
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[340px] p-2 bg-zinc-950 border-yellow-400/20"
      >
        <div className="text-[10px] uppercase tracking-[0.2em] text-yellow-300/80 px-2 py-1.5">
          Saved Storyboards
        </div>
        {items.length === 0 ? (
          <div className="text-xs text-white/40 px-3 py-6 text-center">
            No saved storyboards yet.<br />
            Use the <span className="text-yellow-300">Save</span> button at the bottom to freeze a session.
          </div>
        ) : (
          <div className="space-y-1 max-h-[55vh] overflow-y-auto">
            {items.map((s) => {
              const shotCount = Array.isArray((s.payload as any)?.shots)
                ? (s.payload as any).shots.length : 0;
              const hasPoster = !!(s.payload as any)?.posterUrl;
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-2 px-2 py-2 rounded hover:bg-yellow-400/5 border border-transparent hover:border-yellow-400/20 group"
                >
                  <button
                    type="button"
                    onClick={() => handleLoad(s)}
                    className="flex-1 text-left"
                    disabled={loadingId === s.id}
                  >
                    <div className="text-sm text-white/90 font-medium truncate">{s.name}</div>
                    <div className="text-[10px] text-white/40 font-mono">
                      {shotCount} shot{shotCount === 1 ? '' : 's'}
                      {hasPoster && ' · poster'}
                      {' · '}
                      {new Date(s.savedAt).toLocaleString()}
                    </div>
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleLoad(s)}
                    disabled={loadingId === s.id}
                    className="h-7 px-2 text-yellow-300 hover:bg-yellow-400/10"
                    title="Load"
                  >
                    {loadingId === s.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <FolderOpen className="w-3 h-3" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(s.id, s.name)}
                    className="h-7 px-2 text-red-400 hover:bg-red-500/10"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
