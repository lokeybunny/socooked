import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Building2, Loader2, Plus, ArrowLeft, Sparkles, Download,
  Bed, Bath, Ruler, DollarSign, MapPin, RefreshCw, Trash2,
} from 'lucide-react';

interface Property {
  id: string;
  listing_id: string | null;
  address: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  zillow_url: string;
  thumbnail_url: string | null;
  status: string;
  created_at: string;
}

interface PropertyImage {
  id: string;
  property_id: string;
  image_url: string;
  room_type: string | null;
  ai_tag: string | null;
  position: number;
}

const ROOM_LABELS: Record<string, string> = {
  kitchen: 'Kitchen',
  living_room: 'Living Room',
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  exterior_front: 'Exterior',
  backyard: 'Backyard',
  dining_room: 'Dining',
  garage: 'Garage',
  other: 'Other',
};

export default function Zillow() {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false });
    setProperties((data as Property[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Realtime: refresh on insert/update
  useEffect(() => {
    const ch = supabase
      .channel('properties_feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'properties' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleScrape = async () => {
    const trimmed = url.trim();
    if (!/zillow\.com/i.test(trimmed)) { toast.error('Paste a valid Zillow URL'); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch_zillow_images', {
        body: { zillow_url: trimmed },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Property scraped (${(data as any)?.image_count ?? 0} images)`);
      setUrl('');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to scrape');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this property and all its images?')) return;
    await (supabase as any).from('properties').delete().eq('id', id);
    setProperties(prev => prev.filter(p => p.id !== id));
    toast.success('Deleted');
  };

  if (selectedId) {
    return (
      <AppLayout>
        <PropertyDetail propertyId={selectedId} onBack={() => setSelectedId(null)} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" /> Zillow Content Studio
            </h1>
            <p className="text-sm text-muted-foreground">
              Paste a Zillow link → auto-pull photos → AI-tag rooms → generate reels & stories.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        {/* Add URL */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="https://www.zillow.com/homedetails/..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScrape(); }}
                disabled={submitting}
                className="flex-1"
              />
              <Button onClick={handleScrape} disabled={submitting} className="gap-1.5 min-w-[160px]">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {submitting ? 'Scraping…' : 'Pull Images'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Uses your active Apify key from <span className="font-mono">/api-management</span>. AI vision auto-tags each photo (kitchen, bedroom, exterior, etc.).
            </p>
          </CardContent>
        </Card>

        {/* Feed */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : properties.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No properties yet. Paste a Zillow link above to start.</p>
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {properties.map(p => (
              <Card key={p.id} className="overflow-hidden group cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelectedId(p.id)}>
                <div className="aspect-video bg-muted/30 relative">
                  {p.thumbnail_url ? (
                    <img src={p.thumbnail_url} alt={p.address || 'Property'} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <Building2 className="h-8 w-8 opacity-30" />
                    </div>
                  )}
                  <Badge className="absolute top-2 left-2 capitalize" variant={p.status === 'ready' ? 'default' : 'secondary'}>
                    {p.status === 'tagging' || p.status === 'scraping' ? (
                      <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {p.status}</span>
                    ) : p.status.replace('_', ' ')}
                  </Badge>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/80 text-destructive-foreground rounded-md p-1.5"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <CardContent className="p-3 space-y-2">
                  <p className="text-sm font-medium truncate flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                    {p.address || 'Unknown address'}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {p.price && <span className="flex items-center gap-0.5"><DollarSign className="h-3 w-3" />{Number(p.price).toLocaleString()}</span>}
                    {p.beds != null && <span className="flex items-center gap-0.5"><Bed className="h-3 w-3" />{p.beds}</span>}
                    {p.baths != null && <span className="flex items-center gap-0.5"><Bath className="h-3 w-3" />{p.baths}</span>}
                    {p.sqft != null && <span className="flex items-center gap-0.5"><Ruler className="h-3 w-3" />{Number(p.sqft).toLocaleString()}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function PropertyDetail({ propertyId, onBack }: { propertyId: string; onBack: () => void }) {
  const [property, setProperty] = useState<Property | null>(null);
  const [images, setImages] = useState<PropertyImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [storyline, setStoryline] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: prop }, { data: imgs }] = await Promise.all([
        (supabase as any).from('properties').select('*').eq('id', propertyId).single(),
        (supabase as any).from('property_images').select('*').eq('property_id', propertyId).order('position'),
      ]);
      setProperty(prop as Property);
      setImages((imgs as PropertyImage[]) || []);
      setLoading(false);
    })();
  }, [propertyId]);

  const grouped = useMemo(() => {
    const g: Record<string, PropertyImage[]> = {};
    for (const i of images) {
      const k = i.room_type || 'other';
      (g[k] ||= []).push(i);
    }
    return g;
  }, [images]);

  const generate = async (format: 'reel' | 'story') => {
    setGenerating(true);
    setStoryline(null);
    try {
      const { data, error } = await supabase.functions.invoke('zillow_generate_content', {
        body: { property_id: propertyId, format },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setStoryline((data as any).storyline);
      toast.success(`${format === 'reel' ? 'Reel' : 'Story'} storyline ready`);
    } catch (e: any) {
      toast.error(e?.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const downloadAll = () => {
    images.forEach((img, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = img.image_url;
        a.download = `property-${i + 1}.jpg`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a); a.click(); a.remove();
      }, i * 200);
    });
    toast.success(`Opening ${images.length} images…`);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!property) return <div className="p-6">Property not found.</div>;

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" /> Back to feed
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{property.address || 'Property'}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
            {property.price && <span>${Number(property.price).toLocaleString()}</span>}
            {property.beds != null && <span>{property.beds} bd</span>}
            {property.baths != null && <span>{property.baths} ba</span>}
            {property.sqft != null && <span>{Number(property.sqft).toLocaleString()} sqft</span>}
            <a href={property.zillow_url} target="_blank" rel="noreferrer" className="text-primary underline">View on Zillow</a>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => generate('reel')} disabled={generating} className="gap-1.5">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Create Reel
          </Button>
          <Button onClick={() => generate('story')} disabled={generating} variant="secondary" className="gap-1.5">
            <Sparkles className="h-4 w-4" /> Create Story
          </Button>
          <Button onClick={downloadAll} variant="outline" className="gap-1.5">
            <Download className="h-4 w-4" /> Download All
          </Button>
        </div>
      </div>

      {/* Storyline */}
      {storyline && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Hook</p>
              <p className="font-semibold">{storyline.hook}</p>
            </div>
            <div className="space-y-2">
              {Array.isArray(storyline.scenes) && storyline.scenes.map((s: any) => (
                <div key={s.order} className="border-l-2 border-primary/40 pl-3 py-1">
                  <p className="text-xs text-muted-foreground">Scene {s.order} · {s.room}</p>
                  <p className="text-sm font-medium">{s.caption}</p>
                  {s.voiceover && <p className="text-xs italic text-muted-foreground mt-0.5">VO: {s.voiceover}</p>}
                  {s.image_prompt && <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">🎨 {s.image_prompt}</p>}
                </div>
              ))}
            </div>
            {storyline.cta && (
              <div>
                <p className="text-xs uppercase text-muted-foreground">CTA</p>
                <p className="font-semibold">{storyline.cta}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Image gallery grouped */}
      {Object.keys(grouped).length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No images.</CardContent></Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([room, imgs]) => (
            <div key={room}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold">{ROOM_LABELS[room] || room}</h3>
                <Badge variant="outline">{imgs.length}</Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {imgs.map(i => (
                  <a key={i.id} href={i.image_url} target="_blank" rel="noreferrer" className="relative aspect-square rounded-md overflow-hidden bg-muted/30 group">
                    <img src={i.image_url} alt={i.ai_tag || room} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                    {i.ai_tag && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                        <p className="text-[10px] text-white truncate">{i.ai_tag}</p>
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
