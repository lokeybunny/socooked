import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Upload, Download, Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ShrunkFile {
  name: string;
  originalSize: number;
  newSize: number;
  url: string;
  blob: Blob;
}

export function StudioShrink() {
  const [scale, setScale] = useState(50); // percent
  const [quality, setQuality] = useState(85);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<ShrunkFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File): Promise<ShrunkFile> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const factor = scale / 100;
            canvas.width = Math.round(img.width * factor);
            canvas.height = Math.round(img.height * factor);
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Canvas unsupported'));
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
              (blob) => {
                if (!blob) return reject(new Error('Encode failed'));
                resolve({
                  name: file.name.replace(/\.(jpe?g|png|webp)$/i, '') + `_${scale}pct.jpg`,
                  originalSize: file.size,
                  newSize: blob.size,
                  url: URL.createObjectURL(blob),
                  blob,
                });
              },
              'image/jpeg',
              quality / 100
            );
          };
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error('Read failed'));
        reader.readAsDataURL(file);
      }),
    [scale, quality]
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length) return;
      setProcessing(true);
      try {
        const arr = Array.from(files).filter((f) => /^image\/(jpeg|jpg|png|webp)$/i.test(f.type));
        if (!arr.length) {
          toast.error('Please select JPEG, PNG, or WebP images');
          return;
        }
        const out: ShrunkFile[] = [];
        for (const f of arr) {
          try {
            out.push(await processFile(f));
          } catch (err: any) {
            toast.error(`${f.name}: ${err.message}`);
          }
        }
        setResults((prev) => [...out, ...prev]);
        toast.success(`Shrunk ${out.length} image${out.length === 1 ? '' : 's'}`);
      } finally {
        setProcessing(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [processFile]
  );

  const downloadOne = (r: ShrunkFile) => {
    const a = document.createElement('a');
    a.href = r.url;
    a.download = r.name;
    a.click();
  };

  const downloadAll = () => results.forEach(downloadOne);

  const fmt = (b: number) => (b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`);

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Shrink Images</h2>
            <p className="text-sm text-muted-foreground">Resize JPEG/PNG/WebP to a smaller version. All processing happens in your browser.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label className="text-sm">Resize to: {scale}% of original</Label>
            <Slider value={[scale]} min={10} max={100} step={5} onValueChange={(v) => setScale(v[0])} className="mt-3" />
            <p className="text-xs text-muted-foreground mt-1">50% halves both width and height (≈75% smaller area).</p>
          </div>
          <div>
            <Label className="text-sm">JPEG quality: {quality}%</Label>
            <Slider value={[quality]} min={30} max={100} step={5} onValueChange={(v) => setQuality(v[0])} className="mt-3" />
            <p className="text-xs text-muted-foreground mt-1">85% is a good balance of size and quality.</p>
          </div>
        </div>

        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={processing} className="gap-2">
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {processing ? 'Processing…' : 'Select Images'}
          </Button>
        </div>
      </Card>

      {results.length > 0 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Results ({results.length})</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setResults([])}>Clear</Button>
              <Button size="sm" onClick={downloadAll} className="gap-2"><Download className="w-3.5 h-3.5" /> Download all</Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((r, i) => {
              const saved = Math.max(0, 100 - (r.newSize / r.originalSize) * 100);
              return (
                <div key={i} className="border border-border/50 rounded-lg overflow-hidden bg-muted/30">
                  <img src={r.url} alt={r.name} className="w-full h-40 object-cover" />
                  <div className="p-3 space-y-2">
                    <p className="text-xs font-medium truncate" title={r.name}>{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(r.originalSize)} → {fmt(r.newSize)}{' '}
                      <span className="text-emerald-500">(-{saved.toFixed(0)}%)</span>
                    </p>
                    <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => downloadOne(r)}>
                      <Download className="w-3 h-3" /> Download
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
