import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret',
}

const HIGGSFIELD_BASE = 'https://platform.higgsfield.ai'

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

  const HIGGSFIELD_API_KEY = Deno.env.get('HIGGSFIELD_API_KEY')
  const HIGGSFIELD_API_SECRET = Deno.env.get('HIGGSFIELD_CLIENT_SECRET')
  if (!HIGGSFIELD_API_KEY || !HIGGSFIELD_API_SECRET) return fail('HIGGSFIELD_API_KEY and HIGGSFIELD_CLIENT_SECRET must be configured', 500)
  const authValue = `Key ${HIGGSFIELD_API_KEY}:${HIGGSFIELD_API_SECRET}`

  // Auth check: bot secret or staff JWT
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

    // ─── GENERATE: Submit image or video generation ──────────
    if (path === 'generate' && req.method === 'POST') {
      const { prompt, model, type, customer_id, customer_name, aspect_ratio, resolution, image_url, duration } = body as any

      if (!prompt) return fail('prompt is required')

      const genType = type || (image_url ? 'video' : 'image')
      const modelId = model || (genType === 'video' ? 'higgsfield-ai/dop/standard' : 'higgsfield-ai/soul/standard')

      // Build Higgsfield request payload
      const hfPayload: Record<string, unknown> = { prompt }
      if (genType === 'image') {
        hfPayload.aspect_ratio = aspect_ratio || '16:9'
        hfPayload.resolution = resolution || '720p'
      }
      if (genType === 'video' && image_url) {
        hfPayload.image_url = image_url
        hfPayload.duration = duration || 5
      }

      // Create bot_task for content-manager
      const taskTitle = `${genType === 'video' ? '🎬' : '🎨'} ${prompt.substring(0, 60)}${prompt.length > 60 ? '...' : ''}`
      const { data: botTask } = await supabase.from('bot_tasks').insert({
        title: taskTitle,
        description: prompt,
        bot_agent: 'content-manager',
        priority: 'medium',
        status: 'queued',
        customer_id: customer_id || null,
        meta: { type: genType, model: modelId, customer_name: customer_name || null },
      }).select('id').single()

      // Submit to Higgsfield API
      const hfRes = await fetch(`${HIGGSFIELD_BASE}/${modelId}`, {
        method: 'POST',
        headers: {
          'Authorization': authValue,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(hfPayload),
      })

      const hfData = await hfRes.json()
      console.log('[higgsfield] submit response:', JSON.stringify(hfData))

      if (!hfRes.ok) {
        // Mark task as failed
        if (botTask?.id) {
          await supabase.from('bot_tasks').update({ status: 'failed', meta: { error: hfData } }).eq('id', botTask.id)
        }
        return fail(`Higgsfield API error [${hfRes.status}]: ${JSON.stringify(hfData)}`, 502)
      }

      // Update bot_task with request_id
      const requestId = hfData.request_id
      if (botTask?.id) {
        await supabase.from('bot_tasks').update({
          status: 'in_progress',
          meta: { type: genType, model: modelId, request_id: requestId, customer_name: customer_name || null, status_url: hfData.status_url },
        }).eq('id', botTask.id)
      }

      // Log activity
      await supabase.from('activity_log').insert({
        entity_type: 'content_asset',
        entity_id: botTask?.id || null,
        action: `higgsfield_${genType}_queued`,
        meta: { name: taskTitle, model: modelId, request_id: requestId },
      })

      return ok({
        request_id: requestId,
        bot_task_id: botTask?.id,
        status: hfData.status,
        status_url: hfData.status_url,
        type: genType,
      })
    }

    // ─── POLL: Check status of a generation request ─────────
    if (path === 'poll' && req.method === 'POST') {
      const { request_id, bot_task_id } = body as any

      if (!request_id) return fail('request_id is required')

      const statusRes = await fetch(`${HIGGSFIELD_BASE}/requests/${request_id}/status`, {
        headers: { 'Authorization': authValue },
      })
      const statusData = await statusRes.json()
      console.log('[higgsfield] poll response:', JSON.stringify(statusData))

      if (statusData.status === 'completed') {
        // Get the output URL
        const outputUrl = statusData.video?.url || statusData.images?.[0]?.url || null
        const outputType = statusData.video?.url ? 'video' : 'image'

        // Get bot_task info for customer context
        let customerInfo: any = null
        if (bot_task_id) {
          const { data: task } = await supabase.from('bot_tasks').select('customer_id, meta, description').eq('id', bot_task_id).single()
          customerInfo = task
        }

        const customerId = customerInfo?.customer_id || null
        const customerName = (customerInfo?.meta as any)?.customer_name || null
        const promptText = customerInfo?.description || ''

        // Store in content_assets
        const now = new Date()
        const dateLabel = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const timeLabel = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        const title = `${customerName || 'AI'} — ${outputType === 'video' ? 'Video' : 'Image'} — ${dateLabel} ${timeLabel}`

        const { data: contentAsset } = await supabase.from('content_assets').insert({
          title,
          type: outputType,
          status: 'published',
          url: outputUrl,
          source: 'higgsfield',
          customer_id: customerId,
          category: null, // will inherit from customer if needed
          folder: customerName ? `AI Generated/${customerName}` : 'AI Generated',
          body: promptText,
        }).select('id').single()

        // Update bot_task to completed
        if (bot_task_id) {
          await supabase.from('bot_tasks').update({
            status: 'done',
            meta: {
              ...(customerInfo?.meta as object || {}),
              request_id,
              output_url: outputUrl,
              output_type: outputType,
              content_asset_id: contentAsset?.id,
            },
          }).eq('id', bot_task_id)
        }

        // Log activity with rich Telegram notification
        const dashboardUrl = 'https://stu25.com/content'
        const customMessage = outputType === 'video'
          ? `🎬 *AI Video Ready!*\n🔗 [View Video](${outputUrl})\n📂 Check it out in your [Content AI Generated](${dashboardUrl}) dashboard.`
          : `🎨 *AI Image Ready!*\n🔗 [View Image](${outputUrl})\n📂 Check it out in your [Content AI Generated](${dashboardUrl}) dashboard.`
        await supabase.from('activity_log').insert({
          entity_type: 'content_asset',
          entity_id: contentAsset?.id || null,
          action: `higgsfield_${outputType}_completed`,
          meta: { name: title, output_url: outputUrl, message: customMessage, preview_url: outputUrl },
        })

        return ok({ status: 'completed', output_url: outputUrl, output_type: outputType, content_asset_id: contentAsset?.id, title })
      }

      if (statusData.status === 'failed' || statusData.status === 'nsfw') {
        // Mark task failed
        if (bot_task_id) {
          await supabase.from('bot_tasks').update({
            status: 'failed',
            meta: { request_id, error: statusData.status },
          }).eq('id', bot_task_id)
        }
        return ok({ status: statusData.status, request_id })
      }

      // Still in progress
      return ok({ status: statusData.status, request_id })
    }

    // ─── CANCEL: Cancel a queued request ────────────────────
    if (path === 'cancel' && req.method === 'POST') {
      const { request_id, bot_task_id } = body as any
      if (!request_id) return fail('request_id is required')

      const cancelRes = await fetch(`${HIGGSFIELD_BASE}/requests/${request_id}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': authValue },
      })

      if (bot_task_id) {
        await supabase.from('bot_tasks').update({ status: 'failed', meta: { request_id, cancelled: true } }).eq('id', bot_task_id)
      }

      return ok({ cancelled: cancelRes.status === 202, request_id })
    }

    return fail('Unknown endpoint. Use /generate, /poll, or /cancel', 404)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[higgsfield-api] error:', msg)
    return fail(msg, 500)
  }
})
