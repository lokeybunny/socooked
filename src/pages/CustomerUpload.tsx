import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Upload, Loader2, FolderOpen, ExternalLink, File, FileText, Image, Video } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/ui/StatusBadge';

const CATEGORY_LABELS: Record<string, string> = {
  'digital-services': 'Digital Services',
  'brick-and-mortar': 'Brick & Mortar',
  'digital-ecommerce': 'Digital E-Commerce',
  'food-and-beverage': 'Food & Beverage',
  'mobile-services': 'Mobile Services',
  'other': 'Other',
};

const SOURCE_OPTIONS = [
  { value: 'dashboard', label: 'From Dashboard' },
  { value: 'instagram', label: 'From Client Instagram' },
  { value: 'sms', label: 'From Client Text Messages' },
  { value: 'client-direct', label: 'From Client Directly' },
  { value: 'google-drive', label: 'From Google Drive' },
];

const typeIcons: Record<string, any> = {
  article: FileText, image: Image, video: Video, landing_page: File, doc: File, post: FileText,
};

export default function CustomerUpload() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadSource, setUploadSource] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!customerId) return;
    const load = async () => {
      const [custRes, assetsRes] = await Promise.all([
        supabase.from('customers').select('*').eq('id', customerId).single(),
        supabase.from('content_assets').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
      ]);
      setCustomer(custRes.data);
      setAssets(assetsRes.data || []);
      setLoading(false);
    };
    load();
  }, [customerId]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error('Select a file'); return; }
    if (!customer) return;

    const category = CATEGORY_LABELS[customer.category || 'other'] || 'Other';
    setUploading(true);

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // 1. Ensure folder structure: Category / Customer / Source
      const folderRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/google-drive?action=ensure-folder`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
          body: JSON.stringify({ category, customer_name: customer.full_name }),
        }
      );
      const folderData = await folderRes.json();
      if (!folderRes.ok) throw new Error(folderData.error || 'Failed to create folder');

      // 2. Upload file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder_id', folderData.folder_id);

      const uploadRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/google-drive?action=upload`,
        {
          method: 'POST',
          headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
          body: formData,
        }
      );
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Failed to upload');

      // 3. Auto-detect content type from MIME
      const mime = file.type || '';
      let detectedType = 'doc';
      if (mime.startsWith('image/')) detectedType = 'image';
      else if (mime.startsWith('video/')) detectedType = 'video';
      else if (mime.startsWith('audio/')) detectedType = 'video';

      // 4. Create content_assets record with source
      const sourceLabel = SOURCE_OPTIONS.find(s => s.value === uploadSource)?.label || uploadSource;
      await supabase.from('content_assets').insert([{
        title: file.name,
        type: detectedType,
        status: 'published',
        url: uploadData.webViewLink || null,
        folder: `${category}/${customer.full_name}/${sourceLabel}`,
        category: customer.category || 'other',
        source: uploadSource,
        customer_id: customer.id,
      }]);

      toast.success(`Uploaded "${file.name}"`);
      if (fileRef.current) fileRef.current.value = '';

      // Reload assets
      const { data } = await supabase.from('content_assets').select('*').eq('customer_id', customerId).order('created_at', { ascending: false });
      setAssets(data || []);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!customer) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Customer not found.</div>
      </AppLayout>
    );
  }

  // Group assets by source
  const grouped: Record<string, any[]> = {};
  for (const a of assets) {
    const src = a.source || 'dashboard';
    const label = SOURCE_OPTIONS.find(s => s.value === src)?.label || src;
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(a);
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/content')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{customer.full_name}</h1>
            <p className="text-sm text-muted-foreground">
              {CATEGORY_LABELS[customer.category || 'other']} • {assets.length} file{assets.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Upload section */}
        <div className="glass-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Upload className="h-4 w-4" /> Upload File
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={uploadSource} onValueChange={setUploadSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>File</Label>
              <Input ref={fileRef} type="file" />
            </div>
            <Button onClick={handleUpload} disabled={uploading} className="gap-2">
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</> : <><Upload className="h-4 w-4" /> Upload to Drive</>}
            </Button>
          </div>
        </div>

        {/* Files grouped by source */}
        {Object.keys(grouped).length > 0 ? (
          <div className="space-y-4">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([source, files]) => (
              <div key={source} className="glass-card overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b border-border">
                  <FolderOpen className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{source}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{files.length} file{files.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-border/30">
                  {files.map(c => {
                    const Icon = typeIcons[c.type] || File;
                    return (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                        <div className="p-1.5 rounded bg-muted"><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{c.title}</p>
                          <span className="text-[10px] text-muted-foreground capitalize">{c.type.replace('_', ' ')}</span>
                        </div>
                        <StatusBadge status={c.status} />
                        {c.url && (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">No files yet. Upload one above!</div>
        )}
      </div>
    </AppLayout>
  );
}
