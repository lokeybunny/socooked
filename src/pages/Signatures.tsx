import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PenTool } from 'lucide-react';
import { format } from 'date-fns';
import { CategoryGate, useCategoryGate } from '@/components/CategoryGate';

export default function Signatures() {
  const categoryGate = useCategoryGate();
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('signatures')
        .select('*, documents(title, type), customers(full_name)')
        .order('signed_at', { ascending: false });
      setSignatures(data || []);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <AppLayout>
      <CategoryGate title="Signatures" {...categoryGate}>
        <div className="space-y-6">
          <p className="text-muted-foreground text-sm">{signatures.length} signatures collected</p>
          <div className="space-y-3">
            {signatures.map(s => (
              <div key={s.id} className="glass-card p-5 flex items-center gap-4">
                <div className="p-2 rounded-lg bg-primary/10">
                  <PenTool className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{s.signer_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.documents?.title} · {s.signer_email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Signed {format(new Date(s.signed_at), 'MMM d, yyyy h:mm a')} · {s.signature_type} signature
                  </p>
                </div>
                <StatusBadge status="signed" />
              </div>
            ))}
            {signatures.length === 0 && !loading && (
              <div className="text-center py-16 text-muted-foreground">No signatures yet.</div>
            )}
          </div>
        </div>
      </CategoryGate>
    </AppLayout>
  );
}
