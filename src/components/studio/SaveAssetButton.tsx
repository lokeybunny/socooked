import { Bookmark, BookmarkCheck, Loader2, Trash2 } from 'lucide-react';
import { useSavedAsset, SaveAssetMeta } from '@/lib/studio/savedAssets';
import { cn } from '@/lib/utils';

interface Props extends SaveAssetMeta {
  url?: string | null;
  className?: string;
  size?: 'sm' | 'md';
  /** When true, shows a separate trash button while saved. Default: toggle in one button. */
  withDelete?: boolean;
}

export function SaveAssetButton({ url, className, size = 'sm', withDelete, ...meta }: Props) {
  const { saved, busy, toggle, remove } = useSavedAsset(url, meta);
  if (!url) return null;
  const dim = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  const pad = size === 'sm' ? 'p-1.5' : 'p-2';

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        disabled={busy}
        title={saved ? 'Saved to library' : 'Save to library'}
        className={cn(
          'rounded-md bg-black/80 backdrop-blur border transition disabled:opacity-50',
          pad,
          saved
            ? 'border-emerald-400/60 text-emerald-300 hover:bg-emerald-400/15'
            : 'border-white/20 text-white/70 hover:border-yellow-400/50 hover:text-yellow-300',
        )}
      >
        {busy ? <Loader2 className={cn(dim, 'animate-spin')} />
          : saved ? <BookmarkCheck className={dim} />
          : <Bookmark className={dim} />}
      </button>
      {withDelete && saved && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); remove(); }}
          disabled={busy}
          title="Delete from library"
          className={cn(
            'rounded-md bg-black/80 backdrop-blur border border-red-500/40 text-red-300 hover:bg-red-500/15 disabled:opacity-50',
            pad,
          )}
        >
          <Trash2 className={dim} />
        </button>
      )}
    </div>
  );
}
