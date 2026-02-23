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

    let chatIds: string[] = []

    if (chatIdParam) {
      chatIds = [chatIdParam]
    } else {
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
        // Fetch the full chat to get latest version info
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

        // v0 API: demo URL is at chat.demo or in experimental_content tuples
        let resolvedDemoUrl: string | null = null

        // Path 1: top-level "demo" field (v0 SDK uses chat.demo)
        if (pollData.demo) resolvedDemoUrl = pollData.demo
        // Path 2: latestVersion.demoUrl (legacy)
        if (!resolvedDemoUrl && pollData.latestVersion?.demoUrl) resolvedDemoUrl = pollData.latestVersion.demoUrl
        // Path 3: scan messages for experimental_content tuples ["code", {demoUrl}]
        if (!resolvedDemoUrl && pollData.messages) {
          for (const msg of pollData.messages) {
            if (msg.role !== 'assistant') continue
            const ec = msg.experimental_content
            if (ec && Array.isArray(ec)) {
              for (const item of ec) {
                // Tuples: [type, data] or objects {type, data}
                const type = Array.isArray(item) ? item[0] : item?.type
                const data = Array.isArray(item) ? item[1] : item?.data
                if (type === 'code' && data?.demoUrl) { resolvedDemoUrl = data.demoUrl; break }
                if (type === 'code' && data?.previewUrl) { resolvedDemoUrl = data.previewUrl; break }
              }
            }
            if (resolvedDemoUrl) break
          }
        }
        // Path 4: construct from chat URL pattern
        if (!resolvedDemoUrl && pollData.messages?.some((m: any) => m.role === 'assistant' && m.finishReason === 'stop')) {
          // Chat finished but no demo URL found — may be a text-only response (junk status check chat)
          // Mark as failed to stop polling
          console.log(`[v0-poll] ${chatId}: finished (stop) but no demoUrl — marking failed`)
        }

        console.log(`[v0-poll] ${chatId}: demoUrl=${resolvedDemoUrl ? resolvedDemoUrl.substring(0, 60) : 'no'}`)

        // FIXED: Accept demoUrl with ANY status (pending, completed, etc.)
        // v0 API often returns demoUrl before status flips to "completed"
        if (resolvedDemoUrl) {
          // Update api_previews
          await supabase.from('api_previews')
            .update({
              preview_url: resolvedDemoUrl,
              status: 'completed',
              meta: { chat_id: chatId, version_status: 'completed' },
              updated_at: new Date().toISOString(),
            })
            .eq('source', 'v0-designer')
            .filter('meta->>chat_id', 'eq', chatId)

          // Update bot_tasks if linked
          await supabase.from('bot_tasks')
            .update({
              status: 'completed',
              meta: { chat_id: chatId, preview_url: resolvedDemoUrl, version_status: 'completed' },
            })
            .filter('meta->>chat_id', 'eq', chatId)
            .eq('status', 'in_progress')

          // Resolve conversation_thread
          const { data: preview } = await supabase.from('api_previews')
            .select('thread_id')
            .eq('source', 'v0-designer')
            .filter('meta->>chat_id', 'eq', chatId)
            .limit(1).single()

          if (preview?.thread_id) {
            await supabase.from('conversation_threads')
              .update({ status: 'resolved' })
              .eq('id', preview.thread_id)
          }

          // Log completion
          await supabase.from('activity_log').insert({
            entity_type: 'api_preview', entity_id: null,
            action: 'v0_design_completed',
            meta: { chat_id: chatId, preview_url: resolvedDemoUrl },
          })

          updated++
          results.push({ chat_id: chatId, status: 'completed', preview_url: resolvedDemoUrl })

        } else {
          // Check if all assistant messages finished with 'stop' but no demo — junk chat
          const allStopped = pollData.messages?.every((m: any) => m.role !== 'assistant' || m.finishReason === 'stop')
          const hasAssistant = pollData.messages?.some((m: any) => m.role === 'assistant')
          if (allStopped && hasAssistant) {
            // Text-only response = junk status check chat, mark failed
            await supabase.from('api_previews')
              .update({ status: 'failed', meta: { chat_id: chatId, version_status: 'no_preview' }, updated_at: new Date().toISOString() })
              .eq('source', 'v0-designer').filter('meta->>chat_id', 'eq', chatId)
            results.push({ chat_id: chatId, status: 'failed' })
          } else {
            results.push({ chat_id: chatId, status: 'still_generating' })
          }
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
