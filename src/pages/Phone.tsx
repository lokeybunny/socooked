import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import {
  Phone as PhoneIcon, Search, RefreshCw, ChevronRight,
  FileText, Clock, CheckCircle2, XCircle, Loader2, PhoneIncoming, PhoneOutgoing
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Transcription {
  id: string;
  source_id: string;
  source_type: string;
  transcript: string;
  summary: string | null;
  phone_from: string | null;
  phone_to: string | null;
  direction: string | null;
  duration_seconds: number | null;
  occurred_at: string | null;
  created_at: string;
  customer_id: string | null;
}

export default function PhonePage() {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [selected, setSelected] = useState<Transcription | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadTranscriptions();
  }, []);

  async function loadTranscriptions() {
    setLoading(true);
    const { data } = await supabase
      .from('transcriptions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setTranscriptions(data || []);
    setLoading(false);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('transcribe-rc', {
        body: { action: 'sync' },
      });
      if (error) throw error;
      toast.success(`Synced ${data?.inserted ?? 0} new transcripts`);
      await loadTranscriptions();
    } catch (e: any) {
      toast.error(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const filtered = transcriptions.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.transcript?.toLowerCase().includes(q) ||
      t.summary?.toLowerCase().includes(q) ||
      t.phone_from?.includes(q) ||
      t.phone_to?.includes(q) ||
      t.source_type?.toLowerCase().includes(q)
    );
  });

  function formatDuration(s: number | null) {
    if (!s) return '—';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  return (
    <AppLayout>
      <div className="space-y-4 animate-fade-in">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Phone</h1>
          <p className="text-sm text-muted-foreground mt-1">Calls, SMS & voicemails via RingCentral.</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" style={{ height: 'calc(100vh - 200px)' }}>
          {/* Left: RingCentral Embeddable */}
          <div className="glass-card overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <PhoneIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">RingCentral</span>
            </div>
            <div className="flex-1">
              <iframe
                src="https://apps.ringcentral.com/integration/ringcentral-embeddable/latest/app.html"
                width="100%"
                height="100%"
                allow="microphone; autoplay"
                style={{ border: 'none' }}
              />
            </div>
          </div>

          {/* Right: Transcript Panel */}
          <div className="glass-card overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Transcripts</span>
                <span className="text-xs text-muted-foreground">({filtered.length})</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing}
                className="gap-1.5"
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sync
              </Button>
            </div>

            {/* Search */}
            <div className="px-4 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search transcripts…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Transcript List */}
              <div className={`${selected ? 'hidden sm:block sm:w-2/5 border-r border-border' : 'w-full'} overflow-y-auto`}>
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                    <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {search ? 'No matching transcripts' : 'No transcripts yet'}
                    </p>
                    {!search && (
                      <p className="text-xs text-muted-foreground mt-1">Click Sync to pull recordings</p>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filtered.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelected(t)}
                        className={`w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors ${
                          selected?.id === t.id ? 'bg-accent' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            {t.direction === 'inbound' ? (
                              <PhoneIncoming className="h-3 w-3 text-info" />
                            ) : (
                              <PhoneOutgoing className="h-3 w-3 text-success" />
                            )}
                            <span className="text-sm font-medium text-foreground truncate max-w-[140px]">
                              {t.phone_from || t.source_type}
                            </span>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {t.occurred_at
                            ? format(new Date(t.occurred_at), 'MMM d, h:mm a')
                            : format(new Date(t.created_at), 'MMM d, h:mm a')}
                          {t.duration_seconds && (
                            <span className="text-muted-foreground">· {formatDuration(t.duration_seconds)}</span>
                          )}
                        </div>
                        {t.summary && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{t.summary}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Transcript Detail */}
              {selected && (
                <div className="flex-1 overflow-y-auto">
                  <div className="p-4 space-y-4">
                    {/* Back button (mobile) */}
                    <button
                      onClick={() => setSelected(null)}
                      className="sm:hidden text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
                    >
                      ← Back
                    </button>

                    {/* Call Info Header */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {selected.direction === 'inbound' ? (
                          <PhoneIncoming className="h-4 w-4 text-info" />
                        ) : (
                          <PhoneOutgoing className="h-4 w-4 text-success" />
                        )}
                        <h3 className="text-base font-semibold text-foreground">
                          {selected.phone_from || 'Unknown'}
                        </h3>
                        <StatusBadge status={selected.source_type} />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="space-y-1">
                          <p className="text-muted-foreground">From</p>
                          <p className="text-foreground font-medium">{selected.phone_from || '—'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground">To</p>
                          <p className="text-foreground font-medium">{selected.phone_to || '—'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground">Date</p>
                          <p className="text-foreground font-medium">
                            {selected.occurred_at
                              ? format(new Date(selected.occurred_at), 'MMM d, yyyy · h:mm a')
                              : '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground">Duration</p>
                          <p className="text-foreground font-medium">{formatDuration(selected.duration_seconds)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Summary */}
                    {selected.summary && (
                      <div className="glass-card p-3 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Summary</p>
                        <p className="text-sm text-foreground leading-relaxed">{selected.summary}</p>
                      </div>
                    )}

                    {/* Full Transcript */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transcript</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-4 max-h-[300px] overflow-y-auto">
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                          {selected.transcript}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Empty detail state */}
              {!selected && filtered.length > 0 && (
                <div className="hidden sm:flex flex-1 items-center justify-center text-center px-6">
                  <div>
                    <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Select a transcript to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
