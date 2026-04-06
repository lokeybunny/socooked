import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const askingPrice = formData.get("asking_price") as string | null;
    const wigglePrice = formData.get("wiggle_room_price") as string | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "file is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Upload original image to storage
    const fileBuffer = await file.arrayBuffer();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `arbitrage/${Date.now()}_${safeName}`;
    const { error: uploadErr } = await supabase.storage
      .from("content-uploads")
      .upload(storagePath, new Uint8Array(fileBuffer), {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { data: urlData } = supabase.storage.from("content-uploads").getPublicUrl(storagePath);
    const originalUrl = urlData?.publicUrl || "";

    // 2. Generate SKU
    const sku = String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
      String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
      String(Math.floor(Math.random() * 100)).padStart(2, "0");

    // 3. Check default address
    let resolvedAddress: string | null = null;
    let matchedStoreId: string | null = null;
    {
      const { data: defCfg } = await supabase.from("site_configs")
        .select("content").eq("site_id", "arbitrage").eq("section", "default-address").maybeSingle();
      const defContent = defCfg?.content as any;
      if (defContent?.enabled && defContent?.address) {
        resolvedAddress = defContent.address;
      }
    }

    // 4. Store matching
    if (resolvedAddress) {
      const normAddr = resolvedAddress.toLowerCase().replace(/[^a-z0-9]/g, "");
      const { data: allStores } = await supabase.from("arbitrage_stores").select("*");
      if (allStores) {
        const match = allStores.find((s: any) => s.address && s.address.toLowerCase().replace(/[^a-z0-9]/g, "") === normAddr);
        if (match) {
          matchedStoreId = match.id;
        } else {
          const { data: newStore } = await supabase.from("arbitrage_stores").insert({
            store_name: resolvedAddress,
            address: resolvedAddress,
          }).select("id").single();
          if (newStore) matchedStoreId = newStore.id;
        }
      }
    }

    // 5. Insert item
    const { data: arbItem, error: insertErr } = await supabase.from("arbitrage_items").insert({
      item_name: safeName,
      original_image_url: originalUrl,
      status: "new",
      sku,
      pawn_shop_address: resolvedAddress,
      store_id: matchedStoreId,
      asking_price: askingPrice ? parseFloat(askingPrice) : null,
      wiggle_room_price: wigglePrice ? parseFloat(wigglePrice) : null,
    }).select("id, sku").single();

    if (insertErr || !arbItem) throw new Error(insertErr?.message || "Insert failed");

    // 6. AI Background removal + price tag removal
    let nobgUrl: string | null = null;
    try {
      const { data: bgCfg } = await supabase.from("site_configs")
        .select("content").eq("site_id", "arbitrage").eq("section", "bg-removal").maybeSingle();
      const bgEnabled = (bgCfg?.content as any)?.enabled !== false;
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

      if (LOVABLE_API_KEY && bgEnabled) {
        const bgRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-pro-image-preview",
            messages: [{
              role: "user",
              content: [
                { type: "image_url", image_url: { url: originalUrl } },
                { type: "text", text: "Remove the background from this image completely. Replace the background with a clean solid white background (#FFFFFF). Keep only the main subject/item centered on the white background. Do not use transparency. CRITICAL INSTRUCTION: If there are ANY price tags, price stickers, price labels, barcode stickers, handwritten prices, or any marking showing a dollar amount or price on the item, you MUST completely remove them and reconstruct the surface underneath so it looks like the sticker/tag was never there. Do NOT replace them with new text or numbers — leave the area completely clean and natural. The final image must have ZERO visible pricing of any kind." },
              ],
            }],
            modalities: ["image", "text"],
          }),
        });

        if (bgRes.ok) {
          const bgData = await bgRes.json();
          const choice = bgData.choices?.[0]?.message;
          let base64Img: string | null = null;

          if (choice?.images && Array.isArray(choice.images)) {
            for (const img of choice.images) {
              if (img.type === "image_url" && img.image_url?.url) {
                if (img.image_url.url.startsWith("data:")) base64Img = img.image_url.url;
                else nobgUrl = img.image_url.url;
                break;
              }
            }
          }

          if (!nobgUrl && !base64Img && Array.isArray(choice?.content)) {
            for (const part of choice.content) {
              if (part.type === "image_url" && part.image_url?.url) {
                if (part.image_url.url.startsWith("data:")) base64Img = part.image_url.url;
                else nobgUrl = part.image_url.url;
                break;
              }
            }
          }

          if (base64Img && !nobgUrl) {
            const match = base64Img.match(/^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/);
            if (match) {
              const ext = match[1] === "jpeg" ? "jpg" : match[1];
              const raw = match[2];
              const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
              const nobgPath = `arbitrage/${Date.now()}_nobg.${ext}`;
              const { error: nobgUpErr } = await supabase.storage
                .from("content-uploads")
                .upload(nobgPath, bytes, { contentType: `image/${match[1]}`, upsert: true });
              if (!nobgUpErr) {
                const { data: nobgPub } = supabase.storage.from("content-uploads").getPublicUrl(nobgPath);
                nobgUrl = nobgPub?.publicUrl || null;
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("[arbitrage-upload] bg removal error:", e);
    }

    if (nobgUrl) {
      await supabase.from("arbitrage_items").update({ nobg_image_url: nobgUrl }).eq("id", arbItem.id);
    }

    // Calculate profit
    const asking = askingPrice ? parseFloat(askingPrice) : null;
    const wiggle = wigglePrice ? parseFloat(wigglePrice) : null;
    const profit = asking != null && wiggle != null ? wiggle - asking : null;

    return new Response(JSON.stringify({
      success: true,
      item_id: arbItem.id,
      sku: arbItem.sku,
      original_url: originalUrl,
      nobg_url: nobgUrl,
      address: resolvedAddress,
      store_id: matchedStoreId,
      profit,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[arbitrage-upload] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
