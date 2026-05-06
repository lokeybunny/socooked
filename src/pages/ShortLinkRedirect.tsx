import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

export default function ShortLinkRedirect() {
  const { slug } = useParams<{ slug: string }>();

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data } = await supabase
        .from('short_links')
        .select('target_url')
        .eq('slug', slug)
        .maybeSingle();
      if (data?.target_url) {
        window.location.replace(data.target_url);
      } else {
        window.location.replace('/');
      }
    })();
  }, [slug]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}
