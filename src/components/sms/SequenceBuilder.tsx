import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Workflow, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';

type Sequence = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  ai_fallback_enabled: boolean;
  ai_system_prompt: string | null;
  is_active: boolean;
};
type Step = { id: string; sequence_id: string; step_order: number; body: string; reply_match: string | null };

export default function SequenceBuilder() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [stepsBySeq, setStepsBySeq] = useState<Record<string, Step[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const load = async () => {
    const { data: seqs } = await supabase.from('sms_sequences').select('*').order('created_at', { ascending: false });
    setSequences((seqs as Sequence[]) || []);
    if (seqs && seqs.length) {
      const { data: steps } = await supabase
        .from('sms_sequence_steps')
        .select('*')
        .in('sequence_id', seqs.map((s: any) => s.id))
        .order('step_order');
      const grouped: Record<string, Step[]> = {};
      (steps as Step[] | null)?.forEach((s) => {
        grouped[s.sequence_id] = grouped[s.sequence_id] || [];
        grouped[s.sequence_id].push(s);
      });
      setStepsBySeq(grouped);
    }
  };
  useEffect(() => { load(); }, []);

  const createSequence = async () => {
    if (!newName.trim()) return toast.error('Name required');
    const { error } = await supabase.from('sms_sequences').insert({
      name: newName, description: newDesc || null,
      ai_fallback_enabled: true,
      ai_system_prompt: 'You are a friendly SMS assistant for Warren. Keep replies under 160 chars, helpful, conversational.',
    });
    if (error) return toast.error(error.message);
    toast.success('Sequence created');
    setNewName(''); setNewDesc(''); setCreating(false); load();
  };

  const updateSequence = async (id: string, patch: Partial<Sequence>) => {
    const { error } = await supabase.from('sms_sequences').update(patch).eq('id', id);
    if (error) return toast.error(error.message);
    load();
  };

  const deleteSequence = async (id: string) => {
    if (!confirm('Delete this sequence and all its steps?')) return;
    await supabase.from('sms_sequences').delete().eq('id', id);
    load();
  };

  const addStep = async (seqId: string) => {
    const existing = stepsBySeq[seqId] || [];
    const nextOrder = (existing[existing.length - 1]?.step_order || 0) + 1;
    const { error } = await supabase.from('sms_sequence_steps').insert({
      sequence_id: seqId, step_order: nextOrder, body: '',
    });
    if (error) return toast.error(error.message);
    load();
  };

  const updateStep = async (id: string, patch: Partial<Step>) => {
    const { error } = await supabase.from('sms_sequence_steps').update(patch).eq('id', id);
    if (error) return toast.error(error.message);
  };

  const deleteStep = async (id: string) => {
    await supabase.from('sms_sequence_steps').delete().eq('id', id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold">Auto-Responder Sequences</h3>
          </div>
          <Button size="sm" onClick={() => setCreating(!creating)} className="bg-emerald-500 hover:bg-emerald-600">
            <Plus className="h-3.5 w-3.5 mr-1" /> New Sequence
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          When a recipient replies to the greet message, the next step fires automatically. Reply STOP/UNSUBSCRIBE opts them out.
          Off-script replies fall back to AI when enabled.
        </p>

        {creating && (
          <div className="border border-border rounded-lg p-3 mt-3 space-y-2 bg-card/50">
            <Input placeholder="Sequence name (e.g. Realtor Greet Drip)" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" onClick={createSequence}><Save className="h-3.5 w-3.5 mr-1" /> Create</Button>
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="h-[600px]">
        {sequences.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-8">No sequences yet — create one to start auto-responding.</p>
        ) : (
          <div className="space-y-3">
            {sequences.map((seq) => {
              const steps = stepsBySeq[seq.id] || [];
              const isExp = expanded === seq.id;
              return (
                <div key={seq.id} className="glass-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      className="flex items-start gap-2 text-left flex-1 min-w-0"
                      onClick={() => setExpanded(isExp ? null : seq.id)}
                    >
                      {isExp ? <ChevronDown className="h-4 w-4 mt-1 shrink-0" /> : <ChevronRight className="h-4 w-4 mt-1 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate">{seq.name}</span>
                          <Badge variant="outline" className="text-[10px]">{steps.length} step{steps.length !== 1 ? 's' : ''}</Badge>
                          {seq.ai_fallback_enabled && (
                            <Badge className="text-[10px] bg-purple-500/20 text-purple-300 border-purple-500/40">
                              <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI Fallback
                            </Badge>
                          )}
                          {!seq.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                        </div>
                        {seq.description && <p className="text-[11px] text-muted-foreground truncate">{seq.description}</p>}
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <Switch checked={seq.is_active} onCheckedChange={(v) => updateSequence(seq.id, { is_active: v })} />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400" onClick={() => deleteSequence(seq.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {isExp && (
                    <div className="space-y-3 pl-6 border-l-2 border-emerald-500/30">
                      <div className="space-y-2">
                        <Label className="text-[11px]">AI Fallback System Prompt (used when reply doesn't match a step)</Label>
                        <Textarea
                          rows={3}
                          defaultValue={seq.ai_system_prompt || ''}
                          onBlur={(e) => updateSequence(seq.id, { ai_system_prompt: e.target.value })}
                          placeholder="You are a friendly SMS assistant…"
                        />
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={seq.ai_fallback_enabled}
                            onCheckedChange={(v) => updateSequence(seq.id, { ai_fallback_enabled: v })}
                          />
                          <Label className="text-[11px]">Enable AI fallback for off-script replies</Label>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Reply Sequence Steps</Label>
                          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => addStep(seq.id)}>
                            <Plus className="h-3 w-3 mr-1" /> Add Step
                          </Button>
                        </div>
                        {steps.length === 0 && (
                          <p className="text-[10px] text-muted-foreground">No steps. Add the first reply they should receive after answering the greet.</p>
                        )}
                        {steps.map((step) => (
                          <div key={step.id} className="border border-border rounded p-2 space-y-2">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-[10px]">Step {step.step_order}</Badge>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => deleteStep(step.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            <Input
                              placeholder="Reply must contain (optional, e.g. 'yes')"
                              defaultValue={step.reply_match || ''}
                              onBlur={(e) => updateStep(step.id, { reply_match: e.target.value || null })}
                              className="h-7 text-xs"
                            />
                            <Textarea
                              rows={2}
                              placeholder="Message body — use {first_name} for personalization"
                              defaultValue={step.body}
                              onBlur={(e) => updateStep(step.id, { body: e.target.value })}
                              className="text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
