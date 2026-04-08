import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, ChevronRight, Guitar, Gem, Shirt, Package, ChevronLeft, X } from "lucide-react";

interface StoreItem {
  id: string;
  item_name: string;
  sku: string | null;
  asking_price: number | null;
  wiggle_room_price: number | null;
  nobg_image_url: string | null;
  original_image_url: string | null;
  extra_images: string[] | null;
  condition_notes: string | null;
  pawn_shop_address: string | null;
  meta: Record<string, unknown>;
}

const CATEGORIES = [
  { key: "all", label: "All Items", icon: Package, keywords: [] as string[] },
  { key: "music", label: "Music & Instruments", icon: Guitar, keywords: ["guitar", "fender", "gibson", "amp", "amplifier", "pedal", "bass", "drum", "keyboard", "piano", "mic", "microphone", "speaker", "audio", "vinyl", "record", "turntable", "saxophone", "trumpet", "violin", "ukulele", "banjo", "mandolin", "harmonica", "synth", "midi", "monitor", "headphone", "cable", "strings", "pick", "capo", "tuner", "music", "instrument"] },
  { key: "jewelry", label: "Jewelry & Watches", icon: Gem, keywords: ["ring", "necklace", "bracelet", "watch", "rolex", "chain", "pendant", "earring", "diamond", "gold", "silver", "platinum", "carat", "jewel", "gem", "brooch", "cuff", "bangle", "anklet", "choker", "tiara", "crown"] },
  { key: "designer", label: "Designer & Luxury", icon: Shirt, keywords: ["louis vuitton", "gucci", "prada", "chanel", "hermes", "versace", "burberry", "dior", "balenciaga", "fendi", "supreme", "off-white", "yeezy", "jordan", "nike", "designer", "luxury", "handbag", "purse", "wallet", "belt", "sunglasses", "shoe", "sneaker", "boot"] },
];

function categorizeItem(item: StoreItem): string[] {
  const text = `${item.item_name} ${item.condition_notes || ""}`.toLowerCase();
  const matched: string[] = [];
  for (const cat of CATEGORIES.slice(1)) {
    if (cat.keywords.some((kw) => text.includes(kw))) matched.push(cat.key);
  }
  return matched.length ? matched : ["all"];
}

export default function Store() {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StoreItem | null>(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [activeThumb, setActiveThumb] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("arbitrage_items")
        .select("id, item_name, sku, asking_price, wiggle_room_price, nobg_image_url, original_image_url, extra_images, condition_notes, pawn_shop_address, meta")
        .eq("status", "listed")
        .order("created_at", { ascending: false });
      setItems((data as StoreItem[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = items;
    if (activeCategory !== "all") {
      list = list.filter((i) => categorizeItem(i).includes(activeCategory));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.item_name.toLowerCase().includes(q) || (i.sku && i.sku.toLowerCase().includes(q)));
    }
    return list;
  }, [items, activeCategory, search]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const item of items) {
      for (const cat of categorizeItem(item)) {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }
    return counts;
  }, [items]);

  const getImages = (item: StoreItem) => {
    const imgs: string[] = [];
    if (item.nobg_image_url) imgs.push(item.nobg_image_url);
    if (item.original_image_url) imgs.push(item.original_image_url);
    if (item.extra_images) imgs.push(...item.extra_images.filter(Boolean));
    return imgs;
  };

  const primaryImg = (i: StoreItem) => i.nobg_image_url || i.original_image_url;
  const listPrice = (i: StoreItem) => i.wiggle_room_price ?? i.asking_price;

  const fmtPrice = (price: number) => {
    const whole = Math.floor(price);
    const cents = String(Math.round((price % 1) * 100)).padStart(2, "0");
    return { whole: whole.toLocaleString(), cents };
  };

  useEffect(() => { setActiveThumb(0); }, [selected]);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Top banner */}
      <div className="bg-neutral-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2 text-[11px] tracking-widest uppercase">
          <span>Free Shipping on Orders $500+</span>
          <span className="hidden sm:block">Every Item Authenticated</span>
          <a href="mailto:warren@stu25.com" className="hover:text-neutral-300 transition-colors">Contact Us</a>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-neutral-100 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">The&nbsp;Collection</h1>
            <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-400 mt-0.5">Music · Luxury · Rare Finds</p>
          </div>
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for items…"
              className="pl-10 w-72 h-10 text-sm border-neutral-200 rounded-full bg-neutral-50 focus:bg-white"
            />
          </div>
        </div>

        {/* Category nav */}
        <div className="border-t border-neutral-50 bg-white">
          <div className="mx-auto max-w-7xl px-6 flex items-center gap-8 overflow-x-auto">
            {CATEGORIES.map((cat) => {
              const active = activeCategory === cat.key;
              const count = categoryCounts[cat.key] || 0;
              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={`relative flex items-center gap-2 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                    active ? "text-neutral-900" : "text-neutral-400 hover:text-neutral-700"
                  }`}
                >
                  <cat.icon className="h-4 w-4" />
                  {cat.label}
                  <span className="text-[10px] text-neutral-400">({count})</span>
                  {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-900 rounded-full" />}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Mobile search */}
      <div className="mx-auto max-w-7xl px-6 pt-4 sm:hidden">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-10 h-10 text-sm border-neutral-200 rounded-full bg-neutral-50" />
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="mx-auto max-w-7xl px-6 pt-5 pb-2 flex items-center gap-1.5 text-xs text-neutral-400">
        <button onClick={() => setActiveCategory("all")} className="hover:text-neutral-600 transition-colors">Home</button>
        <ChevronRight className="h-3 w-3" />
        <span className="text-neutral-600">{CATEGORIES.find((c) => c.key === activeCategory)?.label}</span>
        <span className="ml-auto text-neutral-400">{filtered.length} results</span>
      </div>

      {/* Grid */}
      <main className="mx-auto max-w-7xl px-6 pb-16">
        {loading ? (
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-3 lg:grid-cols-4 pt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[4/5] rounded bg-neutral-50" />
                <div className="mt-3 h-4 w-3/4 rounded bg-neutral-100" />
                <div className="mt-2 h-5 w-1/3 rounded bg-neutral-100" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <Package className="h-12 w-12 text-neutral-200 mb-4" />
            <p className="text-lg text-neutral-400">No items found</p>
            <p className="mt-1 text-sm text-neutral-300">{search ? "Try a different search" : "Check back soon"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-3 lg:grid-cols-4 pt-4">
            {filtered.map((item) => {
              const price = listPrice(item);
              const imgs = getImages(item);
              return (
                <button
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className="group text-left focus:outline-none"
                >
                  {/* Image — no border, no box, white blends into page */}
                  <div className="relative aspect-[4/5] overflow-hidden">
                    {primaryImg(item) ? (
                      <img
                        src={primaryImg(item)!}
                        alt={item.item_name}
                        className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-neutral-50 rounded-lg">
                        <Package className="h-12 w-12 text-neutral-200" />
                      </div>
                    )}
                    {imgs.length > 1 && (
                      <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">
                        {imgs.length} photos
                      </div>
                    )}
                  </div>

                  <div className="mt-2">
                    {item.sku && (
                      <p className="text-[10px] tracking-widest uppercase text-neutral-300 mb-0.5">
                        Item ID: {item.sku}
                      </p>
                    )}
                    <h3 className="text-[13px] font-medium leading-snug text-neutral-700 group-hover:text-neutral-900 transition-colors line-clamp-2">
                      {item.item_name}
                    </h3>
                    {price != null && (
                      <p className="mt-1 text-lg font-bold tracking-tight text-red-600">
                        ${fmtPrice(price).whole}<sup className="text-xs font-semibold">.{fmtPrice(price).cents}</sup>
                      </p>
                    )}
                    <p className="mt-0.5 text-[10px] text-green-600 font-medium flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                      In Stock
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-4xl border-neutral-100 bg-white p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          {selected && (() => {
            const imgs = getImages(selected);
            const activeImg = imgs[activeThumb] || primaryImg(selected);
            const price = listPrice(selected);
            return (
              <div className="grid md:grid-cols-[1fr_1.1fr]">
                {/* Left: Gallery */}
                <div className="flex gap-3 p-6">
                  {/* Thumbnails column */}
                  {imgs.length > 1 && (
                    <div className="flex flex-col gap-2 shrink-0">
                      {imgs.map((src, i) => (
                        <button
                          key={i}
                          onClick={() => setActiveThumb(i)}
                          className={`h-14 w-14 rounded overflow-hidden transition-all ${
                            i === activeThumb ? "ring-2 ring-neutral-900" : "opacity-50 hover:opacity-100"
                          }`}
                        >
                          <img src={src} alt="" className="h-full w-full object-contain" />
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Main image */}
                  <div className="relative flex-1 flex items-center justify-center">
                    {activeImg ? (
                      <img src={activeImg} alt={selected.item_name} className="max-h-[60vh] max-w-full object-contain" />
                    ) : (
                      <span className="text-neutral-300">No image</span>
                    )}
                    {imgs.length > 1 && (
                      <>
                        <button onClick={() => setActiveThumb((p) => (p - 1 + imgs.length) % imgs.length)} className="absolute left-0 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1 shadow"><ChevronLeft className="h-4 w-4" /></button>
                        <button onClick={() => setActiveThumb((p) => (p + 1) % imgs.length)} className="absolute right-0 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1 shadow"><ChevronRight className="h-4 w-4" /></button>
                      </>
                    )}
                  </div>
                </div>

                {/* Right: Info */}
                <div className="p-8 flex flex-col justify-start border-l border-neutral-100">
                  <button onClick={() => setSelected(null)} className="absolute top-3 right-3 p-1 hover:bg-neutral-100 rounded-full"><X className="h-5 w-5 text-neutral-400" /></button>

                  {selected.sku && <p className="text-[10px] tracking-widest uppercase text-neutral-400 mb-1">Item ID: {selected.sku}</p>}
                  <h2 className="text-lg font-bold tracking-tight leading-tight">{selected.item_name}</h2>

                  {price != null && (
                    <p className="mt-4 text-3xl font-bold text-red-600">
                      ${fmtPrice(price).whole}<sup className="text-base font-semibold">.{fmtPrice(price).cents}</sup>
                    </p>
                  )}

                  <p className="mt-2 text-sm text-green-600 font-medium flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                    In Stock
                  </p>

                  {selected.condition_notes && (
                    <div className="mt-6 border-t border-neutral-100 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">Condition</p>
                      <p className="text-sm text-neutral-600 leading-relaxed">{selected.condition_notes}</p>
                    </div>
                  )}

                  {selected.pawn_shop_address && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">Location</p>
                      <p className="text-sm text-neutral-600">{selected.pawn_shop_address}</p>
                    </div>
                  )}

                  <a
                    href={`mailto:warren@stu25.com?subject=Inquiry: ${encodeURIComponent(selected.item_name)}${selected.sku ? ` (${selected.sku})` : ""}`}
                    className="mt-8 inline-flex items-center justify-center rounded-lg bg-neutral-900 px-8 py-3.5 text-sm font-semibold text-white hover:bg-neutral-700 transition-colors w-full"
                  >
                    Inquire About This Item
                  </a>

                  <div className="mt-6 grid grid-cols-2 gap-2">
                    {["Authenticated", "Free Inspection", "Secure Pickup", "Expert Staff"].map((f) => (
                      <div key={f} className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                        <span className="text-green-500">✓</span>{f}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t border-neutral-100 bg-neutral-50">
        <div className="mx-auto max-w-7xl px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
          <div>
            <h4 className="font-semibold text-neutral-800 mb-3">Categories</h4>
            {CATEGORIES.slice(1).map((c) => (
              <button key={c.key} onClick={() => { setActiveCategory(c.key); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="block text-neutral-500 hover:text-neutral-800 transition-colors mb-1.5">{c.label}</button>
            ))}
          </div>
          <div>
            <h4 className="font-semibold text-neutral-800 mb-3">Contact</h4>
            <a href="mailto:warren@stu25.com" className="block text-neutral-500 hover:text-neutral-800 mb-1.5">Email Us</a>
          </div>
          <div>
            <h4 className="font-semibold text-neutral-800 mb-3">About</h4>
            <p className="text-neutral-500 text-xs leading-relaxed">Curated premium music gear, luxury watches, jewelry, and designer goods. Every item inspected and authenticated.</p>
          </div>
          <div>
            <h4 className="font-semibold text-neutral-800 mb-3">The Collection</h4>
            <p className="text-neutral-500 text-xs">Las Vegas, NV</p>
            <p className="text-neutral-400 text-xs mt-2">© {new Date().getFullYear()} The Collection</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
