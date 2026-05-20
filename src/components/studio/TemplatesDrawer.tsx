import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  BookmarkPlus, Bookmark, Trash2, Loader2, Download, Image as ImageIcon, Save,
} from 'lucide-react';
import {
  listTemplates, saveTemplate, deleteTemplate, applyTemplate, requestSnapshot,
  type StudioTemplate,
} from '@/lib/studio/templates';

export function TemplatesDrawer() {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<StudioTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try { setTemplates(await listTemplates()); }
    catch (e) { toast({ title: 'Could not load templates', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) load(); }, [open]);

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const snap = await requestSnapshot();
      if (!snap) {
        toast({
          title: 'Open Create tab first',
          description: 'Templates capture the Create tab. Switch to it and try again.',
          variant: 'destructive',
        });
        return;
      }
      await saveTemplate(name.trim(), snap, description.trim() || undefined);
      toast({ title: 'Template saved', description: `"${name.trim()}" is ready to reuse.` });
      setName(''); setDescription(''); setShowSaveForm(false);
      load();
    } catch (e) {
      toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleLoad = (t: StudioTemplate) => {
    applyTemplate(t.snapshot);
    toast({ title: 'Template loaded', description: `"${t.name}" applied to Create tab.` });
    setOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    await deleteTemplate(id);
    toast({ title: 'Template deleted' });
    load();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-0 top-1/2 z-40 flex flex-col items-center gap-1 rounded-l-xl border border-r-0 border-emerald-500/40 bg-emerald-600/20 backdrop-blur-md px-2 py-3 text-emerald-200 hover:bg-emerald-600/30 transition-colors shadow-lg"
        aria-label="Open templates"
      >
        <Bookmark className="w-4 h-4" />
        <span className="text-[10px] font-semibold tracking-wide [writing-mode:vertical-rl] rotate-180">TEMPLATES</span>
        {templates.length > 0 && (
          <Badge className="bg-emerald-500 text-black text-[10px] px-1.5 py-0 h-4">{templates.length}</Badge>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="p-5 border-b border-border/50">
            <SheetTitle className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-emerald-400" /> Templates
            </SheetTitle>
            <SheetDescription className="text-xs">
              Save the Create tab's current prompt, settings, references, and director options — reuse later in one click.
            </SheetDescription>
            {!showSaveForm ? (
              <Button
                size="sm"
                className="mt-2 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setShowSaveForm(true)}
              >
                <BookmarkPlus className="w-3.5 h-3.5" /> Save current as template
              </Button>
            ) : (
              <div className="mt-2 space-y-2 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                <Input
                  placeholder="Template name (e.g. Luxury Listing Walkthrough)"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
                <Textarea
                  placeholder="Optional description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  className="text-xs resize-none"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowSaveForm(false); setName(''); setDescription(''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : templates.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  <Bookmark className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  No templates saved yet.
                </div>
              ) : (
                templates.map(t => (
                  <Card key={t.id} className="p-3 bg-card/60 border-border/40 hover:border-emerald-500/40 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded bg-muted/40 overflow-hidden shrink-0 flex items-center justify-center">
                        {t.cover_url ? (
                          <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-muted-foreground/50" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.name}</p>
                        {t.description && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{t.description}</p>}
                        <p className="text-[10px] text-muted-foreground/70 mt-1 line-clamp-1">
                          {t.snapshot?.prompt?.slice(0, 80) || 'No prompt'}
                        </p>
                        <div className="flex gap-1.5 mt-2">
                          <Button size="sm" className="h-7 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => handleLoad(t)}>
                            <Download className="w-3 h-3" /> Load
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-muted-foreground hover:text-red-400" onClick={() => handleDelete(t.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
