import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'content-uploads';

/**
 * Upload a file to Supabase storage and return the public URL.
 * Path format: category/customer_name/source/filename
 */
export async function uploadToStorage(
  file: File | Blob,
  opts: {
    category: string;
    customerName: string;
    source?: string;
    fileName?: string;
  }
): Promise<string> {
  const rawName = opts.fileName || (file instanceof File ? file.name : 'file');
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeCat = opts.category.replace(/[^a-zA-Z0-9-_]/g, '');
  const safeCust = opts.customerName.replace(/[^a-zA-Z0-9-_]/g, '');
  const safeSrc = (opts.source || 'dashboard').replace(/[^a-zA-Z0-9-_]/g, '');
  const timestamp = Date.now();
  const path = `${safeCat}/${safeCust}/${safeSrc}/${timestamp}_${safeName}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Detect content type from MIME.
 */
export function detectContentType(mime: string): string {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'doc';
}

/**
 * Download a file from its public URL (for files stored in Supabase storage).
 * For legacy Google Drive URLs, opens in new tab.
 */
export function downloadFromUrl(url: string, title: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = title;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.click();
}
