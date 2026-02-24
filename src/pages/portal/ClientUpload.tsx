import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, Loader2, CheckCircle, FileUp, AlertCircle, X } from 'lucide-react';
import { uploadToStorage, detectContentType } from '@/lib/storage';

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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
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

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setSelectedFiles(prev => {
      const names = new Set(prev.map(f => f.name + f.size));
      const unique = arr.filter(f => !names.has(f.name + f.size));
      return [...prev, ...unique];
    });
  }, []);

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) { toast.error('Please select at least one file'); return; }
    if (!customer) return;

    setUploading(true);
    const category = CATEGORY_LABELS[customer.category || 'other'] || 'Other';
    const newUploaded: string[] = [];

    try {
      for (const file of selectedFiles) {
        const publicUrl = await uploadToStorage(file, {
          category,
          customerName: customer.full_name,
          source: 'client-direct',
        });

        const detectedType = detectContentType(file.type || '');

        await supabase.from('content_assets').insert([{
          title: file.name,
          type: detectedType,
          status: 'published',
          url: publicUrl,
          folder: `${category}/${customer.full_name}`,
          category: 'other',
          source: 'client-direct',
          customer_id: customer.id,
        }]);

        newUploaded.push(file.name);
      }

      setUploadedFiles(prev => [...prev, ...newUploaded]);
      setSelectedFiles([]);
      toast.success(`${newUploaded.length} file(s) uploaded successfully!`);
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
            Welcome, <span className="font-medium text-foreground">{customer.full_name}</span>. Drag & drop or browse to upload your files.
          </p>
        </div>

        <div className="glass-card p-6 space-y-5">
          {/* Drop zone */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors ${
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            <Upload className={`h-8 w-8 ${dragActive ? 'text-primary' : 'text-muted-foreground'}`} />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {dragActive ? 'Drop files here' : 'Drag & drop files here'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse · Photos, videos, PDFs, documents</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
              onChange={handleFileInput}
              className="hidden"
            />
          </div>

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected</p>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {selectedFiles.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-sm">
                    <FileUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1 text-foreground">{file.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{(file.size / 1024).toFixed(0)}KB</span>
                    <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button onClick={handleUpload} disabled={uploading || selectedFiles.length === 0} className="w-full gap-2" size="lg">
            {uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
            ) : (
              <><Upload className="h-4 w-4" /> Upload {selectedFiles.length > 0 ? `${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}` : ''}</>
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

        <div className="text-center space-y-1">
          <p className="text-xs text-muted-foreground">Powered by STU25 · Files are stored securely</p>
          <a href="https://stu25.com" target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-primary hover:underline">
            ← Back to stu25.com
          </a>
        </div>
      </div>
    </div>
  );
}
