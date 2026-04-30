// Fetch Zillow listing data + images via Apify, persist to properties + property_images,
// then auto-tag each image with AI vision (Lovable AI Gateway / Gemini).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ROOM_TYPES = [
  "kitchen",
  "living_room",
  "bedroom",
  "bathroom",
  "exterior_front",
  "backyard",
  "dining_room",
  "garage",
  "other",
];

async function classifyImage(imageUrl: string, apiKey: string): Promise<{ room_type: string; ai_tag: string }> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "You classify real-estate listing photos. Respond ONLY with strict JSON: {\"room_type\":\"<one of: kitchen, living_room, bedroom, bathroom, exterior_front, backyard, dining_room, garage, other>\",\"ai_tag\":\"<3-6 word descriptive caption>\"}",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Classify this real-estate photo." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { room_type: "other", ai_tag: "" };
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { room_type: "other", ai_tag: "" };
    const parsed = JSON.parse(match[0]);
    const rt = String(parsed.room_type || "other").toLowerCase();
    return {
      room_type: ROOM_TYPES.includes(rt) ? rt : "other",
      ai_tag: String(parsed.ai_tag || "").slice(0, 120),
    };
  } catch (_e) {
    return { room_type: "other", ai_tag: "" };
  }
}

async function runApify(zillowUrl: string, apifyToken: string): Promise<any | null> {
  // Apify Zillow Detail Scraper
  const actorId = "maxcopell~zillow-detail-scraper";
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}&timeout=120`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startUrls: [{ url: zillowUrl }] }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify error ${res.status}: ${text.slice(0, 300)}`);
  }
  const items = await res.json();
  return Array.isArray(items) && items.length ? items[0] : null;
}

function pickImages(item: any): string[] {
  const out = new Set<string>();
  const addIf = (v: any) => {
    if (typeof v === "string" && v.startsWith("http")) out.add(v);
  };
  if (Array.isArray(item?.photos)) {
    for (const p of item.photos) {
      addIf(p?.url);
      addIf(p?.mixedSources?.jpeg?.[0]?.url);
      if (Array.isArray(p?.mixedSources?.jpeg)) p.mixedSources.jpeg.forEach((m: any) => addIf(m?.url));
    }
  }
  if (Array.isArray(item?.images)) item.images.forEach(addIf);
  if (Array.isArray(item?.image_urls)) item.image_urls.forEach(addIf);
  if (Array.isArray(item?.responsivePhotos)) {
    item.responsivePhotos.forEach((p: any) => addIf(p?.url));
  }
  return Array.from(out).slice(0, 60);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const apifyToken = Deno.env.get("APIFY_TOKEN");
    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apifyToken) throw new Error("APIFY_TOKEN not configured");
    if (!aiKey) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const zillowUrl: string = String(body?.zillow_url || "").trim();
    if (!zillowUrl || !/zillow\.com/i.test(zillowUrl)) {
      return new Response(JSON.stringify({ error: "Valid zillow_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert pending property
    const { data: existing } = await sb.from("properties").select("id").eq("zillow_url", zillowUrl).maybeSingle();
    const propertyId = existing?.id || (await sb.from("properties").insert({ zillow_url: zillowUrl, status: "scraping" }).select("id").single()).data?.id;
    if (!propertyId) throw new Error("Failed to create property row");
    await sb.from("properties").update({ status: "scraping" }).eq("id", propertyId);

    // Apify scrape
    const item = await runApify(zillowUrl, apifyToken);
    if (!item) {
      await sb.from("properties").update({ status: "failed" }).eq("id", propertyId);
      throw new Error("Apify returned no items");
    }

    const addr = item?.address;
    const addressStr =
      typeof addr === "string"
        ? addr
        : [addr?.streetAddress, addr?.city, addr?.state, addr?.zipcode].filter(Boolean).join(", ") ||
          item?.streetAddress || item?.fullAddress || "";

    const images = pickImages(item);
    const thumbnail = item?.imgSrc || item?.hiResImageLink || images[0] || null;

    await sb
      .from("properties")
      .update({
        listing_id: item?.zpid ? String(item.zpid) : (item?.id ? String(item.id) : null),
        address: addressStr || null,
        price: Number(item?.price) || Number(item?.unformattedPrice) || null,
        beds: Number(item?.bedrooms) || Number(item?.beds) || null,
        baths: Number(item?.bathrooms) || Number(item?.baths) || null,
        sqft: Number(item?.livingArea) || Number(item?.sqft) || null,
        thumbnail_url: thumbnail,
        status: images.length ? "tagging" : "no_images",
        meta: { raw_keys: Object.keys(item || {}).slice(0, 50) },
      })
      .eq("id", propertyId);

    // Replace existing images
    await sb.from("property_images").delete().eq("property_id", propertyId);

    // Insert images first (untagged) so UI can show fast
    if (images.length) {
      const rows = images.map((u, i) => ({ property_id: propertyId, image_url: u, position: i }));
      await sb.from("property_images").insert(rows);
    }

    // AI tag (limit to first 24 to control cost/time, in parallel batches)
    const toTag = images.slice(0, 24);
    const concurrency = 4;
    for (let i = 0; i < toTag.length; i += concurrency) {
      const batch = toTag.slice(i, i + concurrency);
      const results = await Promise.all(batch.map((u) => classifyImage(u, aiKey)));
      await Promise.all(
        results.map((r, idx) =>
          sb
            .from("property_images")
            .update({ room_type: r.room_type, ai_tag: r.ai_tag })
            .eq("property_id", propertyId)
            .eq("image_url", batch[idx])
        )
      );
    }

    await sb.from("properties").update({ status: "ready" }).eq("id", propertyId);

    return new Response(
      JSON.stringify({ success: true, property_id: propertyId, image_count: images.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("fetch_zillow_images error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
