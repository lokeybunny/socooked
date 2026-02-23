import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Image, Video, Music, File, Download, Loader2 } from 'lucide-react';

const typeIcons: Record<string, any> = {
  article: FileText, image: Image, video: Video, audio: Music, doc: File,
};

export default function SharedContent() {
  const { token } = useParams<{ token: string }>();
  const [asset, setAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      const { data, error: err } = await supabase.functions.invoke('share-content', {
        body: null,
        headers: {},
      });
      // Use query param approach instead
      const res = await fetch(
        `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/share-content?token=${token}`,
        { headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Not found');
      } else {
        setAsset(json);
      }
      setLoading(false);
    };
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <h1 className="text-xl font-bold text-foreground">Content Not Found</h1>
          <p className="text-sm text-muted-foreground">{error || 'This share link may have expired or been revoked.'}</p>
          <Button variant="outline" onClick={() => window.location.href = 'https://stu25.com'}>
            ← Back to STU25
          </Button>
        </Card>
      </div>
    );
  }

  const Icon = typeIcons[asset.type] || File;
  const isPlayable = (asset.type === 'video' || asset.type === 'audio') && asset.url;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{asset.title}</h1>
            <p className="text-sm text-muted-foreground">
              {asset.customers?.full_name && `Shared by ${asset.customers.full_name} · `}
              {new Date(asset.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Preview */}
        {isPlayable && (
          <div className="rounded-lg overflow-hidden border border-border">
            {asset.type === 'video' ? (
              <video src={asset.url} controls className="w-full max-h-[60vh]" />
            ) : (
              <audio src={asset.url} controls className="w-full" />
            )}
          </div>
        )}

        {asset.type === 'image' && asset.url && (
          <div className="rounded-lg overflow-hidden border border-border">
            <img src={asset.url} alt={asset.title} className="w-full max-h-[60vh] object-contain" />
          </div>
        )}

        {asset.url && (
          <Button className="w-full gap-2" onClick={() => {
            const a = document.createElement('a');
            a.href = asset.url;
            a.download = asset.title;
            a.target = '_blank';
            a.click();
          }}>
            <Download className="h-4 w-4" /> Download
          </Button>
        )}

        <p className="text-center text-[11px] text-muted-foreground">
          Shared via <a href="https://stu25.com" className="text-primary hover:underline">STU25</a>
        </p>
      </Card>
    </div>
  );
}
