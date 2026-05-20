import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle, ExternalLink, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { getCachedRehost, setCachedRehost } from '@/lib/studio/imageRehostCache';

interface SmartImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  /** Called whenever we successfully swap the rendered URL (e.g. after rehost). */
  onResolved?: (url: string) => void;
}

interface DebugInfo {
  originalUrl: string;
  hostedUrl?: string;
  rehosted: boolean;
  probeStatus: number;
  probeOk: boolean;
  probeHeaders: Record<string, string>;
  error?: string;
}

/**
 * Renders an <img>. On browser load failure (CORS, forced-download, expired URL,
 * etc.), automatically asks story-composer/image-rehost to re-fetch the bytes
 * server-side and re-host them in the public studio-outputs bucket, then swaps
 * the rendered src. If both the original and the rehosted URL still fail, an
 * on-screen debug overlay is shown with the failing URL, response headers, and
 * a retry button.
 */
export function SmartImage({ src, alt, className, loading = 'lazy', onResolved }: SmartImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [phase, setPhase] = useState<'loading' | 'ok' | 'rehosting' | 'failed'>('loading');
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const attemptedRehost = useRef<Set<string>>(new Set());

  // Reset when src prop changes
  useEffect(() => {
    setCurrentSrc(src);
    setPhase('loading');
    setDebug(null);
    attemptedRehost.current = new Set();
  }, [src]);

  const callRehost = async (url: string) => {
    setPhase('rehosting');
    attemptedRehost.current.add(url);
    try {
      const { data, error } = await supabase.functions.invoke('story-composer/image-rehost', {
        body: { url },
      });
      if (error) throw new Error(error.message || 'rehost invocation failed');
      const d = data as DebugInfo & { imageUrl?: string };
      if (d?.imageUrl && d.imageUrl !== url) {
        setDebug({
          originalUrl: d.originalUrl ?? url,
          hostedUrl: d.imageUrl,
          rehosted: !!d.rehosted,
          probeStatus: d.probeStatus ?? 0,
          probeOk: !!d.probeOk,
          probeHeaders: d.probeHeaders ?? {},
        });
        setCurrentSrc(d.imageUrl);
        setPhase('loading');
        return;
      }
      // Rehost returned same URL (or failed silently) — surface the debug overlay
      setDebug({
        originalUrl: url,
        hostedUrl: d?.imageUrl,
        rehosted: false,
        probeStatus: d?.probeStatus ?? 0,
        probeOk: !!d?.probeOk,
        probeHeaders: d?.probeHeaders ?? {},
        error: d?.error || 'Rehost returned the same URL — bucket upload likely failed.',
      });
      setPhase('failed');
    } catch (e) {
      setDebug({
        originalUrl: url,
        rehosted: false,
        probeStatus: 0,
        probeOk: false,
        probeHeaders: {},
        error: (e as Error).message,
      });
      setPhase('failed');
    }
  };

  const handleError = () => {
    if (!attemptedRehost.current.has(currentSrc)) {
      void callRehost(currentSrc);
    } else {
      setPhase((p) => (p === 'failed' ? p : 'failed'));
    }
  };

  const retry = () => {
    setDebug(null);
    setPhase('loading');
    attemptedRehost.current = new Set();
    // Force <img> reload by appending a cache-buster
    const bust = src.includes('?') ? '&' : '?';
    setCurrentSrc(`${src}${bust}_retry=${Date.now()}`);
  };

  if (phase === 'failed' && debug) {
    return (
      <div className={`relative ${className || ''} bg-zinc-950 border border-red-500/40 rounded-lg p-3 overflow-auto`}>
        <div className="flex items-center gap-2 text-red-300 text-xs font-semibold mb-2">
          <AlertTriangle className="w-4 h-4" />
          Image failed to render
        </div>
        <div className="space-y-2 text-[10px] font-mono text-white/80 max-h-[60vh] overflow-y-auto">
          <div>
            <span className="text-yellow-300/80">URL: </span>
            <a
              href={debug.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-300 hover:underline break-all"
            >
              {debug.originalUrl}
            </a>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(debug.originalUrl)}
              className="ml-1 inline-flex items-center text-white/40 hover:text-white"
              title="Copy URL"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
          {debug.hostedUrl && debug.hostedUrl !== debug.originalUrl && (
            <div>
              <span className="text-yellow-300/80">Rehosted: </span>
              <a href={debug.hostedUrl} target="_blank" rel="noreferrer" className="text-blue-300 hover:underline break-all">
                {debug.hostedUrl}
              </a>
            </div>
          )}
          <div>
            <span className="text-yellow-300/80">Probe status: </span>
            <span className={debug.probeOk ? 'text-green-300' : 'text-red-300'}>
              {debug.probeStatus || 'n/a'}
            </span>
          </div>
          {debug.error && (
            <div className="text-red-300/90">Error: {debug.error}</div>
          )}
          {Object.keys(debug.probeHeaders).length > 0 && (
            <details className="bg-black/40 border border-white/10 rounded p-2">
              <summary className="text-yellow-300/80 cursor-pointer">Response headers ({Object.keys(debug.probeHeaders).length})</summary>
              <pre className="mt-2 whitespace-pre-wrap break-all text-white/70 text-[10px] leading-relaxed">
{Object.entries(debug.probeHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')}
              </pre>
            </details>
          )}
        </div>
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="outline" onClick={retry} className="h-7 text-[11px] gap-1 border-yellow-400/40 text-yellow-300 hover:bg-yellow-400/10">
            <RefreshCw className="w-3 h-3" /> Retry
          </Button>
          <a href={debug.originalUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 border-white/20 text-white/80">
              <ExternalLink className="w-3 h-3" /> Open original
            </Button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <img
        src={currentSrc}
        alt={alt}
        loading={loading}
        className={className}
        onLoad={() => {
          setPhase('ok');
          onResolved?.(currentSrc);
        }}
        onError={handleError}
      />
      {phase === 'rehosting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] text-yellow-300 gap-2 pointer-events-none">
          <Loader2 className="w-3 h-3 animate-spin" /> Re-fetching via bucket…
        </div>
      )}
    </>
  );
}
