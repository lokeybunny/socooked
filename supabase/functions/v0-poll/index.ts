import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret, x-internal',
}

const V0_API_URL = 'https://api.v0.dev'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Auth — bot, internal, or bearer
  const botSecret = req.headers.get('x-bot-secret')
  const expectedSecret = Deno.env.get('BOT_SECRET')
  const internalCall = req.headers.get('x-internal') === 'true'
  const authHeader = req.headers.get('Authorization')

  const isBot = botSecret && expectedSecret && botSecret === expectedSecret
  const isBearer = authHeader?.startsWith('Bearer ')

  if (!internalCall && !isBot && !isBearer) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const v0Key = Deno.env.get('V0_API_KEY')
  if (!v0Key) {
    return new Response(JSON.stringify({ success: false, error: 'V0_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const url = new URL(req.url)
    const chatIdParam = url.searchParams.get('chat_id')

    // Mode 1: Poll a specific chat_id
    // Mode 2: Poll ALL pending/generating previews (batch check)
    let chatIds: string[] = []

    if (chatIdParam) {
      chatIds = [chatIdParam]
    } else {
      // Find all previews still generating
      const { data: pending } = await supabase
        .from('api_previews')
        .select('meta')
        .in('status', ['pending', 'generating'])
        .eq('source', 'v0-designer')

      if (pending && pending.length > 0) {
        chatIds = pending
          .map((p: any) => p.meta?.chat_id)
          .filter((id: string | undefined) => !!id)
      }
    }

    if (chatIds.length === 0) {
      return new Response(JSON.stringify({ success: true, data: { checked: 0, updated: 0, message: 'No pending previews' } }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[v0-poll] Checking ${chatIds.length} chat(s): ${chatIds.join(', ')}`)

    let updated = 0
    const results: any[] = []

    for (const chatId of chatIds) {
      try {
        const pollRes = await fetch(`${V0_API_URL}/v1/chats/${chatId}`, {
          headers: { 'Authorization': `Bearer ${v0Key}` },
        })

        if (!pollRes.ok) {
          const errText = await pollRes.text()
          console.warn(`[v0-poll] Error polling ${chatId}: ${pollRes.status} ${errText}`)
          results.push({ chat_id: chatId, status: 'error', error: `${pollRes.status}` })
          continue
        }

        const pollData = await pollRes.json()
        const status = pollData.latestVersion?.status
        const demoUrl = pollData.latestVersion?.demoUrl || null

        console.log(`[v0-poll] ${chatId}: status=${status}, demoUrl=${demoUrl ? 'yes' : 'no'}`)

        if (status === 'completed' && demoUrl) {
          // Update api_previews
          const { error: updateErr } = await supabase.from('api_previews')
            .update({
              preview_url: demoUrl,
              status: 'completed',
              meta: { chat_id: chatId, version_status: 'completed' },
              updated_at: new Date().toISOString(),
            })
            .eq('source', 'v0-designer')
            .filter('meta->>chat_id', 'eq', chatId)

          if (updateErr) {
            console.error(`[v0-poll] DB update error for ${chatId}:`, updateErr)
          }

          // Update bot_tasks if linked
          await supabase.from('bot_tasks')
            .update({
              status: 'completed',
              meta: { chat_id: chatId, preview_url: demoUrl, version_status: 'completed' },
            })
            .filter('meta->>chat_id', 'eq', chatId)
            .eq('status', 'in_progress')

          // Update conversation_thread
          const { data: preview } = await supabase.from('api_previews')
            .select('thread_id')
            .eq('source', 'v0-designer')
            .filter('meta->>chat_id', 'eq', chatId)
            .limit(1)
            .single()

          if (preview?.thread_id) {
            await supabase.from('conversation_threads')
              .update({ status: 'resolved' })
              .eq('id', preview.thread_id)
          }

          // Log completion activity
          await supabase.from('activity_log').insert({
            entity_type: 'api_preview',
            entity_id: null,
            action: 'v0_design_completed',
            meta: { chat_id: chatId, preview_url: demoUrl },
          })

          updated++
          results.push({ chat_id: chatId, status: 'completed', preview_url: demoUrl })
        } else if (status === 'failed') {
          await supabase.from('api_previews')
            .update({
              status: 'failed',
              meta: { chat_id: chatId, version_status: 'failed' },
              updated_at: new Date().toISOString(),
            })
            .eq('source', 'v0-designer')
            .filter('meta->>chat_id', 'eq', chatId)

          await supabase.from('bot_tasks')
            .update({ status: 'failed', meta: { chat_id: chatId, version_status: 'failed' } })
            .filter('meta->>chat_id', 'eq', chatId)
            .eq('status', 'in_progress')

          results.push({ chat_id: chatId, status: 'failed' })
        } else {
          results.push({ chat_id: chatId, status: status || 'still_generating' })
        }
      } catch (chatErr) {
        console.error(`[v0-poll] Error processing ${chatId}:`, chatErr)
        results.push({ chat_id: chatId, status: 'error', error: String(chatErr) })
      }
    }

    console.log(`[v0-poll] Done: checked=${chatIds.length}, updated=${updated}`)

    return new Response(JSON.stringify({
      success: true,
      data: { checked: chatIds.length, updated, results },
      api_version: 'v1',
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[v0-poll] Error:`, msg)
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
