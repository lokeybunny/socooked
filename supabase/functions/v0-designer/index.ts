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
    const { prompt, customer_id, category, bot_task_id, chat_id: existingChatId } = await req.json()

    if (!prompt) {
      return new Response(JSON.stringify({ success: false, error: 'prompt is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const isEdit = !!existingChatId

    // Auto-enrich: use design-intent language so v0 uses its internal AI image generator
    let enrichedPrompt = prompt
    if (!isEdit) {
      const sectionKeywords = ['hero', 'features', 'about', 'gallery', 'services', 'contact', 'footer']
      const describedSections = sectionKeywords.filter(s => prompt.toLowerCase().includes(s))
      const hasVisualDescriptions = (prompt.match(/(image|photo|picture|visual|banner|background|portrait|shot|scene)/gi) || []).length >= 3

      if (describedSections.length < 4 || !hasVisualDescriptions) {
        const enrichmentBlock = `

VISUAL DESIGN DIRECTION (auto-appended):
For every visual section of this website, you MUST create unique, original imagery using your built-in AI image generation capabilities. Do not use placeholder images, stock photo URLs, unsplash, pexels, or empty src attributes.

- Hero: Design a full-width hero with an AI-generated background that captures the brand's industry, mood, and energy. Cinematic composition, dramatic lighting.
- Features/Services: Each card or section needs its own distinct AI-generated visual that represents the specific service or feature being described.
- About: Include an AI-generated professional scene — a workspace, team environment, or brand-relevant interior that builds trust.
- Gallery/Portfolio: Create 4-6 unique AI-generated showcase images with varied compositions, angles, and subjects relevant to the business.
- All visuals must be original AI-generated content with professional quality. Never reference external image URLs or placeholder files.`
        enrichedPrompt = prompt + enrichmentBlock
        console.log(`[v0-designer] Auto-enriched with design-intent language (${describedSections.length} sections, ${(prompt.match(/(image|photo|picture|visual|banner|background|portrait|shot|scene)/gi) || []).length} visual refs)`)
      }
    }

    // Tailwind CDN constraint — always appended
    const tailwindCdnBlock = `

TAILWIND CSS RULE (mandatory):
- Use Tailwind CSS via CDN only: <script src="https://cdn.tailwindcss.com"></script>
- Do NOT use "import 'tailwindcss'" or any npm/module import of tailwindcss.
- Do NOT use PostCSS or build-step Tailwind. CDN only.`
    enrichedPrompt = enrichedPrompt + tailwindCdnBlock

    // Update bot_task to in_progress if provided
    if (bot_task_id) {
      await supabase.from('bot_tasks').update({ status: 'in_progress' }).eq('id', bot_task_id)
    }

    // isEdit already declared above
    console.log(`[v0-designer] ${isEdit ? `Editing chat ${existingChatId}` : 'Creating new chat'} with prompt: ${prompt.substring(0, 100)}...`)

    // Step 1: Create new chat OR send follow-up message to existing chat
    let chatRes: Response
    if (isEdit) {
      // Send follow-up message to existing v0 chat
      chatRes = await fetch(`${V0_API_URL}/v1/chats/${existingChatId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${v0Key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: enrichedPrompt,
          responseMode: 'async',
        }),
      })
    } else {
      // Create a brand new v0 chat
      chatRes = await fetch(`${V0_API_URL}/v1/chats`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${v0Key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: enrichedPrompt,
          system: 'You are an expert web designer. Build clean, modern, responsive websites using React and Tailwind CSS.',
          responseMode: 'async',
        }),
      })
    }

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
    console.log(`[v0-designer] ${isEdit ? 'Edit response' : 'Chat created'} (async):`, JSON.stringify(chatData).substring(0, 500))

    // For edits, chatData is a message object; for new chats, it's the chat object
    const chatId = isEdit ? existingChatId : chatData.id
    const webUrl = isEdit ? `https://v0.dev/chat/${existingChatId}` : (chatData.webUrl || `https://v0.dev/chat/${chatData.id}`)
    const latestVersion = isEdit ? chatData.version : chatData.latestVersion
    const versionStatus = latestVersion?.status || 'pending'
    const demoUrl = latestVersion?.demoUrl || null

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
        status: 'open',
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

    // Step 6: Store/update in api_previews for the Previews page
    if (isEdit) {
      // Update existing preview record for this chat
      await supabase.from('api_previews')
        .update({
          preview_url: finalDemoUrl,
          edit_url: editUrl,
          status: finalDemoUrl ? 'completed' : 'pending',
          meta: { chat_id: chatId, version_status: finalVersion?.status || 'unknown', last_edit_prompt: prompt },
          updated_at: new Date().toISOString(),
        })
        .eq('source', 'v0-designer')
        .filter('meta->>chat_id', 'eq', chatId)
    } else {
      await supabase.from('api_previews').insert({
        customer_id: resolvedCustomerId,
        source: 'v0-designer',
        title: `V0 Design: ${prompt.substring(0, 120)}`,
        prompt,
        preview_url: finalDemoUrl,
        edit_url: editUrl,
        status: finalDemoUrl ? 'completed' : 'pending',
        meta: { chat_id: chatId, version_status: finalVersion?.status || 'unknown' },
        bot_task_id: bot_task_id || null,
        thread_id: thread?.id || null,
      })
    }

    // Step 7: Log activity
    await supabase.from('activity_log').insert({
      entity_type: 'conversation_thread',
      entity_id: thread?.id || null,
      action: isEdit ? 'v0_design_edited' : 'v0_design_generated',
      meta: { name: `V0 ${isEdit ? 'Edit' : 'Design'}: ${prompt.substring(0, 80)}`, preview_url: finalDemoUrl, chat_id: chatId },
    })

    const result = {
      chat_id: chatId,
      preview_url: finalDemoUrl,
      edit_url: editUrl,
      thread_id: thread?.id,
      status: finalVersion?.status || 'pending',
      is_edit: isEdit,
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
