import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface StoreItem {
  id: string;
  item_name: string;
  sku: string | null;
  asking_price: number | null;
  nobg_image_url: string | null;
  original_image_url: string | null;
  condition_notes: string | null;
  pawn_shop_address: string | null;
  meta: Record<string, unknown>;
}

export default function Store() {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StoreItem | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("arbitrage_items")
        .select("id, item_name, sku, asking_price, nobg_image_url, original_image_url, condition_notes, pawn_shop_address, meta")
        .eq("status", "listed")
        .order("created_at", { ascending: false });
      setItems((data as StoreItem[]) || []);
      setLoading(false);
    })();
  }, []);

  const img = (i: StoreItem) => i.nobg_image_url || i.original_image_url;

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-neutral-100 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">The&nbsp;Collection</h1>
            <p className="mt-0.5 text-xs tracking-widest uppercase text-neutral-400">Music · Luxury · Rare Finds</p>
          </div>
          <Badge variant="outline" className="border-neutral-200 text-neutral-500 text-[11px] tracking-widest uppercase">
            {items.length} {items.length === 1 ? "piece" : "pieces"}
          </Badge>
        </div>
      </header>

      {/* Grid */}
      <main className="mx-auto max-w-7xl px-6 py-12">
        {loading ? (
          <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square rounded-xl bg-neutral-100" />
                <div className="mt-4 h-4 w-3/4 rounded bg-neutral-100" />
                <div className="mt-2 h-3 w-1/2 rounded bg-neutral-50" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <p className="text-lg text-neutral-400">No items currently listed</p>
            <p className="mt-1 text-sm text-neutral-300">Check back soon for new arrivals</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className="group text-left transition-all focus:outline-none"
              >
                <div className="relative aspect-square overflow-hidden rounded-xl bg-neutral-50">
                  {img(item) ? (
                    <img
                      src={img(item)!}
                      alt={item.item_name}
                      className="h-full w-full object-contain p-4 transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-neutral-200">
                      <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                  )}
                </div>
                <div className="mt-3">
                  <h3 className="text-sm font-medium leading-tight text-neutral-800 group-hover:text-neutral-600 transition-colors">
                    {item.item_name}
                  </h3>
                  {item.sku && (
                    <p className="mt-0.5 text-[10px] tracking-widest uppercase text-neutral-300">
                      SKU {item.sku}
                    </p>
                  )}
                  {item.asking_price != null && (
                    <p className="mt-1.5 text-sm font-semibold tracking-tight">
                      ${Number(item.asking_price).toLocaleString()}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl border-neutral-100 bg-white p-0 overflow-hidden">
          {selected && (
            <div className="grid md:grid-cols-2">
              <div className="aspect-square bg-neutral-50 flex items-center justify-center p-8">
                {img(selected) ? (
                  <img src={img(selected)!} alt={selected.item_name} className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-neutral-200 text-sm">No image</span>
                )}
              </div>
              <div className="flex flex-col justify-center p-8">
                {selected.sku && (
                  <p className="text-[10px] tracking-widest uppercase text-neutral-400 mb-1">SKU {selected.sku}</p>
                )}
                <h2 className="text-xl font-semibold tracking-tight">{selected.item_name}</h2>
                {selected.asking_price != null && (
                  <p className="mt-3 text-2xl font-bold tracking-tight">${Number(selected.asking_price).toLocaleString()}</p>
                )}
                {selected.condition_notes && (
                  <p className="mt-4 text-sm text-neutral-500 leading-relaxed">{selected.condition_notes}</p>
                )}
                {selected.pawn_shop_address && (
                  <p className="mt-3 text-xs text-neutral-400">{selected.pawn_shop_address}</p>
                )}
                <a
                  href={`mailto:warren@stu25.com?subject=Inquiry: ${encodeURIComponent(selected.item_name)}${selected.sku ? ` (${selected.sku})` : ""}`}
                  className="mt-8 inline-flex items-center justify-center rounded-full bg-neutral-900 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
                >
                  Inquire
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t border-neutral-100 py-8 text-center text-xs text-neutral-300 tracking-wider uppercase">
        © {new Date().getFullYear()} The Collection
      </footer>
    </div>
  );
}
