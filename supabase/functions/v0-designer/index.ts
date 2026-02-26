import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret, x-internal',
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

  try {
    const { prompt, customer_id, category, bot_task_id, chat_id: existingChatId } = await req.json()

    if (!prompt) {
      return new Response(JSON.stringify({ success: false, error: 'prompt is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const isEdit = !!existingChatId

    // ═══════════════════════════════════════════════════════
    // PHASE 1: Call v0 API — get edit_url IMMEDIATELY
    // ═══════════════════════════════════════════════════════

    // Auto-enrich prompt with design-intent language
    let enrichedPrompt = prompt
    if (!isEdit) {
      const sectionKeywords = ['hero', 'features', 'about', 'gallery', 'services', 'contact', 'footer']
      const describedSections = sectionKeywords.filter(s => prompt.toLowerCase().includes(s))
      const hasVisualDescriptions = (prompt.match(/(image|photo|picture|visual|banner|background|portrait|shot|scene)/gi) || []).length >= 3

      if (describedSections.length < 4 || !hasVisualDescriptions) {
        enrichedPrompt = prompt + `

VISUAL DESIGN DIRECTION (auto-appended):
For every visual section of this website, you MUST create unique, original imagery using your built-in AI image generation capabilities. Do not use placeholder images, stock photo URLs, unsplash, pexels, or empty src attributes.

- Hero: Design a full-width hero with an AI-generated background that captures the brand's industry, mood, and energy. Cinematic composition, dramatic lighting.
- Features/Services: Each card or section needs its own distinct AI-generated visual that represents the specific service or feature being described.
- About: Include an AI-generated professional scene — a workspace, team environment, or brand-relevant interior that builds trust.
- Gallery/Portfolio: Create 4-6 unique AI-generated showcase images with varied compositions, angles, and subjects relevant to the business.
- All visuals must be original AI-generated content with professional quality. Never reference external image URLs or placeholder files.`
      }
    }

    // Tailwind CDN constraint — always appended
    enrichedPrompt += `

TAILWIND CSS RULE (mandatory):
- Use Tailwind CSS via CDN only: <script src="https://cdn.tailwindcss.com"></script>
- Do NOT use "import 'tailwindcss'" or any npm/module import of tailwindcss.
- Do NOT use PostCSS or build-step Tailwind. CDN only.`

    console.log(`[v0-designer] ${isEdit ? `Editing chat ${existingChatId}` : 'Creating new chat'} with prompt: ${prompt.substring(0, 100)}...`)

    // Call v0 API
    let chatRes: Response
    let fellBackToNew = false
    if (isEdit) {
      chatRes = await fetch(`${V0_API_URL}/v1/chats/${existingChatId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${v0Key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: enrichedPrompt, responseMode: 'async' }),
      })
      // Fallback: if chat_id is stale/invalid, create a new chat instead of failing
      if (chatRes.status === 404) {
        console.warn(`[v0-designer] Chat ${existingChatId} not found — falling back to new chat creation`)
        fellBackToNew = true
        chatRes = await fetch(`${V0_API_URL}/v1/chats`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${v0Key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: enrichedPrompt,
            system: 'You are an expert web designer. Build clean, modern, responsive websites using React and Tailwind CSS.',
            responseMode: 'async',
          }),
        })
      }
    } else {
      chatRes = await fetch(`${V0_API_URL}/v1/chats`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${v0Key}`, 'Content-Type': 'application/json' },
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
      return new Response(JSON.stringify({ success: false, error: `V0 API error: ${chatRes.status}`, details: errText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const chatData = await chatRes.json()
    const effectiveIsEdit = isEdit && !fellBackToNew
    const chatId = effectiveIsEdit ? existingChatId : chatData.id
    const editUrl = effectiveIsEdit ? `https://v0.app/chat/${existingChatId}` : (chatData.webUrl || `https://v0.app/chat/${chatData.id}`)

    console.log(`[v0-designer] Got edit_url instantly: ${editUrl}`)

    // ═══════════════════════════════════════════════════════
    // PHASE 2: Return link IMMEDIATELY to caller
    // ═══════════════════════════════════════════════════════

    const result = {
      chat_id: chatId,
      preview_url: null,
      edit_url: editUrl,
      status: 'generating',
      is_edit: isEdit,
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3: CRM storage — all in parallel, non-blocking
    // ═══════════════════════════════════════════════════════

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Resolve customer_id
    let resolvedCustomerId = customer_id
    if (!resolvedCustomerId) {
      const { data: existing } = await supabase.from('customers')
        .select('id').eq('full_name', 'V0 Designer Bot').limit(1).single()
      if (existing) {
        resolvedCustomerId = existing.id
      } else {
        const { data: newCustomer } = await supabase.from('customers').insert({
          full_name: 'V0 Designer Bot', status: 'active', source: 'system',
          notes: 'System customer for V0 web design outputs', category: 'digital-services',
        }).select('id').single()
        resolvedCustomerId = newCustomer?.id
      }
    }

    // All CRM writes in parallel
    const threadPromise = supabase.from('conversation_threads').insert({
      channel: 'v0-designer', status: 'open',
      summary: `V0 Design: ${prompt.substring(0, 200)}`,
      raw_transcript: JSON.stringify({ prompt, chat_id: chatId, edit_url: editUrl, version_status: 'generating' }),
      category: category || 'digital-services', customer_id: resolvedCustomerId,
    }).select('id').single()

    const [threadResult] = await Promise.all([threadPromise])
    const threadId = threadResult.data?.id

    // Fire remaining CRM ops in parallel
    await Promise.all([
      // api_previews
      effectiveIsEdit
        ? supabase.from('api_previews').update({
            preview_url: null, edit_url: editUrl, status: 'generating',
            meta: { chat_id: chatId, version_status: 'generating', last_edit_prompt: prompt },
            updated_at: new Date().toISOString(),
          }).eq('source', 'v0-designer').filter('meta->>chat_id', 'eq', chatId)
        : supabase.from('api_previews').insert({
            customer_id: resolvedCustomerId, source: 'v0-designer',
            title: `V0 Design: ${prompt.substring(0, 120)}`, prompt,
            preview_url: null, edit_url: editUrl, status: 'generating',
            meta: { chat_id: chatId, version_status: 'generating' },
            bot_task_id: bot_task_id || null, thread_id: threadId || null,
          }),

      // bot_task
      bot_task_id
        ? supabase.from('bot_tasks').update({
            status: 'in_progress',
            meta: { prompt, chat_id: chatId, edit_url: editUrl, thread_id: threadId, version_status: 'generating' },
          }).eq('id', bot_task_id)
        : Promise.resolve(),

      // activity_log
      supabase.from('activity_log').insert({
        entity_type: 'conversation_thread', entity_id: threadId || null,
        action: effectiveIsEdit ? 'v0_design_edited' : 'v0_design_generated',
        meta: { name: `V0 ${effectiveIsEdit ? 'Edit' : 'Design'}: ${prompt.substring(0, 80)}`, chat_id: chatId },
      }),
    ])

    result.thread_id = threadId
    console.log(`[v0-designer] Done:`, JSON.stringify(result))

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
