import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret',
}

const V0_API_URL = 'https://api.v0.dev'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Auth — only bot or internal calls
  const botSecret = req.headers.get('x-bot-secret')
  const expectedSecret = Deno.env.get('BOT_SECRET')
  const internalCall = req.headers.get('x-internal') === 'true'

  if (!internalCall && !(botSecret && expectedSecret && botSecret === expectedSecret)) {
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
    const { prompt, customer_id, category, bot_task_id } = await req.json()

    if (!prompt) {
      return new Response(JSON.stringify({ success: false, error: 'prompt is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update bot_task to in_progress if provided
    if (bot_task_id) {
      await supabase.from('bot_tasks').update({ status: 'in_progress' }).eq('id', bot_task_id)
    }

    console.log(`[v0-designer] Creating async chat with prompt: ${prompt.substring(0, 100)}...`)

    // Step 1: Create a v0 chat in ASYNC mode (returns immediately)
    const chatRes = await fetch(`${V0_API_URL}/v1/chats`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${v0Key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: prompt,
        system: 'You are an expert web designer. Build clean, modern, responsive websites using React and Tailwind CSS.',
        responseMode: 'async',
      }),
    })

    if (!chatRes.ok) {
      const errText = await chatRes.text()
      console.error(`[v0-designer] V0 API error: ${chatRes.status} ${errText}`)

      if (bot_task_id) {
        await supabase.from('bot_tasks').update({
          status: 'failed',
          meta: { error: `V0 API error: ${chatRes.status}`, details: errText, prompt },
        }).eq('id', bot_task_id)
      }

      return new Response(JSON.stringify({ success: false, error: `V0 API error: ${chatRes.status}`, details: errText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const chatData = await chatRes.json()
    console.log(`[v0-designer] Chat created (async):`, JSON.stringify(chatData).substring(0, 500))

    const chatId = chatData.id
    const webUrl = chatData.webUrl || `https://v0.dev/chat/${chatId}`
    const versionStatus = chatData.latestVersion?.status || 'pending'
    const demoUrl = chatData.latestVersion?.demoUrl || null

    // Step 2: If async and still pending, poll for completion (up to 90s)
    let finalDemoUrl = demoUrl
    let finalVersion = chatData.latestVersion

    if (versionStatus === 'pending' && chatId) {
      console.log(`[v0-designer] Polling for completion...`)
      for (let i = 0; i < 18; i++) {
        await new Promise(r => setTimeout(r, 5000)) // wait 5s

        const pollRes = await fetch(`${V0_API_URL}/v1/chats/${chatId}`, {
          headers: { 'Authorization': `Bearer ${v0Key}` },
        })

        if (pollRes.ok) {
          const pollData = await pollRes.json()
          const status = pollData.latestVersion?.status
          console.log(`[v0-designer] Poll ${i + 1}: status=${status}`)

          if (status === 'completed') {
            finalDemoUrl = pollData.latestVersion?.demoUrl || null
            finalVersion = pollData.latestVersion
            break
          } else if (status === 'failed') {
            console.error(`[v0-designer] Generation failed`)
            if (bot_task_id) {
              await supabase.from('bot_tasks').update({
                status: 'failed',
                meta: { error: 'V0 generation failed', prompt, chat_id: chatId },
              }).eq('id', bot_task_id)
            }
            return new Response(JSON.stringify({ success: false, error: 'V0 generation failed', chat_url: webUrl }), {
              status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
        } else {
          const errBody = await pollRes.text()
          console.warn(`[v0-designer] Poll error: ${pollRes.status} ${errBody}`)
        }
      }
    }

    const editUrl = webUrl

    // Step 3: Resolve customer_id
    let resolvedCustomerId = customer_id
    if (!resolvedCustomerId) {
      const { data: existing } = await supabase.from('customers')
        .select('id')
        .eq('full_name', 'V0 Designer Bot')
        .limit(1)
        .single()

      if (existing) {
        resolvedCustomerId = existing.id
      } else {
        const { data: newCustomer } = await supabase.from('customers').insert({
          full_name: 'V0 Designer Bot',
          status: 'active',
          source: 'system',
          notes: 'System customer for V0 web design outputs',
          category: 'digital-services',
        }).select('id').single()
        resolvedCustomerId = newCustomer?.id
      }
    }

    // Step 4: Store result in conversation_threads
    const { data: thread, error: threadError } = await supabase
      .from('conversation_threads')
      .insert({
        channel: 'v0-designer',
        status: finalDemoUrl ? 'resolved' : 'open',
        summary: `V0 Design: ${prompt.substring(0, 200)}`,
        raw_transcript: JSON.stringify({
          prompt,
          chat_id: chatId,
          preview_url: finalDemoUrl,
          edit_url: editUrl,
          version_status: finalVersion?.status || 'unknown',
          created_at: new Date().toISOString(),
        }, null, 2),
        category: category || 'digital-services',
        customer_id: resolvedCustomerId,
      })
      .select('id')
      .single()

    if (threadError) {
      console.error(`[v0-designer] Thread insert error:`, threadError)
    }

    // Step 5: Update bot_task to completed
    if (bot_task_id) {
      await supabase.from('bot_tasks').update({
        status: finalDemoUrl ? 'completed' : 'in_progress',
        meta: {
          prompt,
          chat_id: chatId,
          preview_url: finalDemoUrl,
          edit_url: editUrl,
          thread_id: thread?.id,
          version_status: finalVersion?.status || 'unknown',
        },
      }).eq('id', bot_task_id)
    }

    // Step 6: Log activity
    await supabase.from('activity_log').insert({
      entity_type: 'conversation_thread',
      entity_id: thread?.id || null,
      action: 'v0_design_generated',
      meta: { name: `V0 Design: ${prompt.substring(0, 80)}`, preview_url: finalDemoUrl },
    })

    const result = {
      chat_id: chatId,
      preview_url: finalDemoUrl,
      edit_url: editUrl,
      thread_id: thread?.id,
      status: finalVersion?.status || 'pending',
    }

    console.log(`[v0-designer] Success:`, JSON.stringify(result))

    return new Response(JSON.stringify({ success: true, data: result, api_version: 'v1' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[v0-designer] Error:`, msg)
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
