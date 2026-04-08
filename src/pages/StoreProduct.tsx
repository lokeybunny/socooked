import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Package, MapPin, Shield, Truck, Eye, ArrowLeft } from "lucide-react";

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

const fmtPrice = (price: number) => {
  const whole = Math.floor(price);
  const cents = String(Math.round((price % 1) * 100)).padStart(2, "0");
  return { whole: whole.toLocaleString(), cents };
};

export default function StoreProduct() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<StoreItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("arbitrage_items")
        .select("id, item_name, sku, asking_price, wiggle_room_price, nobg_image_url, original_image_url, extra_images, condition_notes, pawn_shop_address, meta")
        .eq("id", id)
        .eq("status", "listed")
        .maybeSingle();
      setItem(data as StoreItem | null);
      setLoading(false);
    })();
  }, [id]);

  const getImages = (i: StoreItem) => {
    const imgs: string[] = [];
    if (i.nobg_image_url) imgs.push(i.nobg_image_url);
    if (i.original_image_url) imgs.push(i.original_image_url);
    if (i.extra_images) imgs.push(...i.extra_images.filter(Boolean));
    return imgs;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse text-neutral-300">Loading…</div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <Package className="h-16 w-16 text-neutral-200" />
        <p className="text-lg text-neutral-400">Item not found</p>
        <Link to="/store" className="text-sm text-neutral-600 hover:text-neutral-900 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Store
        </Link>
      </div>
    );
  }

  const imgs = getImages(item);
  const currentImg = imgs[activeImg] || item.nobg_image_url || item.original_image_url;
  const price = item.wiggle_room_price ?? item.asking_price;

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Top banner */}
      <div className="bg-neutral-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2 text-[11px] tracking-widest uppercase">
          <span>Free Local Pickup · Las Vegas</span>
          <span className="hidden sm:block">Every Item Authenticated</span>
          <a href="mailto:warren@stu25.com" className="hover:text-neutral-300 transition-colors">Contact Us</a>
        </div>
      </div>

      {/* Header */}
      <header className="border-b border-neutral-100 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link to="/store" className="block">
            <h1 className="text-2xl font-bold tracking-tight">The&nbsp;Collection</h1>
            <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-400 mt-0.5">Music · Luxury · Rare Finds</p>
          </Link>
          <Link to="/store" className="text-sm text-neutral-500 hover:text-neutral-900 flex items-center gap-1 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Store
          </Link>
        </div>
      </header>

      {/* Breadcrumb */}
      <div className="mx-auto max-w-7xl px-6 pt-5 pb-2 flex items-center gap-1.5 text-xs text-neutral-400">
        <Link to="/store" className="hover:text-neutral-600 transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <Link to="/store" className="hover:text-neutral-600 transition-colors">All Items</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-neutral-600 truncate max-w-[200px]">{item.item_name}</span>
      </div>

      {/* Product */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid lg:grid-cols-[1fr_1fr] gap-12">
          {/* Left: Image gallery */}
          <div className="flex gap-4">
            {/* Thumbnails */}
            {imgs.length > 1 && (
              <div className="flex flex-col gap-2 shrink-0">
                {imgs.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    className={`h-16 w-16 rounded-lg overflow-hidden border-2 transition-all ${
                      i === activeImg ? "border-neutral-900 shadow-md" : "border-neutral-200 opacity-50 hover:opacity-100"
                    }`}
                  >
                    <img src={src} alt="" className="h-full w-full object-contain bg-white p-1" />
                  </button>
                ))}
              </div>
            )}
            {/* Main image */}
            <div className="relative flex-1 bg-neutral-50 rounded-xl flex items-center justify-center min-h-[400px] lg:min-h-[500px]">
              {currentImg ? (
                <img src={currentImg} alt={item.item_name} className="max-h-[70vh] max-w-full object-contain p-6" />
              ) : (
                <Package className="h-20 w-20 text-neutral-200" />
              )}
              {imgs.length > 1 && (
                <>
                  <button onClick={() => setActiveImg((p) => (p - 1 + imgs.length) % imgs.length)} className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2 shadow-md transition-colors">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button onClick={() => setActiveImg((p) => (p + 1) % imgs.length)} className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2 shadow-md transition-colors">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
              {imgs.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {imgs.map((_, i) => (
                    <button key={i} onClick={() => setActiveImg(i)} className={`h-2 rounded-full transition-all ${i === activeImg ? "w-6 bg-neutral-900" : "w-2 bg-neutral-300"}`} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Details */}
          <div className="flex flex-col">
            {item.sku && <p className="text-[11px] tracking-widest uppercase text-neutral-400 mb-2">Item ID: {item.sku}</p>}
            <h2 className="text-2xl lg:text-3xl font-bold tracking-tight leading-tight">{item.item_name}</h2>

            {price != null && (
              <p className="mt-4 text-4xl font-bold text-red-600">
                <span className="text-xl align-super">$</span>
                {fmtPrice(price).whole}
                <span className="text-xl align-super">.{fmtPrice(price).cents}</span>
              </p>
            )}

            <div className="mt-3 flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
              <span className="text-sm text-green-600 font-semibold">In Stock — Ready for Pickup</span>
            </div>

            {/* Trust badges */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                { icon: Shield, label: "Authenticated", desc: "Every item verified" },
                { icon: Eye, label: "Free Inspection", desc: "See before you buy" },
                { icon: Truck, label: "Local Pickup", desc: "Las Vegas, NV" },
                { icon: MapPin, label: "Meet in Person", desc: "Safe & secure" },
              ].map((b) => (
                <div key={b.label} className="flex items-start gap-2.5 p-3 rounded-lg bg-neutral-50 border border-neutral-100">
                  <b.icon className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-neutral-800">{b.label}</p>
                    <p className="text-[10px] text-neutral-500">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Payment Methods */}
            <div className="mt-8 border-t border-neutral-100 pt-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-4">Payment Methods</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-4 p-4 rounded-xl border border-neutral-200 bg-white">
                  <span className="text-2xl">🤝</span>
                  <div>
                    <p className="text-sm font-semibold">Meet in Person</p>
                    <p className="text-xs text-neutral-500">Inspect the item and pay with cash in Las Vegas</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-xl border border-neutral-200 bg-white">
                  <span className="text-2xl">💜</span>
                  <div>
                    <p className="text-sm font-semibold">Zelle</p>
                    <p className="text-xs text-neutral-500">Send directly to warren@stu25.com</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-xl border border-neutral-200 bg-white">
                  <span className="text-2xl">💚</span>
                  <div>
                    <p className="text-sm font-semibold">CashApp</p>
                    <p className="text-xs text-neutral-500">Send via CashApp for instant payment</p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <a
              href={`mailto:warren@stu25.com?subject=I want to buy: ${encodeURIComponent(item.item_name)}${item.sku ? ` (${item.sku})` : ""}${price ? ` — $${price}` : ""}`}
              className="mt-8 inline-flex items-center justify-center rounded-xl bg-neutral-900 px-8 py-4 text-base font-bold text-white hover:bg-neutral-700 transition-colors w-full"
            >
              Buy This Item
            </a>

            <a
              href={`mailto:warren@stu25.com?subject=Inquiry: ${encodeURIComponent(item.item_name)}${item.sku ? ` (${item.sku})` : ""}`}
              className="mt-3 inline-flex items-center justify-center rounded-xl border-2 border-neutral-200 px-8 py-3.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors w-full"
            >
              Ask a Question
            </a>

            {/* Condition & Location */}
            {(item.condition_notes || item.pawn_shop_address) && (
              <div className="mt-8 border-t border-neutral-100 pt-6 space-y-4">
                {item.condition_notes && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-1">Condition Notes</p>
                    <p className="text-sm text-neutral-600 leading-relaxed">{item.condition_notes}</p>
                  </div>
                )}
                {item.pawn_shop_address && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-1">Pickup Location</p>
                    <p className="text-sm text-neutral-600 flex items-center gap-1.5"><MapPin className="h-4 w-4 text-neutral-400" /> {item.pawn_shop_address}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 bg-neutral-900 text-white mt-16">
        <div className="mx-auto max-w-7xl px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <div>
            <p className="font-bold text-lg">The Collection</p>
            <p className="text-neutral-500 text-xs mt-1">Las Vegas, NV · © {new Date().getFullYear()}</p>
          </div>
          <div className="flex gap-6 text-neutral-400 text-xs">
            <Link to="/store" className="hover:text-white transition-colors">All Items</Link>
            <a href="mailto:warren@stu25.com" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
