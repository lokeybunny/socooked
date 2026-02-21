import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Upload, Loader2, CheckCircle, FileUp, AlertCircle } from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  'digital-services': 'Digital Services',
  'brick-and-mortar': 'Brick & Mortar',
  'digital-ecommerce': 'Digital E-Commerce',
  'food-and-beverage': 'Food & Beverage',
  'mobile-services': 'Mobile Services',
  'other': 'Other',
};

export default function ClientUpload() {
  const { token } = useParams<{ token: string }>();
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      if (!token) { setNotFound(true); setLoading(false); return; }
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, category, company')
        .eq('upload_token', token)
        .maybeSingle();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      setCustomer(data);
      setLoading(false);
    };
    load();
  }, [token]);

  const handleUpload = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) { toast.error('Please select at least one file'); return; }
    if (!customer) return;

    setUploading(true);
    const category = CATEGORY_LABELS[customer.category || 'other'] || 'Other';
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const newUploaded: string[] = [];

    try {
      // 1. Ensure folder structure
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

      // 2. Upload each file
      for (const file of Array.from(files)) {
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
        if (!uploadRes.ok) throw new Error(uploadData.error || `Failed to upload ${file.name}`);

        // 3. Detect type
        const mime = file.type || '';
        let detectedType = 'doc';
        if (mime.startsWith('image/')) detectedType = 'image';
        else if (mime.startsWith('video/')) detectedType = 'video';
        else if (mime.startsWith('audio/')) detectedType = 'video';

        // 4. Create content_assets record
        await supabase.from('content_assets').insert([{
          title: file.name,
          type: detectedType,
          status: 'published',
          url: uploadData.webViewLink || null,
          folder: `${category}/${customer.full_name}`,
          category: customer.category || 'other',
          source: 'client-direct',
          customer_id: customer.id,
        }]);

        newUploaded.push(file.name);
      }

      setUploadedFiles(prev => [...prev, ...newUploaded]);
      toast.success(`${newUploaded.length} file(s) uploaded successfully!`);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Link Not Found</h1>
        <p className="text-muted-foreground max-w-md">
          This upload link is invalid or has been revoked. Please contact your account manager for a new link.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <FileUp className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Upload Files</h1>
          <p className="text-muted-foreground mt-2">
            Welcome, <span className="font-medium text-foreground">{customer.full_name}</span>. Upload your photos, videos, and documents below.
          </p>
        </div>

        <div className="glass-card p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Select Files</label>
            <Input ref={fileRef} type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" />
            <p className="text-xs text-muted-foreground">Accepted: Photos, videos, PDFs, documents, spreadsheets</p>
          </div>

          <Button onClick={handleUpload} disabled={uploading} className="w-full gap-2" size="lg">
            {uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
            ) : (
              <><Upload className="h-4 w-4" /> Upload</>
            )}
          </Button>
        </div>

        {uploadedFiles.length > 0 && (
          <div className="glass-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" /> Uploaded Files
            </h3>
            <div className="space-y-1.5">
              {uploadedFiles.map((name, i) => (
                <p key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                  {name}
                </p>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Powered by STU25 · Files are stored securely
        </p>
      </div>
    </div>
  );
}
