import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildAssetPath, buildPublicUrl } from '../_shared/asset-path.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret',
}

const BUCKET = 'site-assets'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Auth — bot secret or internal
  const botSecret = req.headers.get('x-bot-secret')
  const expectedSecret = Deno.env.get('BOT_SECRET')
  const internalCall = req.headers.get('x-internal') === 'true'

  if (!internalCall && !(botSecret && expectedSecret && botSecret === expectedSecret)) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const lovableKey = Deno.env.get('LOVABLE_API_KEY')
  if (!lovableKey) {
    return new Response(JSON.stringify({ success: false, error: 'LOVABLE_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { customer_id, images, transparent } = await req.json()

    if (!customer_id) {
      return new Response(JSON.stringify({ success: false, error: 'customer_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'images array is required: [{key, prompt}]' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (images.length > 10) {
      return new Response(JSON.stringify({ success: false, error: 'Maximum 10 images per request' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const timestamp = Date.now()
    const assetMap: Record<string, string> = {}
    const errors: Array<{ key: string; error: string }> = []
    const raw: Array<{ key: string; status: string }> = []

    for (const img of images) {
      const { key, prompt } = img
      if (!key || !prompt) {
        errors.push({ key: key || 'unknown', error: 'key and prompt are required' })
        continue
      }

      try {
        console.log(`[image-generator] Generating: ${key} — "${prompt.substring(0, 80)}"`)

        // Use Lovable AI Gateway with Gemini image generation
        const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-image',
            messages: [
              {
                role: 'user',
                content: `Generate a high-quality, professional ${transparent ? 'PNG with transparent background' : 'photograph-style image'} for a website. ${prompt}. Ultra high resolution, cinematic lighting, professional quality.`,
              },
            ],
            modalities: ['image', 'text'],
          }),
        })

        if (!aiRes.ok) {
          const errText = await aiRes.text()
          console.error(`[image-generator] AI error for ${key}: ${aiRes.status} ${errText}`)
          errors.push({ key, error: `AI generation failed: ${aiRes.status}` })
          raw.push({ key, status: 'failed' })
          continue
        }

        const aiData = await aiRes.json()
        const imageDataUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url

        if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
          console.error(`[image-generator] No image data returned for ${key}`)
          errors.push({ key, error: 'No image data in AI response' })
          raw.push({ key, status: 'no_image' })
          continue
        }

        // Extract base64 data and determine format
        const match = imageDataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/)
        if (!match) {
          errors.push({ key, error: 'Invalid image data format' })
          raw.push({ key, status: 'invalid_format' })
          continue
        }

        const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
        const base64Data = match[2]
        const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))

        // Upload to Supabase Storage
        const storagePath = buildAssetPath(customer_id, key, ext, timestamp)
        const contentType = `image/${match[1]}`

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, binaryData, {
            contentType,
            upsert: true,
          })

        if (uploadError) {
          console.error(`[image-generator] Upload error for ${key}:`, uploadError)
          errors.push({ key, error: `Upload failed: ${uploadError.message}` })
          raw.push({ key, status: 'upload_failed' })
          continue
        }

        const publicUrl = buildPublicUrl(supabaseUrl, BUCKET, storagePath)
        assetMap[key] = publicUrl
        raw.push({ key, status: 'success' })
        console.log(`[image-generator] ✅ ${key} → ${publicUrl}`)

      } catch (imgErr) {
        const msg = imgErr instanceof Error ? imgErr.message : 'Unknown error'
        console.error(`[image-generator] Error processing ${key}:`, msg)
        errors.push({ key, error: msg })
        raw.push({ key, status: 'error' })
      }
    }

    const allFailed = Object.keys(assetMap).length === 0 && errors.length > 0
    const result = {
      success: !allFailed,
      asset_map: assetMap,
      errors: errors.length > 0 ? errors : undefined,
      raw,
      images_generated: Object.keys(assetMap).length,
      images_failed: errors.length,
    }

    console.log(`[image-generator] Done: ${result.images_generated} generated, ${result.images_failed} failed`)

    return new Response(JSON.stringify(result), {
      status: allFailed ? 502 : 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[image-generator] Error:`, msg)
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
