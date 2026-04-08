import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, ChevronRight, Guitar, Gem, Shirt, Package, ArrowRight, Camera, ArrowLeft } from "lucide-react";
import heroImg from "@/assets/store-hero.jpg";
import catMusic from "@/assets/cat-music.jpg";
import catJewelry from "@/assets/cat-jewelry.jpg";
import catDesigner from "@/assets/cat-designer.jpg";
import catCamera from "@/assets/cat-camera.jpg";
import logoImg from "@/assets/vivalapawn-logo.png";

interface StoreItem {
  id: string;
  item_name: string;
  sku: string | null;
  asking_price: number | null;
  wiggle_room_price: number | null;
  nobg_image_url: string | null;
  original_image_url: string | null;
  condition_notes: string | null;
  pawn_shop_address: string | null;
  meta: Record<string, unknown>;
}

/* ── Excluded keywords (wheelchairs, mobility scooters, power chairs) ── */
const EXCLUDED_KEYWORDS = ["wheelchair", "wheel chair", "mobility scooter", "power chair", "mobile scooter", "powerchair", "electric scooter", "mobility aid", "skateboard"];

const CATEGORIES = [
  { key: "all", label: "All Items", icon: Package, keywords: [] as string[], image: "", desc: "", priority: 0 },
  { key: "music", label: "Music & Instruments", icon: Guitar, image: catMusic, desc: "Guitars, amps, pedals & more", priority: 1, keywords: ["guitar","fender","gibson","amp","amplifier","pedal","bass guitar","drum","keyboard","piano","mic","microphone","speaker","audio","vinyl","record","turntable","saxophone","trumpet","violin","ukulele","banjo","mandolin","harmonica","synth","midi","headphone","music","instrument"] },
  { key: "designer", label: "Designer & Luxury", icon: Shirt, image: catDesigner, desc: "Louis Vuitton, Versace, Balenciaga & more", priority: 2, keywords: ["louis vuitton","gucci","prada","chanel","hermes","versace","burberry","dior","balenciaga","fendi","supreme","off-white","yeezy","jordan","nike","designer","luxury","handbag","purse","wallet","belt","sunglasses","shoe","sneaker","boot","lv"] },
  { key: "camera", label: "Camera & Gear", icon: Camera, image: catCamera, desc: "Cameras, lenses, accessories & gear", priority: 3, keywords: ["camera","canon","nikon","sony","lens","tripod","gopro","dslr","mirrorless","flash","photography","camcorder","film camera","fuji","olympus","panasonic","lumix","sigma","tamron","ring light","stabilizer","gimbal","sd card","memory card"] },
  { key: "jewelry", label: "Jewelry", icon: Gem, image: catJewelry, desc: "Necklaces, pendants, gold & diamonds", priority: 4, keywords: ["necklace","pendant","gold","diamond","chain","earring","platinum","carat","jewel","gem","brooch","karat","14k","18k","24k","10k","jewelry","jewellery"] },
];

function isExcluded(item: StoreItem): boolean {
  const text = `${item.item_name} ${item.condition_notes || ""}`.toLowerCase();
  return EXCLUDED_KEYWORDS.some((kw) => text.includes(kw));
}

/* Categorize into exactly ONE category (highest priority match wins) */
function categorizeItem(item: StoreItem): string[] {
  const text = `${item.item_name} ${item.condition_notes || ""}`.toLowerCase();
  // Also exclude skateboard-like items from jewelry
  const prioritized = CATEGORIES.slice(1)
    .filter(cat => cat.keywords.some((kw) => text.includes(kw)))
    .sort((a, b) => a.priority - b.priority);
  return prioritized.length ? [prioritized[0].key] : ["all"];
}

const fmtPrice = (price: number) => {
  const whole = Math.floor(price);
  const cents = String(Math.round((price % 1) * 100)).padStart(2, "0");
  return { whole: whole.toLocaleString(), cents };
};

export default function Store() {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const scrollToProducts = () => {
    setTimeout(() => {
      document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
    }, 80);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("arbitrage_items")
        .select("id, item_name, sku, asking_price, wiggle_room_price, nobg_image_url, original_image_url, condition_notes, pawn_shop_address, meta")
        .eq("status", "listed")
        .order("created_at", { ascending: false });
      // Filter out excluded items
      setItems(((data as StoreItem[]) || []).filter(i => !isExcluded(i)));
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = items;
    if (activeCategory && activeCategory !== "all") {
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

  const primaryImg = (i: StoreItem) => i.nobg_image_url || i.original_image_url;
  const listPrice = (i: StoreItem) => i.wiggle_room_price ?? i.asking_price;

  // When no category is selected, show only categories (landing mode)
  const showProducts = activeCategory !== null;

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Top banner */}
      <div className="bg-neutral-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2 text-[11px] tracking-widest uppercase">
          <span>Free Local Pickup · Las Vegas</span>
          <span className="hidden sm:block">Every Item Authenticated</span>
          <a href="tel:+14244651253" className="hover:text-neutral-300 transition-colors">📞 (424) 465-1253</a>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-neutral-100 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link to="/store" onClick={() => setActiveCategory(null)} className="block">
            <img src={logoImg} alt="VivaLaPawn" className="h-36 w-auto" />
          </Link>
          <div className="flex items-center gap-6">
            {showProducts && (
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…" className="pl-10 w-72 h-10 text-sm border-neutral-200 rounded-full bg-neutral-50 focus:bg-white" />
              </div>
            )}
            {CATEGORIES.slice(1).map((cat) => (
              <button key={cat.key} onClick={() => { setActiveCategory(cat.key); scrollToProducts(); }} className="hidden lg:flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 transition-colors">
                <cat.icon className="h-4 w-4" />
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative h-[70vh] min-h-[500px] overflow-hidden">
        <img src={heroImg} alt="VivaLaPawn" className="absolute inset-0 w-full h-full object-cover" width={1920} height={800} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
        <div className="relative z-10 mx-auto max-w-7xl px-6 h-full flex flex-col justify-center">
          <p className="text-amber-400 text-xs tracking-[0.3em] uppercase font-semibold mb-4">Las Vegas · Est. 2024</p>
          <h2 className="text-5xl md:text-7xl font-bold text-white tracking-tight leading-[1.1] max-w-2xl">
            Curated<br />Luxury &<br />Music Finds
          </h2>
          <p className="mt-6 text-lg text-white/70 max-w-lg leading-relaxed">
            Premium instruments, authentic jewelry, designer pieces & camera gear — inspected, authenticated, and ready for you.
          </p>
          <div className="mt-8 flex gap-4 flex-wrap">
            <button onClick={() => { setActiveCategory("all"); scrollToProducts(); }} className="bg-white text-neutral-900 px-8 py-3.5 rounded-lg text-sm font-semibold hover:bg-neutral-100 transition-colors flex items-center gap-2">
              Shop Now <ArrowRight className="h-4 w-4" />
            </button>
            <a href="sms:+14244651253" className="border border-white/30 text-white px-8 py-3.5 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors">
              Text Us
            </a>
          </div>
        </div>
      </section>

      {/* Category Cards */}
      <section className="mx-auto max-w-7xl px-6 -mt-16 relative z-20 pb-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {CATEGORIES.slice(1).map((cat) => (
            <button
              key={cat.key}
              onClick={() => { setActiveCategory(cat.key); scrollToProducts(); }}
              className="group relative h-56 rounded-xl overflow-hidden shadow-xl"
            >
              {cat.image ? (
                <img src={cat.image} alt={cat.label} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" width={640} height={640} />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6 text-left">
                <div className="flex items-center gap-2 text-white mb-1">
                  <cat.icon className="h-5 w-5 text-amber-400" />
                  <h3 className="text-lg font-bold">{cat.label}</h3>
                </div>
                <p className="text-white/60 text-sm">{cat.desc}</p>
                <p className="text-amber-400 text-xs mt-2 font-semibold tracking-wider uppercase flex items-center gap-1">
                  Shop {categoryCounts[cat.key] || 0} items <ArrowRight className="h-3 w-3" />
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Products — only shown after a category is selected */}
      {showProducts && (
        <section id="products" className="bg-neutral-50/50">
          {/* Category tabs */}
          <div className="border-b border-neutral-200 bg-white sticky top-[73px] z-20">
            <div className="mx-auto max-w-7xl px-6 flex items-center gap-8 overflow-x-auto">
              <button onClick={() => setActiveCategory(null)} className="flex items-center gap-1.5 py-3.5 text-sm font-medium text-neutral-400 hover:text-neutral-700 whitespace-nowrap">
                <ArrowLeft className="h-4 w-4" /> Categories
              </button>
              {CATEGORIES.map((cat) => {
                const active = activeCategory === cat.key;
                return (
                  <button key={cat.key} onClick={() => setActiveCategory(cat.key)} className={`relative flex items-center gap-2 py-3.5 text-sm font-medium whitespace-nowrap transition-colors ${active ? "text-neutral-900" : "text-neutral-400 hover:text-neutral-700"}`}>
                    <cat.icon className="h-4 w-4" />
                    {cat.label}
                    <span className="text-[10px] text-neutral-400">({categoryCounts[cat.key] || 0})</span>
                    {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-900 rounded-full" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mobile search */}
          <div className="mx-auto max-w-7xl px-6 pt-4 sm:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-10 h-10 text-sm border-neutral-200 rounded-full bg-white" />
            </div>
          </div>

          {/* Breadcrumb + count */}
          <div className="mx-auto max-w-7xl px-6 pt-5 pb-2 flex items-center gap-1.5 text-xs text-neutral-400">
            <button onClick={() => setActiveCategory(null)} className="hover:text-neutral-600 transition-colors">Home</button>
            <ChevronRight className="h-3 w-3" />
            <span className="text-neutral-600">{CATEGORIES.find((c) => c.key === activeCategory)?.label}</span>
            <span className="ml-auto">{filtered.length} results</span>
          </div>

          {/* Grid */}
          <div className="mx-auto max-w-7xl px-6 pb-20">
            {loading ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-4 pt-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-square rounded-lg bg-neutral-100" />
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
              <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-4 pt-4">
                {filtered.map((item) => {
                  const price = listPrice(item);
                  return (
                    <Link key={item.id} to={`/store/${item.id}`} className="group text-left focus:outline-none block">
                      <div className="relative aspect-square overflow-hidden rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow">
                        {primaryImg(item) ? (
                          <img src={primaryImg(item)!} alt={item.item_name} className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                        ) : (
                          <div className="flex h-full items-center justify-center"><Package className="h-12 w-12 text-neutral-200" /></div>
                        )}
                        <span className="absolute top-2 left-2 bg-neutral-900 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Used</span>
                      </div>
                      <div className="mt-3">
                        {item.sku && <p className="text-[10px] tracking-widest uppercase text-neutral-300 mb-0.5">Item ID: {item.sku}</p>}
                        <h3 className="text-[13px] font-medium leading-snug text-neutral-700 group-hover:text-neutral-900 transition-colors line-clamp-2">{item.item_name}</h3>
                        {price != null && (
                          <p className="mt-1 text-lg font-bold tracking-tight text-red-600">
                            ${fmtPrice(price).whole}<sup className="text-xs font-semibold">.{fmtPrice(price).cents}</sup>
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] text-amber-600 font-medium">Used — Great Condition</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-neutral-200 bg-neutral-900 text-white">
        <div className="mx-auto max-w-7xl px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
          <div>
            <img src={logoImg} alt="VivaLaPawn" className="h-10 w-auto brightness-0 invert mb-2" />
            <p className="text-neutral-400 text-xs leading-relaxed">Curated premium music gear, jewelry, designer goods & camera gear. Every item inspected and authenticated.</p>
          </div>
          <div>
            <h4 className="font-semibold mb-3 text-neutral-300 text-xs tracking-widest uppercase">Categories</h4>
            {CATEGORIES.slice(1).map((c) => (
              <button key={c.key} onClick={() => { setActiveCategory(c.key); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="block text-neutral-400 hover:text-white transition-colors mb-1.5">{c.label}</button>
            ))}
          </div>
          <div>
            <h4 className="font-semibold mb-3 text-neutral-300 text-xs tracking-widest uppercase">Payment Methods</h4>
            <p className="text-neutral-400 text-xs mb-1">💵 Cash (In Person)</p>
            <p className="text-neutral-400 text-xs mb-1">📱 Zelle — me@cozyhomestudio.com</p>
            <p className="text-neutral-400 text-xs mb-1">💸 CashApp — $itswarr</p>
            <p className="text-neutral-400 text-xs">🤝 Meet & Inspect</p>
          </div>
          <div>
            <h4 className="font-semibold mb-3 text-neutral-300 text-xs tracking-widest uppercase">Contact</h4>
            <a href="tel:+14244651253" className="block text-neutral-400 hover:text-white transition-colors mb-1.5">📞 (424) 465-1253</a>
            <a href="sms:+14244651253" className="block text-neutral-400 hover:text-white transition-colors mb-1.5">💬 Text Us (preferred)</a>
            <p className="text-neutral-500 text-xs mt-2">Las Vegas, NV</p>
            <p className="text-neutral-600 text-xs mt-4">© {new Date().getFullYear()} VivaLaPawn</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
