import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText, Copy, Pencil, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { CategoryGate, useCategoryGate, SERVICE_CATEGORIES } from '@/components/CategoryGate';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const PLACEHOLDERS = [
  { key: '{{client_name}}', label: 'Client Name' },
  { key: '{{company_name}}', label: 'Company Name' },
  { key: '{{company_address}}', label: 'Company Address' },
  { key: '{{client_email}}', label: 'Client Email' },
  { key: '{{date}}', label: 'Date' },
];

const TEMPLATE_TYPES = ['contract', 'proposal', 'invoice', 'email'] as const;

export default function Templates() {
  const categoryGate = useCategoryGate();
  const [allTemplates, setAllTemplates] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);

  const emptyForm = { name: '', description: '', type: 'contract', body_html: '' };
  const [form, setForm] = useState(emptyForm);

  const loadAll = async () => {
    const { data } = await supabase
      .from('templates')
      .select('*')
      .order('created_at', { ascending: false });
    setAllTemplates(data || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (categoryGate.selectedCategory) {
      setTemplates(allTemplates.filter(t => (t.category || 'other') === categoryGate.selectedCategory));
    } else {
      setTemplates(allTemplates);
    }
  }, [categoryGate.selectedCategory, allTemplates]);

  const categoryCounts = SERVICE_CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = allTemplates.filter(t => (t.category || 'other') === cat.id).length;
    return acc;
  }, {} as Record<string, number>);

  const detectPlaceholders = (html: string): string[] => {
    return PLACEHOLDERS.filter(p => html.includes(p.key)).map(p => p.key);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const placeholders = detectPlaceholders(form.body_html);
    const payload = {
      name: form.name,
      description: form.description || null,
      type: form.type,
      body_html: form.body_html,
      placeholders,
      category: categoryGate.selectedCategory,
    };

    if (editingTemplate) {
      const { error } = await supabase.from('templates').update(payload).eq('id', editingTemplate.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Template updated');
    } else {
      const { error } = await supabase.from('templates').insert([payload]);
      if (error) { toast.error(error.message); return; }
      toast.success('Template created');
    }

    setDialogOpen(false);
    setEditingTemplate(null);
    setForm(emptyForm);
    loadAll();
  };

  const openEdit = (t: any) => {
    setEditingTemplate(t);
    setForm({ name: t.name, description: t.description || '', type: t.type, body_html: t.body_html });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingTemplate(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('templates').delete().eq('id', deleteId);
    toast.success('Template deleted');
    setDeleteId(null);
    loadAll();
  };

  const copyHtml = (html: string) => {
    navigator.clipboard.writeText(html);
    toast.success('HTML copied to clipboard');
  };

  const insertPlaceholder = (key: string) => {
    setForm(prev => ({ ...prev, body_html: prev.body_html + key }));
  };

  return (
    <AppLayout>
      <CategoryGate title="Templates" {...categoryGate} totalCount={allTemplates.length} countLabel="templates" categoryCounts={categoryCounts}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">{templates.length} templates</p>
            <Button onClick={openCreate} className="gap-1.5"><Plus className="h-4 w-4" /> New Template</Button>
          </div>

          <div className="space-y-3">
            {templates.map(t => (
              <div key={t.id} className="glass-card p-5 flex items-center gap-4">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="capitalize">{t.type}</span>
                    {t.description && ` · ${t.description}`}
                  </p>
                  {t.placeholders?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {t.placeholders.map((p: string) => (
                        <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{p}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setPreviewTemplate(t); setPreviewOpen(true); }}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyHtml(t.body_html)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {templates.length === 0 && !loading && (
              <div className="text-center py-16 text-muted-foreground">
                No templates yet. Create contract and proposal templates with placeholder variables.
              </div>
            )}
          </div>
        </div>

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) setEditingTemplate(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? 'Edit Template' : 'New Template'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Placeholders</Label>
                <p className="text-xs text-muted-foreground">Click to insert into template body</p>
                <div className="flex flex-wrap gap-1.5">
                  {PLACEHOLDERS.map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => insertPlaceholder(p.key)}
                      className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-mono"
                    >
                      {p.key}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Template Body (HTML) *</Label>
                <Textarea
                  value={form.body_html}
                  onChange={e => setForm({ ...form, body_html: e.target.value })}
                  rows={12}
                  className="font-mono text-xs"
                  placeholder="<h1>Service Agreement</h1>&#10;<p>This contract is between {{company_name}} and {{client_name}}...</p>"
                  required
                />
              </div>
              <Button type="submit" className="w-full">{editingTemplate ? 'Update Template' : 'Create Template'}</Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Preview: {previewTemplate?.name}</DialogTitle>
            </DialogHeader>
            <div
              className="prose prose-sm max-w-none p-4 border rounded-lg bg-white text-black"
              dangerouslySetInnerHTML={{ __html: previewTemplate?.body_html || '' }}
            />
            <Button variant="outline" onClick={() => copyHtml(previewTemplate?.body_html || '')} className="gap-1.5">
              <Copy className="h-4 w-4" /> Copy HTML
            </Button>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete template?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CategoryGate>
    </AppLayout>
  );
}
