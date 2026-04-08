import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const itemId = url.searchParams.get("id");

    let data: unknown;
    let error: unknown;

    if (itemId) {
      const res = await supabase
        .from("arbitrage_items")
        .select("id, item_name, sku, asking_price, wiggle_room_price, nobg_image_url, original_image_url, extra_images, condition_notes, pawn_shop_address, meta")
        .eq("status", "listed")
        .eq("id", itemId)
        .maybeSingle();
      data = res.data;
      error = res.error;
    } else {
      const res = await supabase
        .from("arbitrage_items")
        .select("id, item_name, sku, asking_price, wiggle_room_price, nobg_image_url, original_image_url, extra_images, condition_notes, pawn_shop_address, meta")
        .eq("status", "listed")
        .order("created_at", { ascending: false });
      data = res.data;
      error = res.error;
    }

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify(data ?? []), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
