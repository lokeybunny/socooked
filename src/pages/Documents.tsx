import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FileText, File } from 'lucide-react';
import { CategoryGate, useCategoryGate } from '@/components/CategoryGate';

export default function Documents() {
  const categoryGate = useCategoryGate();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('documents')
        .select('*, customers(full_name), conversation_threads(status, channel)')
        .order('created_at', { ascending: false });
      setDocuments(data || []);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <AppLayout>
      <CategoryGate title="Documents" {...categoryGate} totalCount={documents.length} countLabel="documents">
        <div className="space-y-6">
          <p className="text-muted-foreground text-sm">{documents.length} documents</p>
          <div className="space-y-3">
            {documents.map(d => (
              <div key={d.id} className="glass-card p-5 flex items-center gap-4">
                <div className="p-2 rounded-lg bg-primary/10">
                  {d.type === 'resume' ? <FileText className="h-4 w-4 text-primary" /> : <File className="h-4 w-4 text-primary" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{d.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {d.customers?.full_name} · <span className="capitalize">{d.type}</span>
                  </p>
                </div>
                <StatusBadge status={d.status} />
              </div>
            ))}
            {documents.length === 0 && !loading && (
              <div className="text-center py-16 text-muted-foreground">No documents yet. Generate docs from conversation threads.</div>
            )}
          </div>
        </div>
      </CategoryGate>
    </AppLayout>
  );
}
