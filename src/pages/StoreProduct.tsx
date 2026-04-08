import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, Package, MapPin, Shield, Truck, Eye, ArrowLeft, Phone, MessageSquare } from "lucide-react";
import logoImg from "@/assets/vivalapawn-logo.png";

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
  const [showCashApp, setShowCashApp] = useState(false);

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

  // Only use the primary/featured image
  const currentImg = item.nobg_image_url || item.original_image_url;
  const price = item.wiggle_room_price ?? item.asking_price;

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
      <header className="border-b border-neutral-100 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link to="/store" className="block">
            <img src={logoImg} alt="VivaLaPawn" className="h-12 w-auto" />
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
          {/* Left: Single featured image */}
          <div className="relative bg-neutral-50 rounded-xl flex items-center justify-center min-h-[400px] lg:min-h-[500px]">
            {currentImg ? (
              <img src={currentImg} alt={item.item_name} className="max-h-[70vh] max-w-full object-contain p-6" />
            ) : (
              <Package className="h-20 w-20 text-neutral-200" />
            )}
            <span className="absolute top-4 left-4 bg-neutral-900 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">Used</span>
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

            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
                <span className="text-sm text-green-600 font-semibold">In Stock — Ready for Pickup</span>
              </div>
              <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Used — Great Condition</span>
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

            {/* Buy This Item — CashApp or Zelle */}
            <button
              onClick={() => setShowCashApp(true)}
              className="mt-8 inline-flex items-center justify-center rounded-xl bg-neutral-900 px-8 py-4 text-base font-bold text-white hover:bg-neutral-700 transition-colors w-full"
            >
              Buy This Item
            </button>

            {showCashApp && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowCashApp(false)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-100 shrink-0">
                    <h3 className="text-lg font-bold">Choose Payment Method</h3>
                    <button onClick={() => setShowCashApp(false)} className="text-neutral-400 hover:text-neutral-900 text-2xl leading-none">&times;</button>
                  </div>
                  <div className="grid md:grid-cols-[2fr_1fr] flex-1 min-h-0">
                    <div className="p-4 flex flex-col border-r border-neutral-100">
                      <p className="text-sm font-bold mb-2 text-center">💸 Pay with CashApp</p>
                      <iframe
                        src="https://cash.app/$itswarr"
                        className="w-full flex-1 min-h-[500px] rounded-lg border border-neutral-200"
                        title="CashApp Payment"
                      />
                    </div>
                    <div className="p-6 text-center flex flex-col items-center justify-center">
                      <p className="text-sm font-bold mb-4">💜 Pay with Zelle</p>
                      <div className="bg-neutral-50 rounded-lg p-6 border border-neutral-200">
                        <p className="text-xs text-neutral-500 mb-1">Send payment to:</p>
                        <p className="text-lg font-bold text-neutral-900">me@cozyhomestudio.com</p>
                        <p className="text-xs text-neutral-400 mt-2">Use your bank's Zelle feature</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-neutral-50 text-center border-t border-neutral-100 shrink-0">
                    <p className="text-xs text-neutral-500">Include item name "<strong>{item.item_name}</strong>" in payment note</p>
                  </div>
                </div>
              </div>
            )}

            {/* Contact for inquiries */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <a
                href="sms:+14244651253"
                className="inline-flex items-center justify-center rounded-xl border-2 border-neutral-200 px-4 py-3.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors gap-2"
              >
                <MessageSquare className="h-4 w-4" /> Text Us (Preferred)
              </a>
              <a
                href="tel:+14244651253"
                className="inline-flex items-center justify-center rounded-xl border-2 border-neutral-200 px-4 py-3.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors gap-2"
              >
                <Phone className="h-4 w-4" /> Call (424) 465-1253
              </a>
            </div>

            {/* Condition & Location */}
            <div className="mt-8 border-t border-neutral-100 pt-6 space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-1">Condition</p>
                <p className="text-sm text-neutral-600 leading-relaxed">{item.condition_notes || "Used — in great condition. Inspected and authenticated."}</p>
              </div>
              {item.pawn_shop_address && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-1">Pickup Location</p>
                  <p className="text-sm text-neutral-600 flex items-center gap-1.5"><MapPin className="h-4 w-4 text-neutral-400" /> {item.pawn_shop_address}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 bg-neutral-900 text-white mt-16">
        <div className="mx-auto max-w-7xl px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <div>
            <p className="font-bold text-lg">VivaLaPawn</p>
            <p className="text-neutral-500 text-xs mt-1">Las Vegas, NV · © {new Date().getFullYear()}</p>
          </div>
          <div className="flex gap-6 text-neutral-400 text-xs">
            <Link to="/store" className="hover:text-white transition-colors">All Items</Link>
            <a href="tel:+14244651253" className="hover:text-white transition-colors">📞 (424) 465-1253</a>
            <a href="sms:+14244651253" className="hover:text-white transition-colors">💬 Text Us</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
