import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = url.pathname.split('/').pop()

  // Bot endpoints use BOT_SECRET header; staff endpoints use JWT
  const botSecret = req.headers.get('x-bot-secret')
  const authHeader = req.headers.get('Authorization')
  const expectedSecret = Deno.env.get('BOT_SECRET')

  const isBot = botSecret && expectedSecret && botSecret === expectedSecret
  const isStaff = authHeader?.startsWith('Bearer ')

  if (!isBot && !isStaff) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Use service role for bot, user context for staff
  const supabase = isBot
    ? createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    : createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader! } }
      })

  if (isStaff) {
    const token = authHeader!.replace('Bearer ', '')
    const { error } = await supabase.auth.getClaims(token)
    if (error) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const body = req.method !== 'GET' ? await req.json() : {}

    // POST /task — create or update card from bot
    if (path === 'task' && req.method === 'POST') {
      const { external_id, source, source_url, title, content, metadata } = body

      // Check if card exists
      const { data: existing } = await supabase
        .from('cards')
        .select('id')
        .eq('external_id', external_id)
        .maybeSingle()

      if (existing) {
        // Append comment
        await supabase.from('card_comments').insert({
          card_id: existing.id,
          body: `[Bot Update] ${content || title}`,
        })
        // Update fields if provided
        const updates: Record<string, unknown> = {}
        if (source_url) updates.source_url = source_url
        if (Object.keys(updates).length > 0) {
          await supabase.from('cards').update(updates).eq('id', existing.id)
        }
        return json({ action: 'updated', card_id: existing.id })
      }

      // Find or create default board + inbox list
      let { data: board } = await supabase
        .from('boards')
        .select('id')
        .eq('name', 'Clawd Bot Command Center')
        .maybeSingle()

      if (!board) {
        const { data: newBoard } = await supabase
          .from('boards')
          .insert({ name: 'Clawd Bot Command Center', description: 'Auto-created by Clawd Bot', visibility: 'team' })
          .select('id')
          .single()
        board = newBoard
      }

      let { data: inbox } = await supabase
        .from('lists')
        .select('id')
        .eq('board_id', board!.id)
        .eq('name', 'Inbox')
        .maybeSingle()

      if (!inbox) {
        const { data: newList } = await supabase
          .from('lists')
          .insert({ board_id: board!.id, name: 'Inbox', position: 0 })
          .select('id')
          .single()
        inbox = newList
      }

      // Classify priority
      let priority = 'medium'
      const keywords = metadata?.keywords || []
      const lowerTitle = (title || '').toLowerCase()
      if (keywords.includes('urgent') || lowerTitle.includes('urgent')) priority = 'urgent'
      else if (keywords.includes('high') || lowerTitle.includes('important')) priority = 'high'
      else if (keywords.includes('low') || lowerTitle.includes('fyi')) priority = 'low'

      // Get max position
      const { data: maxPos } = await supabase
        .from('cards')
        .select('position')
        .eq('list_id', inbox!.id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { data: card } = await supabase
        .from('cards')
        .insert({
          board_id: board!.id,
          list_id: inbox!.id,
          title: title || 'Untitled',
          description: content || '',
          source,
          source_url,
          external_id,
          priority,
          position: (maxPos?.position ?? -1) + 1,
        })
        .select('id')
        .single()

      // Auto-label based on source
      if (card) {
        const labelMap: Record<string, string> = {
          x: 'Lead', twitter: 'Lead', reddit: 'Content Idea',
          craigslist: 'Opportunity', web: 'Bug/Issue', email: 'Follow-up',
        }
        const labelName = labelMap[source?.toLowerCase()] || 'Lead'
        const { data: label } = await supabase
          .from('labels')
          .select('id')
          .eq('board_id', board!.id)
          .eq('name', labelName)
          .maybeSingle()

        if (label) {
          await supabase.from('card_labels').insert({ card_id: card.id, label_id: label.id })
        }
      }

      return json({ action: 'created', card_id: card?.id })
    }

    // POST /move
    if (path === 'move' && req.method === 'POST') {
      const { card_id, to_list_id } = body
      const { error } = await supabase.from('cards').update({ list_id: to_list_id }).eq('id', card_id)
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    // POST /comment
    if (path === 'comment' && req.method === 'POST') {
      const { card_id, comment } = body
      const { error } = await supabase.from('card_comments').insert({ card_id, body: comment })
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    // POST /attach
    if (path === 'attach' && req.method === 'POST') {
      const { card_id, type, title: attTitle, url: attUrl } = body
      const { error } = await supabase.from('card_attachments').insert({
        card_id, type: type || 'url', title: attTitle, url: attUrl,
      })
      if (error) return json({ error: error.message }, 400)
      return json({ success: true })
    }

    // GET /state
    if (path === 'state' && req.method === 'GET') {
      const { data: boards } = await supabase.from('boards').select(`
        id, name,
        lists:lists(id, name, position,
          cards:cards(id, title, status, priority, position, source)
        )
      `).order('created_at', { ascending: true })

      return json({ boards })
    }

    return json({ error: 'Unknown endpoint' }, 404)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return json({ error: msg }, 500)
  }
})
