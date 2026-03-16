import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Eye, Pencil, Globe, Loader2 } from 'lucide-react';

interface Preview {
  id: string;
  title: string;
  preview_url: string | null;
  edit_url: string | null;
  status: string;
  source: string;
  created_at: string;
}

export function CustomerWebPreviews({ customerId }: { customerId: string }) {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('api_previews')
      .select('id, title, preview_url, edit_url, status, source, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setPreviews((data as Preview[]) || []);
        setLoading(false);
      });
  }, [customerId]);

  if (loading) return null;
  if (previews.length === 0) return null;

  return (
    <div className="space-y-1.5 border-t border-border pt-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Globe className="h-2.5 w-2.5" /> Web Previews ({previews.length})
      </p>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {previews.map(p => (
          <div key={p.id} className="flex items-center justify-between gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              {p.status === 'generating' || p.status === 'in_progress' ? (
                <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />
              ) : (
                <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
              <span className="truncate text-foreground text-xs">{p.title}</span>
            </div>
            <div className="flex gap-1 shrink-0">
              {p.preview_url && (
                <a href={p.preview_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-[10px] flex items-center gap-0.5">
                  <Eye className="h-2.5 w-2.5" />View
                </a>
              )}
              {p.edit_url && (
                <a href={p.edit_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground text-[10px] flex items-center gap-0.5">
                  <Pencil className="h-2.5 w-2.5" />Edit
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
