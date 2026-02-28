import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret',
}

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions'
const DEFAULT_MODEL = 'google/gemini-2.5-flash-image'
const BANANA2_MODEL = 'google/gemini-3-pro-image-preview'

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fail(error: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  if (!LOVABLE_API_KEY) return fail('LOVABLE_API_KEY not configured', 500)

  // Auth check
  const botSecret = req.headers.get('x-bot-secret')
  const authHeader = req.headers.get('Authorization')
  const expectedSecret = Deno.env.get('BOT_SECRET')
  const isBot = !!(botSecret && expectedSecret && botSecret === expectedSecret)
  const isStaff = !!authHeader?.startsWith('Bearer ')

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  if (!isBot && isStaff) {
    const token = authHeader!.replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return fail('Unauthorized', 401)
  } else if (!isBot) {
    return fail('Unauthorized', 401)
  }

  const url = new URL(req.url)
  const path = url.pathname.split('/').pop()

  try {
    let body: Record<string, unknown> = {}
    if (req.method === 'POST') {
      try { body = JSON.parse(await req.text()) } catch (_) {}
    }

    // ─── GENERATE: Submit image generation via Gemini nano banana ──────
    if (path === 'generate' && req.method === 'POST') {
      const { prompt, customer_id, customer_name, image_url, model: requestedModel } = body as any
      const MODEL = requestedModel || DEFAULT_MODEL

      if (!prompt) return fail('prompt is required')

      // Build messages for Gemini image generation
      const messages: any[] = []

      if (image_url) {
        // Image editing: send the source image + edit instruction
        messages.push({
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: image_url } },
            { type: 'text', text: prompt },
          ],
        })
      } else {
        // Text-to-image generation
        messages.push({
          role: 'user',
          content: prompt,
        })
      }

      // Create bot_task
      const taskTitle = `🍌 ${prompt.substring(0, 60)}${prompt.length > 60 ? '...' : ''}`
      const { data: botTask } = await supabase.from('bot_tasks').insert({
        title: taskTitle,
        description: prompt,
        bot_agent: 'content-manager',
        priority: 'medium',
        status: 'in_progress',
        customer_id: customer_id || null,
        meta: { type: 'image', model: MODEL, provider: 'nano-banana', customer_name: customer_name || null },
      }).select('id').single()

      const isBanana2 = MODEL.includes('gemini-3')

      // Call Lovable AI Gateway (works for both Banana1 and Banana2)
      const aiRes = await fetch(LOVABLE_AI_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          modalities: ['image', 'text'],
        }),
      })

      if (!aiRes.ok) {
        const errText = await aiRes.text()
        console.error('[nano-banana] AI gateway error:', aiRes.status, errText)
        if (botTask?.id) {
          await supabase.from('bot_tasks').update({ status: 'failed', meta: { error: errText } }).eq('id', botTask.id)
        }
        return fail(`Nano Banana API error [${aiRes.status}]: ${errText}`, aiRes.status === 429 ? 429 : aiRes.status === 402 ? 402 : 502)
      }

      const aiData = await aiRes.json()
      console.log('[nano-banana] response received')

      let outputUrl: string | null = null
      let base64Data: string | null = null

      // Parse Lovable AI Gateway (OpenAI-compatible) response
      const choice = aiData.choices?.[0]
      const messageContent = choice?.message

      // Check the images array
      if (messageContent?.images && Array.isArray(messageContent.images)) {
        for (const img of messageContent.images) {
          if (img.type === 'image_url' && img.image_url?.url) {
            if (img.image_url.url.startsWith('data:')) {
              base64Data = img.image_url.url
            } else {
              outputUrl = img.image_url.url
            }
            break
          }
        }
      }

      // Fallback: check content field
      const content = messageContent?.content
      if (!outputUrl && !base64Data) {
        if (typeof content === 'string' && content.startsWith('http')) {
          outputUrl = content.trim()
        } else if (Array.isArray(content)) {
          for (const part of content) {
            if (part.type === 'image_url' && part.image_url?.url) {
              if (part.image_url.url.startsWith('data:')) {
                base64Data = part.image_url.url
              } else {
                outputUrl = part.image_url.url
              }
              break
            }
          }
        }
      }

      // If we got base64, upload to Supabase storage
      if (base64Data && !outputUrl) {
        const match = base64Data.match(/^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/)
        if (match) {
          const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
          const raw = match[2]
          const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0))
          const fileName = `nano-banana/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`

          const { data: upload, error: uploadErr } = await supabase.storage
            .from('content-uploads')
            .upload(fileName, bytes, { contentType: `image/${match[1]}`, upsert: true })

          if (!uploadErr && upload) {
            const { data: publicUrl } = supabase.storage.from('content-uploads').getPublicUrl(fileName)
            outputUrl = publicUrl.publicUrl
          } else {
            console.error('[nano-banana] storage upload error:', uploadErr)
          }
        }
      }

      if (!outputUrl) {
        if (botTask?.id) {
          await supabase.from('bot_tasks').update({ status: 'failed', meta: { error: 'No image in response' } }).eq('id', botTask.id)
        }
        return fail('Nano Banana did not return an image. Response: ' + JSON.stringify(aiData).substring(0, 200), 502)
      }

      // Store in content_assets
      const now = new Date()
      const dateLabel = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      const timeLabel = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      const providerLabel = isBanana2 ? 'Banana2' : 'Nano Banana'
      const assetTitle = `${customer_name || 'AI'} — ${providerLabel} — ${dateLabel} ${timeLabel}`

      const { data: contentAsset } = await supabase.from('content_assets').insert({
        title: assetTitle,
        type: 'image',
        status: 'published',
        url: outputUrl,
        source: 'nano-banana',
        customer_id: customer_id || null,
        folder: customer_name ? `AI Generated/${customer_name}` : 'AI Generated',
        body: prompt,
      }).select('id').single()

      // Update bot_task to done
      if (botTask?.id) {
        await supabase.from('bot_tasks').update({
          status: 'done',
          meta: {
            type: 'image',
            model: MODEL,
            provider: 'nano-banana',
            output_url: outputUrl,
            content_asset_id: contentAsset?.id,
            customer_name: customer_name || null,
          },
        }).eq('id', botTask.id)
      }

      // Log activity with Telegram notification
      const dashboardUrl = 'https://stu25.com/content'
      const customMessage = `🍌 *Nano Banana Image Ready!*\n🔗 [View Image](${outputUrl})\n📂 Check it out in your [Content AI Generated](${dashboardUrl}) dashboard.`
      await supabase.from('activity_log').insert({
        entity_type: 'content_asset',
        entity_id: contentAsset?.id || null,
        action: 'nano_banana_image_completed',
        meta: { name: assetTitle, output_url: outputUrl, message: customMessage, preview_url: outputUrl },
      })

      return ok({
        output_url: outputUrl,
        content_asset_id: contentAsset?.id,
        bot_task_id: botTask?.id,
        title: assetTitle,
        type: 'image',
        provider: 'nano-banana',
      })
    }

    return fail('Unknown endpoint. Use /generate', 404)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[nano-banana] error:', msg)
    return fail(msg, 500)
  }
})
