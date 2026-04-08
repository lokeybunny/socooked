import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ChevronRight, Guitar, Gem, Shirt, Package, X, ChevronLeft } from "lucide-react";

interface StoreItem {
  id: string;
  item_name: string;
  sku: string | null;
  asking_price: number | null;
  nobg_image_url: string | null;
  original_image_url: string | null;
  extra_images: string[] | null;
  condition_notes: string | null;
  pawn_shop_address: string | null;
  meta: Record<string, unknown>;
}

const CATEGORIES = [
  { key: "all", label: "All Items", icon: Package },
  { key: "music", label: "Music & Instruments", icon: Guitar, keywords: ["guitar", "fender", "gibson", "amp", "amplifier", "pedal", "bass", "drum", "keyboard", "piano", "mic", "microphone", "speaker", "audio", "vinyl", "record", "turntable", "saxophone", "trumpet", "violin", "ukulele", "banjo", "mandolin", "harmonica", "synth", "midi", "monitor", "headphone", "cable", "strings", "pick", "capo", "tuner", "music", "instrument"] },
  { key: "jewelry", label: "Jewelry & Watches", icon: Gem, keywords: ["ring", "necklace", "bracelet", "watch", "rolex", "chain", "pendant", "earring", "diamond", "gold", "silver", "platinum", "carat", "jewel", "gem", "brooch", "cuff", "bangle", "anklet", "choker", "tiara", "crown"] },
  { key: "designer", label: "Designer & Luxury", icon: Shirt, keywords: ["louis vuitton", "gucci", "prada", "chanel", "hermes", "versace", "burberry", "dior", "balenciaga", "fendi", "supreme", "off-white", "yeezy", "jordan", "nike", "designer", "luxury", "handbag", "purse", "wallet", "belt", "sunglasses", "shoe", "sneaker", "boot"] },
];

function categorizeItem(item: StoreItem): string[] {
  const name = item.item_name.toLowerCase();
  const notes = (item.condition_notes || "").toLowerCase();
  const text = `${name} ${notes}`;
  const matched: string[] = [];
  for (const cat of CATEGORIES.slice(1)) {
    if (cat.keywords!.some((kw) => text.includes(kw))) matched.push(cat.key);
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
        .select("id, item_name, sku, asking_price, nobg_image_url, original_image_url, extra_images, condition_notes, pawn_shop_address, meta")
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

  useEffect(() => { setActiveThumb(0); }, [selected]);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Top Bar */}
      <div className="border-b border-neutral-100 bg-neutral-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2 text-xs tracking-widest uppercase">
          <span>Free Shipping on Orders $500+</span>
          <span>Authenticated Luxury</span>
          <a href="tel:+17025551234" className="hover:text-neutral-300 transition-colors">Contact: (702) 555-1234</a>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-neutral-100 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">The&nbsp;Collection</h1>
            <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-400 mt-0.5">Music · Luxury · Rare Finds</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items or SKU…"
                className="pl-10 w-64 h-9 text-sm border-neutral-200 rounded-full bg-neutral-50 focus:bg-white"
              />
            </div>
            <Badge variant="outline" className="border-neutral-200 text-neutral-500 text-[11px] tracking-widest uppercase whitespace-nowrap">
              {filtered.length} {filtered.length === 1 ? "piece" : "pieces"}
            </Badge>
          </div>
        </div>
      </header>

      {/* Category Nav */}
      <nav className="border-b border-neutral-100 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-center gap-1 overflow-x-auto py-3 scrollbar-hide">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const count = categoryCounts[cat.key] || 0;
              const active = activeCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                    active
                      ? "bg-neutral-900 text-white shadow-sm"
                      : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {cat.label}
                  <span className={`text-[10px] ${active ? "text-neutral-300" : "text-neutral-400"}`}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Breadcrumb */}
      <div className="mx-auto max-w-7xl px-6 pt-6">
        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
          <button onClick={() => setActiveCategory("all")} className="hover:text-neutral-600 transition-colors">Home</button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-neutral-600">{CATEGORIES.find((c) => c.key === activeCategory)?.label || "All Items"}</span>
        </div>
      </div>

      {/* Mobile Search */}
      <div className="mx-auto max-w-7xl px-6 pt-4 sm:hidden">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items or SKU…"
            className="pl-10 h-10 text-sm border-neutral-200 rounded-full bg-neutral-50"
          />
        </div>
      </div>

      {/* Grid */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {loading ? (
          <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square rounded-lg bg-neutral-100" />
                <div className="mt-3 h-4 w-3/4 rounded bg-neutral-100" />
                <div className="mt-2 h-3 w-1/2 rounded bg-neutral-50" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <Package className="h-12 w-12 text-neutral-200 mb-4" />
            <p className="text-lg text-neutral-400">No items found</p>
            <p className="mt-1 text-sm text-neutral-300">
              {search ? "Try a different search term" : "Check back soon for new arrivals"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((item) => {
              const imgs = getImages(item);
              return (
                <button
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className="group text-left transition-all focus:outline-none"
                >
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-neutral-50 border border-neutral-100">
                    {primaryImg(item) ? (
                      <img
                        src={primaryImg(item)!}
                        alt={item.item_name}
                        className="h-full w-full object-contain p-4 transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-neutral-200">
                        <Package className="h-12 w-12" />
                      </div>
                    )}
                    {imgs.length > 1 && (
                      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                        {imgs.length} photos
                      </div>
                    )}
                    {item.asking_price && item.asking_price >= 1000 && (
                      <div className="absolute top-2 left-2 bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded tracking-widest uppercase">
                        Premium
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    {item.sku && (
                      <p className="text-[10px] tracking-widest uppercase text-neutral-400 mb-0.5">
                        Item ID: {item.sku}
                      </p>
                    )}
                    <h3 className="text-sm font-medium leading-tight text-neutral-800 group-hover:text-neutral-600 transition-colors line-clamp-2">
                      {item.item_name}
                    </h3>
                    {item.asking_price != null && (
                      <p className="mt-1.5 text-base font-bold tracking-tight">
                        <span className="text-xs font-normal align-super">$</span>
                        {Math.floor(item.asking_price).toLocaleString()}
                        <span className="text-xs font-normal align-super">
                          .{String(Math.round((item.asking_price % 1) * 100)).padStart(2, "0")}
                        </span>
                      </p>
                    )}
                    {item.pawn_shop_address && (
                      <p className="mt-1 text-[10px] text-neutral-400 truncate">📍 {item.pawn_shop_address}</p>
                    )}
                    <div className="mt-2 flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                      <span className="text-[10px] text-green-600 font-medium">In Stock</span>
                    </div>
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
            return (
              <div className="grid md:grid-cols-2">
                {/* Left: Image gallery */}
                <div className="bg-neutral-50 p-6 flex flex-col">
                  <div className="relative aspect-square flex items-center justify-center mb-4">
                    {activeImg ? (
                      <img src={activeImg} alt={selected.item_name} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-neutral-200 text-sm">No image</span>
                    )}
                    {imgs.length > 1 && (
                      <>
                        <button
                          onClick={() => setActiveThumb((p) => (p - 1 + imgs.length) % imgs.length)}
                          className="absolute left-1 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow transition-colors"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setActiveThumb((p) => (p + 1) % imgs.length)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow transition-colors"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                  {imgs.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {imgs.map((src, i) => (
                        <button
                          key={i}
                          onClick={() => setActiveThumb(i)}
                          className={`shrink-0 h-16 w-16 rounded border-2 overflow-hidden transition-all ${
                            i === activeThumb ? "border-neutral-900" : "border-neutral-200 opacity-60 hover:opacity-100"
                          }`}
                        >
                          <img src={src} alt="" className="h-full w-full object-contain bg-white p-1" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: Details */}
                <div className="flex flex-col justify-start p-8">
                  <button
                    onClick={() => setSelected(null)}
                    className="absolute top-4 right-4 p-1 hover:bg-neutral-100 rounded-full transition-colors"
                  >
                    <X className="h-5 w-5 text-neutral-400" />
                  </button>

                  <div className="flex items-center gap-2 mb-1">
                    {selected.sku && (
                      <span className="text-[10px] tracking-widest uppercase text-neutral-400">Item ID: {selected.sku}</span>
                    )}
                  </div>

                  <h2 className="text-xl font-bold tracking-tight leading-tight">{selected.item_name}</h2>

                  {selected.asking_price != null && (
                    <p className="mt-4 text-3xl font-bold tracking-tight text-neutral-900">
                      <span className="text-lg align-super">$</span>
                      {Math.floor(selected.asking_price).toLocaleString()}
                      <span className="text-lg align-super">
                        .{String(Math.round((selected.asking_price % 1) * 100)).padStart(2, "0")}
                      </span>
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm text-green-600 font-medium">In Stock</span>
                  </div>

                  <div className="mt-6 border-t border-neutral-100 pt-6 space-y-4">
                    {selected.condition_notes && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">Condition Notes</p>
                        <p className="text-sm text-neutral-600 leading-relaxed">{selected.condition_notes}</p>
                      </div>
                    )}
                    {selected.pawn_shop_address && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">Location</p>
                        <p className="text-sm text-neutral-600">{selected.pawn_shop_address}</p>
                      </div>
                    )}
                  </div>

                  <a
                    href={`mailto:warren@stu25.com?subject=Inquiry: ${encodeURIComponent(selected.item_name)}${selected.sku ? ` (${selected.sku})` : ""}`}
                    className="mt-8 inline-flex items-center justify-center rounded-lg bg-neutral-900 px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 w-full"
                  >
                    Inquire About This Item
                  </a>

                  <a
                    href="tel:+17025551234"
                    className="mt-3 inline-flex items-center justify-center rounded-lg border-2 border-neutral-200 px-8 py-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 w-full"
                  >
                    Call to Purchase
                  </a>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    {["Authenticated", "Free Inspection", "Secure Pickup", "Expert Staff"].map((feat) => (
                      <div key={feat} className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                        <span className="text-green-500">✓</span>
                        {feat}
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
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
            <div>
              <h4 className="font-semibold text-neutral-800 mb-3">Categories</h4>
              {CATEGORIES.slice(1).map((c) => (
                <button key={c.key} onClick={() => { setActiveCategory(c.key); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="block text-neutral-500 hover:text-neutral-800 transition-colors mb-1.5">
                  {c.label}
                </button>
              ))}
            </div>
            <div>
              <h4 className="font-semibold text-neutral-800 mb-3">Support</h4>
              <a href="mailto:warren@stu25.com" className="block text-neutral-500 hover:text-neutral-800 transition-colors mb-1.5">Email Us</a>
              <a href="tel:+17025551234" className="block text-neutral-500 hover:text-neutral-800 transition-colors mb-1.5">(702) 555-1234</a>
            </div>
            <div>
              <h4 className="font-semibold text-neutral-800 mb-3">About</h4>
              <p className="text-neutral-500 text-xs leading-relaxed">Curated collection of premium music gear, luxury watches, jewelry, and designer goods. Every item inspected and authenticated.</p>
            </div>
            <div>
              <h4 className="font-semibold text-neutral-800 mb-3">The Collection</h4>
              <p className="text-neutral-500 text-xs leading-relaxed">Las Vegas, NV</p>
              <p className="text-neutral-400 text-xs mt-2">© {new Date().getFullYear()} The Collection</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
