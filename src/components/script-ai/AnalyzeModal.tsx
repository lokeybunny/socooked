import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Brain, Loader2, UserPlus, FileText, Calendar, DollarSign,
  CheckCircle, Lightbulb, Users, Mail, Phone, Tag
} from 'lucide-react';

interface Analysis {
  summary: string;
  people: Array<{ name: string; email?: string; phone?: string; role?: string; is_new_customer?: boolean }>;
  project_ideas: Array<{ title: string; description?: string; estimated_value?: string }>;
  deadlines: Array<{ description: string; date?: string }>;
  action_items: string[];
  suggested_category: string;
  suggested_services?: string[];
  budget_mentioned?: string;
}

interface AnalyzeModalProps {
  open: boolean;
  onClose: () => void;
}

export function AnalyzeModal({ open, onClose }: AnalyzeModalProps) {
  const [transcript, setTranscript] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (transcript.trim().length < 20) {
      toast.error('Paste a transcript with at least 20 characters');
      return;
    }
    setLoading(true);
    setAnalysis(null);

    const { data, error } = await supabase.functions.invoke('script-ai', {
      body: { transcript },
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Analysis failed');
      setLoading(false);
      return;
    }

    setAnalysis(data);
    setLoading(false);
    toast.success('Transcript analyzed!');
  };

  const handleCreateCustomer = async (person: Analysis['people'][0]) => {
    setCreatingCustomer(person.name);
    const { error } = await supabase.from('customers').insert([{
      full_name: person.name,
      email: person.email || null,
      phone: person.phone || null,
      status: 'lead',
      category: analysis?.suggested_category || 'other',
      source: 'script-ai',
      notes: `Detected from transcript. Role: ${person.role || 'unknown'}`,
    }]);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${person.name} added as a new lead!`);
    }
    setCreatingCustomer(null);
  };

  const handleDraftProposal = async (idea: Analysis['people'][0] & { title?: string }) => {
    // Fetch templates for proposals
    const { data: templates } = await supabase
      .from('templates')
      .select('id, name, type')
      .in('type', ['contract', 'proposal'])
      .limit(10);

    if (!templates || templates.length === 0) {
      toast.error('No proposal templates found. Create one in Templates first.');
      return;
    }

    // Navigate to templates page — toast with info
    toast.success(`Found ${templates.length} templates. Head to Templates to draft a proposal for this project.`);
  };

  const catLabel = (id: string) => {
    const map: Record<string, string> = {
      'digital-services': 'Digital Services',
      'brick-and-mortar': 'Brick & Mortar',
      'digital-ecommerce': 'Digital E-Commerce',
      'food-and-beverage': 'Food & Beverage',
      'mobile-services': 'Mobile Services',
      'other': 'Other',
    };
    return map[id] || id;
  };

  const handleReset = () => {
    setTranscript('');
    setAnalysis(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            AI Analyze Transcript
          </DialogTitle>
        </DialogHeader>

        {!analysis ? (
          /* Input phase */
          <div className="space-y-4 flex-1">
            <p className="text-sm text-muted-foreground">
              Paste a conversation transcript below. AI will extract names, emails, project ideas, deadlines, and action items.
            </p>
            <Textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="Paste your transcript here..."
              rows={12}
              className="font-mono text-xs"
            />
            <Button onClick={handleAnalyze} disabled={loading} className="w-full">
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
              ) : (
                <><Brain className="h-4 w-4 mr-2" /> Analyze Transcript</>
              )}
            </Button>
          </div>
        ) : (
          /* Results phase */
          <ScrollArea className="flex-1 max-h-[60vh]">
            <div className="space-y-5 pr-3">
              {/* Summary */}
              <div className="glass-card p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Summary</p>
                <p className="text-sm text-foreground leading-relaxed">{analysis.summary}</p>
                <div className="flex items-center gap-2 pt-1">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  <Badge variant="outline" className="text-xs capitalize">{catLabel(analysis.suggested_category)}</Badge>
                  {analysis.budget_mentioned && (
                    <Badge variant="outline" className="text-xs">
                      <DollarSign className="h-3 w-3 mr-1" />{analysis.budget_mentioned}
                    </Badge>
                  )}
                </div>
              </div>

              {/* People */}
              {analysis.people.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> People Detected ({analysis.people.length})
                  </p>
                  {analysis.people.map((p, i) => (
                    <div key={i} className="glass-card p-3 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{p.name}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {p.role && <span>{p.role}</span>}
                          {p.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{p.email}</span>}
                          {p.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span>}
                        </div>
                      </div>
                      {p.is_new_customer && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1.5"
                          disabled={creatingCustomer === p.name}
                          onClick={() => handleCreateCustomer(p)}
                        >
                          {creatingCustomer === p.name ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <UserPlus className="h-3 w-3" />
                          )}
                          Add as Lead
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Project Ideas */}
              {analysis.project_ideas.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5" /> Project Ideas ({analysis.project_ideas.length})
                  </p>
                  {analysis.project_ideas.map((idea, i) => (
                    <div key={i} className="glass-card p-3 flex items-center justify-between">
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <p className="text-sm font-medium">{idea.title}</p>
                        {idea.description && <p className="text-xs text-muted-foreground line-clamp-2">{idea.description}</p>}
                        {idea.estimated_value && (
                          <Badge variant="outline" className="text-xs mt-1">
                            <DollarSign className="h-3 w-3 mr-0.5" />{idea.estimated_value}
                          </Badge>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1.5 ml-3 shrink-0"
                        onClick={() => handleDraftProposal(idea as any)}
                      >
                        <FileText className="h-3 w-3" /> Draft Proposal
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Deadlines */}
              {analysis.deadlines && analysis.deadlines.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> Deadlines
                  </p>
                  {analysis.deadlines.map((d, i) => (
                    <div key={i} className="glass-card p-3 flex items-center gap-3">
                      <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <p className="text-sm">{d.description}</p>
                        {d.date && <p className="text-xs text-muted-foreground">{d.date}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Action Items */}
              {analysis.action_items.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5" /> Action Items
                  </p>
                  <div className="glass-card p-3 space-y-2">
                    {analysis.action_items.map((item, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                        <p className="text-sm">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Services */}
              {analysis.suggested_services && analysis.suggested_services.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Suggested Services</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.suggested_services.map((s, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* New analysis */}
              <Button variant="outline" className="w-full" onClick={handleReset}>
                Analyze Another Transcript
              </Button>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
