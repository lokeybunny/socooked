import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Copy, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  url: string;
  className?: string;
  alt?: string;
};

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "image";
    return decodeURIComponent(last).split("?")[0] || "image";
  } catch {
    return "image";
  }
}

export function MediaImage({ url, className, alt = "attachment" }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"download" | "copy" | null>(null);

  const handleDownload = async () => {
    setBusy("download");
    try {
      const blob = await fetchBlob(url);
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filenameFromUrl(url);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
      toast.success("Image downloaded");
    } catch (e: any) {
      // Fallback: open in new tab
      window.open(url, "_blank", "noopener,noreferrer");
      toast.message("Opened image in new tab", { description: "Right-click to save." });
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    setBusy("copy");
    try {
      const blob = await fetchBlob(url);
      // Convert to PNG if needed (clipboard only accepts a limited set)
      let toWrite: Blob = blob;
      if (!["image/png"].includes(blob.type)) {
        try {
          const bmp = await createImageBitmap(blob);
          const canvas = document.createElement("canvas");
          canvas.width = bmp.width;
          canvas.height = bmp.height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(bmp, 0, 0);
          toWrite = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
          );
        } catch {
          // fall through with original blob
        }
      }
      // ClipboardItem is available in modern browsers
      await navigator.clipboard.write([new ClipboardItem({ [toWrite.type || "image/png"]: toWrite })]);
      toast.success("Image copied to clipboard");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Image URL copied");
      } catch {
        toast.error("Could not copy image");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block group focus:outline-none focus:ring-2 focus:ring-primary/60 rounded-lg"
        aria-label="Open image"
      >
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className={
            className ??
            "rounded-lg max-h-64 max-w-full object-contain border border-border/40 group-hover:opacity-90 transition"
          }
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl p-0 bg-background/95 border-border">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
            <div className="text-xs text-muted-foreground truncate">{filenameFromUrl(url)}</div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={handleDownload} disabled={busy !== null}>
                <Download className="h-4 w-4 mr-1" /> Download
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCopy} disabled={busy !== null}>
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" /> Open
                </a>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-center bg-black/40 max-h-[80vh] overflow-auto">
            <img src={url} alt={alt} className="max-h-[80vh] w-auto object-contain" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default MediaImage;
