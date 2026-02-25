/**
 * Telegram Media Listener v2
 * 
 * Listens for media in DMs and specified group chats.
 * Asks "Save to CRM?" — stores pending media in DB (not memory).
 * On "Yes" callback, retrieves from DB and saves via clawd-bot/content.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TG_API = 'https://api.telegram.org/bot'

// Group IDs the bot should listen in (add more as needed)
const ALLOWED_GROUP_IDS = [-5295903251]

// Persistent reply keyboard — always visible to user
const PERSISTENT_KEYBOARD = {
  keyboard: [
    [{ text: '💰 Invoice' }, { text: '📱 SMM' }],
    [{ text: '👤 Customer' }, { text: '📅 Calendar' }],
    [{ text: '🗓 Calendly' }, { text: '🤝 Meeting' }],
    [{ text: '📋 Menu' }, { text: '❌ Cancel' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
}

// Register bot commands + set persistent keyboard on first call
let commandsRegistered = false
async function ensureBotCommands(token: string) {
  if (commandsRegistered) return
  commandsRegistered = true
  await tgPost(token, 'setMyCommands', {
    commands: [
      { command: 'menu', description: '🎛 Open Command Center' },
      { command: 'invoice', description: '💰 Invoice Terminal' },
      { command: 'smm', description: '📱 SMM Terminal' },
      { command: 'customer', description: '👤 Customer Terminal' },
      { command: 'calendar', description: '📅 Calendar Terminal' },
      { command: 'calendly', description: '🗓 Availability Setup' },
      { command: 'meeting', description: '🤝 Meeting Terminal' },
      { command: 'xpost', description: '📡 Quick post to social media' },
      { command: 'cancel', description: '❌ Cancel active session' },
      { command: 'higs', description: '🎬 Higgsfield model list' },
    ],
  })
}

async function tgPost(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`${TG_API}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log(`[tg:${method}]`, res.status, text.slice(0, 200))
  return res
}

function resolvePersistentAction(input: string): 'invoice' | 'smm' | 'customer' | 'calendar' | 'calendly' | 'meeting' | 'menu' | 'cancel' | null {
  const normalized = input.replace(/^[^a-zA-Z0-9/]+/, '').trim().toLowerCase()
  if (normalized === '/menu' || normalized === '/start' || normalized === 'menu') return 'menu'
  if (normalized === '/invoice' || normalized === 'invoice') return 'invoice'
  if (normalized === '/smm' || normalized === 'smm') return 'smm'
  if (normalized === '/customer' || normalized === 'customer') return 'customer'
  if (normalized === '/calendar' || normalized === 'calendar') return 'calendar'
  if (normalized === '/calendly' || normalized === 'calendly') return 'calendly'
  if (normalized === '/meeting' || normalized === 'meeting') return 'meeting'
  if (normalized === '/cancel' || normalized === 'cancel') return 'cancel'
  return null
}

function extractMedia(message: Record<string, unknown>): { fileId: string; type: string; fileName: string; fileSize: number } | null {
  if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
    const largest = message.photo[message.photo.length - 1] as Record<string, unknown>
    return { fileId: largest.file_id as string, type: 'image', fileName: `photo_${Date.now()}.jpg`, fileSize: (largest.file_size as number) || 0 }
  }
  if (message.video) {
    const v = message.video as Record<string, unknown>
    return { fileId: v.file_id as string, type: 'video', fileName: (v.file_name as string) || `video_${Date.now()}.mp4`, fileSize: (v.file_size as number) || 0 }
  }
  if (message.document) {
    const d = message.document as Record<string, unknown>
    const mime = (d.mime_type as string) || ''
    let docType = 'doc'
    if (mime.startsWith('image/')) docType = 'image'
    else if (mime.startsWith('video/')) docType = 'video'
    return { fileId: d.file_id as string, type: docType, fileName: (d.file_name as string) || `file_${Date.now()}`, fileSize: (d.file_size as number) || 0 }
  }
  if (message.audio || message.voice) {
    const a = (message.audio || message.voice) as Record<string, unknown>
    return { fileId: a.file_id as string, type: 'audio', fileName: (a.file_name as string) || `audio_${Date.now()}.ogg`, fileSize: (a.file_size as number) || 0 }
  }
  return null
}

// ─── Invoice Terminal via Telegram ───
async function processInvoiceCommand(
  chatId: number,
  prompt: string,
  history: { role: string; text: string }[],
  tgToken: string,
  supabaseUrl: string,
  botSecret: string,
  supabase: any,
) {
  await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: '⏳ Processing invoice command...', parse_mode: 'HTML' })

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/clawd-bot/invoice-command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': botSecret,
      },
      body: JSON.stringify({ prompt, history }),
    })
    const rawData = await res.json()
    const result = rawData?.data || rawData

    let replyText = ''

    if (result?.type === 'clarify') {
      replyText = `❓ ${result.message}`
    } else if (result?.type === 'executed') {
      const lines: string[] = []
      for (const action of result.actions || []) {
        if (action.success) {
          lines.push(`✅ ${action.description}`)
          if (action.data) {
            const parts: string[] = []
            if (action.data.invoice_number) parts.push(`#${action.data.invoice_number}`)
            if (action.data.amount) parts.push(`$${Number(action.data.amount).toFixed(2)}`)
            if (action.data.status) parts.push(action.data.status)
            if (action.data.customer_name) parts.push(action.data.customer_name)
            if (action.data.email_sent) parts.push('📧 email sent')
            if (action.data.pdf_attached) parts.push('📎 PDF')
            if (parts.length) lines.push(`  → ${parts.join(' · ')}`)
          }
        } else {
          lines.push(`❌ ${action.description}: ${action.error || 'unknown'}`)
        }
      }
      replyText = lines.join('\n') || '✅ Done.'
    } else if (result?.type === 'message') {
      replyText = result.message
    } else {
      replyText = `<pre>${JSON.stringify(result, null, 2).slice(0, 3500)}</pre>`
    }

    // Update conversation history in session (if active)
    const { data: sessions } = await supabase.from('webhook_events')
      .select('id, payload')
      .eq('source', 'telegram').eq('event_type', 'invoice_session')
      .filter('payload->>chat_id', 'eq', String(chatId))
      .limit(1)

    if (sessions && sessions.length > 0) {
      const session = sessions[0]
      const payload = session.payload as { chat_id: number; history: any[]; created: number }
      const newHistory = [
        ...(payload.history || []),
        { role: 'user', text: prompt },
        { role: 'assistant', text: replyText.slice(0, 500) },
      ].slice(-10)

      await supabase.from('webhook_events').update({
        payload: { ...payload, history: newHistory },
      }).eq('id', session.id)
    }

    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: replyText.slice(0, 4000),
      parse_mode: 'HTML',
    })
  } catch (e: any) {
    console.error('[invoice-tg] error:', e)
    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ <b>Invoice command failed:</b> <code>${(e.message || String(e)).slice(0, 300)}</code>`,
      parse_mode: 'HTML',
    })
  }
}

// ─── SMM Terminal via Telegram ───
async function processSMMCommand(
  chatId: number,
  prompt: string,
  history: { role: string; text: string }[],
  tgToken: string,
  supabaseUrl: string,
  botSecret: string,
  supabase: any,
) {
  await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: '🧠 Thinking a bit...', parse_mode: 'HTML' })

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/clawd-bot/smm-command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': botSecret,
      },
      body: JSON.stringify({ prompt, profile: 'STU25', history }),
    })
    const rawData = await res.json()
    const result = rawData?.data || rawData

    let replyText = ''

    if (result?.type === 'clarify') {
      replyText = `❓ ${result.message}`
    } else if (result?.type === 'executed') {
      const lines: string[] = []
      for (const action of result.actions || []) {
        if (action.success) {
          lines.push(`✅ ${action.description}`)
          if (action.data) {
            const parts: string[] = []
            if (action.data.request_id) parts.push(`🆔 ${action.data.request_id}`)
            if (action.data.platforms) parts.push(`📡 ${Array.isArray(action.data.platforms) ? action.data.platforms.join(', ') : action.data.platforms}`)
            if (action.data.scheduled_for) parts.push(`🕐 ${action.data.scheduled_for}`)
            if (parts.length) lines.push(`  → ${parts.join(' · ')}`)
          }
        } else {
          lines.push(`❌ ${action.description}: ${action.error || 'unknown'}`)
        }
      }
      replyText = lines.join('\n') || '✅ Done.'
    } else if (result?.type === 'message') {
      replyText = result.message
    } else {
      replyText = `<pre>${JSON.stringify(result, null, 2).slice(0, 3500)}</pre>`
    }

    // Update conversation history in session
    const { data: sessions } = await supabase.from('webhook_events')
      .select('id, payload')
      .eq('source', 'telegram').eq('event_type', 'smm_session')
      .filter('payload->>chat_id', 'eq', String(chatId))
      .limit(1)

    if (sessions && sessions.length > 0) {
      const session = sessions[0]
      const payload = session.payload as { chat_id: number; history: any[]; created: number }
      const newHistory = [
        ...(payload.history || []),
        { role: 'user', text: prompt },
        { role: 'assistant', text: replyText.slice(0, 500) },
      ].slice(-10)

      await supabase.from('webhook_events').update({
        payload: { ...payload, history: newHistory },
      }).eq('id', session.id)
    }

    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: replyText.slice(0, 4000),
      parse_mode: 'HTML',
    })
  } catch (e: any) {
    console.error('[smm-tg] error:', e)
    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ <b>SMM command failed:</b> <code>${(e.message || String(e)).slice(0, 300)}</code>`,
      parse_mode: 'HTML',
    })
  }
}

// ─── Generic Module Terminal via Telegram (Customer, Calendar, Meeting, Calendly) ───
async function processModuleCommand(
  chatId: number,
  prompt: string,
  history: { role: string; text: string }[],
  tgToken: string,
  supabaseUrl: string,
  botSecret: string,
  supabase: any,
  module: 'customer' | 'calendar' | 'meeting' | 'calendly',
) {
  const moduleLabels: Record<string, string> = {
    customer: '👤 Customer',
    calendar: '📅 Calendar',
    meeting: '🤝 Meeting',
    calendly: '🗓 Calendly',
  }

  await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: `⏳ Processing ${moduleLabels[module]} command...`, parse_mode: 'HTML' })

  // Map modules to their edge function endpoints
  const moduleEndpoints: Record<string, { fn: string; bodyExtra?: Record<string, unknown> }> = {
    customer: { fn: 'customer-scheduler' },
    calendar: { fn: 'clawd-bot/calendar-command' },
    meeting: { fn: 'clawd-bot/meeting-command' },
    calendly: { fn: 'clawd-bot/availability-command' },
  }

  const endpoint = moduleEndpoints[module]

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${endpoint.fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': botSecret,
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
      },
      body: JSON.stringify({ prompt, history, ...endpoint.bodyExtra }),
    })
    const rawData = await res.json()
    const result = rawData?.data || rawData

    let replyText = ''

    if (result?.type === 'clarify') {
      replyText = `❓ ${result.message}`
    } else if (result?.type === 'executed') {
      const lines: string[] = []
      for (const action of result.actions || []) {
        if (action.success) {
          lines.push(`✅ ${action.description}`)
          if (action.data) {
            const parts: string[] = []
            if (action.data.customer_id) parts.push(`ID: ${action.data.customer_id}`)
            if (action.data.full_name) parts.push(action.data.full_name)
            if (action.data.action) parts.push(action.data.action)
            if (action.data.message) parts.push(action.data.message)
            if (action.data.room_url) parts.push(`🔗 ${action.data.room_url}`)
            if (action.data.date_formatted) parts.push(`📅 ${action.data.date_formatted}`)
            if (action.data.time_formatted) parts.push(`🕐 ${action.data.time_formatted}`)
            if (parts.length) lines.push(`  → ${parts.join(' · ')}`)
          }
        } else {
          lines.push(`❌ ${action.description}: ${action.error || 'unknown'}`)
        }
      }
      replyText = lines.join('\n') || '✅ Done.'
    } else if (result?.type === 'message') {
      replyText = result.message
    } else {
      replyText = `<pre>${JSON.stringify(result, null, 2).slice(0, 3500)}</pre>`
    }

    // Update conversation history in session
    const sessionType = `${module}_session`
    const { data: sessions } = await supabase.from('webhook_events')
      .select('id, payload')
      .eq('source', 'telegram').eq('event_type', sessionType)
      .filter('payload->>chat_id', 'eq', String(chatId))
      .limit(1)

    if (sessions && sessions.length > 0) {
      const session = sessions[0]
      const payload = session.payload as { chat_id: number; history: any[]; created: number }
      const newHistory = [
        ...(payload.history || []),
        { role: 'user', text: prompt },
        { role: 'assistant', text: replyText.slice(0, 500) },
      ].slice(-10)

      await supabase.from('webhook_events').update({
        payload: { ...payload, history: newHistory },
      }).eq('id', session.id)
    }

    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: replyText.slice(0, 4000),
      parse_mode: 'HTML',
    })
  } catch (e: any) {
    console.error(`[${module}-tg] error:`, e)
    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ <b>${moduleLabels[module]} command failed:</b> <code>${(e.message || String(e)).slice(0, 300)}</code>`,
      parse_mode: 'HTML',
    })
  }
}

Deno.serve(async (req) => {
  console.log('[telegram-media-listener] request received:', req.method)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const BOT_SECRET = Deno.env.get('BOT_SECRET')
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!TG_TOKEN || !BOT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[telegram-media-listener] Missing env vars')
    return new Response(JSON.stringify({ error: 'Missing config' }), { status: 500, headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const rawBody = await req.text()
    console.log('[telegram-media-listener] body:', rawBody.slice(0, 500))

    const update = JSON.parse(rawBody)

    // ─── Handle callback queries (user pressed Yes/No) ───
    if (update.callback_query) {
      const cb = update.callback_query
      const data = (cb.data as string) || ''
      const chatId = cb.message?.chat?.id
      const messageId = cb.message?.message_id

      console.log('[callback]', data)

      if (data === 'crm_skip') {
        await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Skipped' })
        if (chatId && messageId) {
          await tgPost(TG_TOKEN, 'editMessageText', { chat_id: chatId, message_id: messageId, text: '⏭ Skipped — not saved to CRM.' })
        }
        return new Response('ok')
      }

      if (data.startsWith('crm_save:')) {
        const pendingId = data.replace('crm_save:', '')

        // Retrieve pending media from DB
        const { data: pending, error: fetchErr } = await supabase
          .from('webhook_events')
          .select('payload')
          .eq('id', pendingId)
          .eq('source', 'telegram')
          .eq('event_type', 'pending_media')
          .single()

        if (fetchErr || !pending) {
          console.error('[callback] pending not found:', pendingId, fetchErr)
          await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Session expired. Please re-send the file.' })
          return new Response('ok')
        }

        const media = pending.payload as { fileId: string; type: string; fileName: string; fileSize?: number }

        const TG_BOT_API_LIMIT = 20 * 1024 * 1024 // 20MB
        const fileSizeBytes = media.fileSize || 0

        // Telegram Bot API cannot download files >20MB via getFile
        if (fileSizeBytes > TG_BOT_API_LIMIT) {
          const sizeMB = Math.round(fileSizeBytes / (1024 * 1024))
          await supabase.from('webhook_events').delete().eq('id', pendingId)
          if (chatId && messageId) {
            await tgPost(TG_TOKEN, 'editMessageText', {
              chat_id: chatId, message_id: messageId,
              text: `⚠️ <b>${media.fileName}</b> is ${sizeMB}MB — too large for Telegram download (20MB limit).\n\n📤 Upload it directly via the CRM dashboard:\n<a href="https://socooked.lovable.app/content">Open Content Library</a>`,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            })
          }
          return new Response('ok')
        }

        await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Saving to CRM...' })

        console.log('[save] storing file_id:', media.fileId, 'type:', media.type)

        const storeRes = await fetch(`${SUPABASE_URL}/functions/v1/clawd-bot/content`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-bot-secret': BOT_SECRET,
          },
          body: JSON.stringify({
            title: media.fileName,
            type: media.type,
            status: 'published',
            source: 'telegram',
            category: 'telegram',
            file_id: media.fileId,
            folder: 'STU25sTG',
          }),
        })

        const storeText = await storeRes.text()
        console.log('[save] result:', storeRes.status, storeText.slice(0, 300))

        let success = false
        try {
          const storeResult = JSON.parse(storeText)
          success = storeRes.ok && storeResult.success
        } catch { /* ignore */ }

        // Clean up the pending record
        await supabase.from('webhook_events').delete().eq('id', pendingId)

        if (chatId && messageId) {
          const msg = success
            ? `✅ <b>Saved to CRM!</b>\n📁 Tap to copy filename:\n\n<code>${media.fileName}</code>`
            : `❌ <b>Failed to save.</b> Check logs for details.`
          await tgPost(TG_TOKEN, 'editMessageText', { chat_id: chatId, message_id: messageId, text: msg, parse_mode: 'HTML' })
        }

        return new Response('ok')
      }

      // ─── /xpost callback: user picked a profile ───
      if (data.startsWith('xp_prof:')) {
        const profileUsername = data.replace('xp_prof:', '')
        await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cb.id, text: `Loading platforms for ${profileUsername}...` })

        // Fetch profile details to get connected platforms
        const profRes = await fetch(`${SUPABASE_URL}/functions/v1/smm-api?action=get-profile&username=${encodeURIComponent(profileUsername)}`, {
          headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        })
        const profData = await profRes.json()
        // Response shape: { success, profile: { username, social_accounts: { x: {...}, instagram: {...}, tiktok: "" } } }
        const profile = profData.profile || profData
        const socialAccounts = profile.social_accounts || profile.accounts || {}
        console.log('[xpost] profile keys:', Object.keys(profile), 'social_accounts type:', typeof socialAccounts, 'keys:', Object.keys(socialAccounts))

        const connectedPlatforms: { name: string; display: string }[] = []

        if (typeof socialAccounts === 'object' && !Array.isArray(socialAccounts)) {
          // Object format: { x: { handle, display_name }, instagram: { handle }, tiktok: "" }
          for (const [platName, value] of Object.entries(socialAccounts)) {
            // Empty string or null/false means not connected
            if (!value || (typeof value === 'string' && !value.trim())) continue
            const platData = value as Record<string, unknown>
            const handle = (platData.handle || platData.username || platData.display_name || platName) as string
            connectedPlatforms.push({ name: platName.toLowerCase(), display: `${platName} (@${handle})` })
          }
        } else if (Array.isArray(socialAccounts)) {
          for (const acc of socialAccounts) {
            const platName = (acc.platform || acc.name || acc.type || '').toLowerCase()
            const handle = acc.username || acc.handle || acc.display_name || platName
            if (platName) {
              connectedPlatforms.push({ name: platName, display: `${platName} (@${handle})` })
            }
          }
        }

        if (connectedPlatforms.length === 0) {
          if (chatId && messageId) {
            await tgPost(TG_TOKEN, 'editMessageText', {
              chat_id: chatId, message_id: messageId,
              text: `❌ <b>No connected platforms found for ${profileUsername}.</b>\nConnect platforms in the SMM dashboard first.`,
              parse_mode: 'HTML',
            })
          }
          return new Response('ok')
        }

        // Build platform selection keyboard (2 per row)
        const platformEmojis: Record<string, string> = { x: '𝕏', twitter: '𝕏', instagram: '📸', facebook: '📘', linkedin: '💼', pinterest: '📌', tiktok: '🎵', youtube: '▶️' }
        const rows: { text: string; callback_data: string }[][] = []
        for (let i = 0; i < connectedPlatforms.length; i += 2) {
          const row = connectedPlatforms.slice(i, i + 2).map(p => ({
            text: `${platformEmojis[p.name] || '🌐'} ${p.display}`,
            callback_data: `xp_plat:${profileUsername}:${p.name}`,
          }))
          rows.push(row)
        }
        rows.push([{ text: '❌ Cancel', callback_data: 'xp_cancel' }])

        if (chatId && messageId) {
          await tgPost(TG_TOKEN, 'editMessageText', {
            chat_id: chatId, message_id: messageId,
            text: `📡 <b>${profileUsername}</b> — Pick a platform:`,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: rows },
          })
        }
        return new Response('ok')
      }

      // ─── /xpost callback: user picked a platform → store session, ask for message ───
      if (data.startsWith('xp_plat:')) {
        const parts = data.replace('xp_plat:', '').split(':')
        const profileUsername = parts[0]
        const platform = parts.slice(1).join(':')

        await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cb.id, text: `Selected ${platform}` })

        // Store xpost session in DB
        await supabase.from('webhook_events').insert({
          source: 'telegram',
          event_type: 'xpost_session',
          payload: { chat_id: chatId, profile: profileUsername, platform, created: Date.now() },
          processed: false,
        })

        const platformEmojis: Record<string, string> = { x: '𝕏', twitter: '𝕏', instagram: '📸', facebook: '📘', linkedin: '💼', pinterest: '📌', tiktok: '🎵', youtube: '▶️' }
        const emoji = platformEmojis[platform] || '🌐'

        if (chatId && messageId) {
          await tgPost(TG_TOKEN, 'editMessageText', {
            chat_id: chatId, message_id: messageId,
            text: `${emoji} <b>Ready to post to ${platform}</b> via <b>${profileUsername}</b>\n\n✏️ Type your message and send it. It will be posted immediately.\n\nSend /cancel to abort.`,
            parse_mode: 'HTML',
          })
        }
        return new Response('ok')
      }

      // ─── /xpost callback: cancel ───
      if (data === 'xp_cancel') {
        await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Cancelled' })
        if (chatId) {
          // Clean up any active sessions for this chat
          await supabase.from('webhook_events').delete()
            .eq('source', 'telegram').eq('event_type', 'xpost_session')
            .filter('payload->>chat_id', 'eq', String(chatId))
        }
        if (chatId && messageId) {
          await tgPost(TG_TOKEN, 'editMessageText', { chat_id: chatId, message_id: messageId, text: '⏭ Post cancelled.' })
        }
        return new Response('ok')
      }

      // ─── Menu callbacks: Invoice or SMM ───
      if (data === 'menu_invoice') {
        await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Invoice Terminal' })
        // Clear any existing sessions first
        await supabase.from('webhook_events').delete()
          .eq('source', 'telegram').in('event_type', ['invoice_session', 'smm_session'])
          .filter('payload->>chat_id', 'eq', String(chatId))
        // Create invoice session
        await supabase.from('webhook_events').insert({
          source: 'telegram',
          event_type: 'invoice_session',
          payload: { chat_id: chatId, history: [], created: Date.now() },
          processed: false,
        })
        if (chatId && messageId) {
          await tgPost(TG_TOKEN, 'editMessageText', {
            chat_id: chatId, message_id: messageId,
            text: '💰 <b>Invoice Terminal</b>\n\nWhat can I help you with today sir?\n\n<i>Type your invoice commands naturally or /cancel to exit.</i>',
            parse_mode: 'HTML',
          })
        }
        return new Response('ok')
      }

      if (data === 'menu_smm') {
        await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'SMM Terminal' })
        // Clear any existing sessions first
        await supabase.from('webhook_events').delete()
          .eq('source', 'telegram').in('event_type', ['invoice_session', 'smm_session'])
          .filter('payload->>chat_id', 'eq', String(chatId))
        // Create SMM session
        await supabase.from('webhook_events').insert({
          source: 'telegram',
          event_type: 'smm_session',
          payload: { chat_id: chatId, history: [], created: Date.now() },
          processed: false,
        })
        if (chatId && messageId) {
          await tgPost(TG_TOKEN, 'editMessageText', {
            chat_id: chatId, message_id: messageId,
            text: '📱 <b>SMM Terminal</b>\n\nWhat can I help you with today sir?\n\n<i>Type your social media commands naturally or /cancel to exit.</i>',
            parse_mode: 'HTML',
          })
        }
        return new Response('ok')
      }

      await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Unknown action' })
      return new Response('ok')
    }

    // ─── Handle replies to IG DM notifications ───
    const message = update.message
    if (!message) {
      console.log('[telegram-media-listener] no message in update, ignoring')
      return new Response('ok')
    }

    const chatId = message.chat?.id
    const chatType = message.chat?.type
    if (!chatId) return new Response('ok')

    // Check if this is a reply to an IG DM notification
    const replyToMsg = message.reply_to_message
    if (replyToMsg && message.text) {
      const replyText = (message.text as string).trim()
      const replyToId = replyToMsg.message_id

      // Look up the original IG DM notification by telegram_message_id
      const { data: matchedComm } = await supabase
        .from('communications')
        .select('metadata, from_address')
        .eq('type', 'instagram')
        .eq('provider', 'upload-post-dm-notify')
        .filter('metadata->>telegram_message_id', 'eq', String(replyToId))
        .limit(1)

      if (matchedComm && matchedComm.length > 0) {
        const meta = matchedComm[0].metadata as Record<string, unknown>
        const participantId = meta?.participant_id as string
        const igUsername = (matchedComm[0].from_address || meta?.ig_username || 'unknown') as string

        if (!participantId) {
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: '❌ Cannot reply — no participant ID found for this conversation.',
            parse_mode: 'HTML',
          })
          return new Response('ok')
        }

        console.log('[ig-reply] Sending IG DM to', igUsername, 'participant_id:', participantId)

        // Send via Upload-Post API
        const UPLOAD_POST_API_KEY = Deno.env.get('UPLOAD_POST_API_KEY')
        if (!UPLOAD_POST_API_KEY) {
          await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '❌ UPLOAD_POST_API_KEY not configured.' })
          return new Response('ok')
        }

        const sendRes = await fetch('https://api.upload-post.com/api/uploadposts/dms/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Apikey ${UPLOAD_POST_API_KEY}`,
          },
          body: JSON.stringify({
            platform: 'instagram',
            user: 'STU25',
            recipient_id: participantId,
            message: replyText,
          }),
        })

        const sendData = await sendRes.text()
        console.log('[ig-reply] Upload-Post response:', sendRes.status, sendData.slice(0, 300))

        if (sendRes.ok) {
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: `✅ <b>Reply sent to @${igUsername} via Instagram DM</b>`,
            parse_mode: 'HTML',
          })

          // Log outbound reply in communications
          await supabase.from('communications').insert({
            type: 'instagram',
            direction: 'outbound',
            to_address: igUsername,
            body: replyText,
            provider: 'upload-post-dm-notify',
            status: 'sent',
            metadata: {
              ig_username: igUsername,
              participant_id: participantId,
              source: 'telegram-reply',
            },
          })
        } else {
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: `❌ <b>Failed to send IG DM.</b>\n<code>${sendData.slice(0, 200)}</code>`,
            parse_mode: 'HTML',
          })
        }

        return new Response('ok')
      }

      // ─── Check if reply matches an EMAIL notification ───
      const { data: matchedEmail } = await supabase
        .from('communications')
        .select('id, from_address, subject, metadata, customer_id')
        .eq('type', 'email')
        .eq('direction', 'inbound')
        .filter('metadata->>telegram_message_id', 'eq', String(replyToId))
        .limit(1)

      if (matchedEmail && matchedEmail.length > 0) {
        const emailRecord = matchedEmail[0]
        const recipientEmail = emailRecord.from_address
        const originalSubject = emailRecord.subject || '(no subject)'

        if (!recipientEmail) {
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: '❌ Cannot reply — no sender email found for this notification.',
            parse_mode: 'HTML',
          })
          return new Response('ok')
        }

        console.log('[email-reply] Sending email reply to', recipientEmail, 'subject:', originalSubject)

        // Send via gmail-api edge function
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
        const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
        const BOT_SECRET_VAL = Deno.env.get('BOT_SECRET')

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !BOT_SECRET_VAL) {
          await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '❌ Gmail API credentials not configured.' })
          return new Response('ok')
        }

        const replySubject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`

        const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/gmail-api?action=send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'x-bot-secret': BOT_SECRET_VAL,
          },
          body: JSON.stringify({
            to: recipientEmail,
            subject: replySubject,
            body: replyText,
          }),
        })

        const sendData = await sendRes.text()
        console.log('[email-reply] gmail-api response:', sendRes.status, sendData.slice(0, 300))

        if (sendRes.ok) {
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: `✅ <b>Email reply sent to ${recipientEmail}</b>\n📋 ${replySubject}`,
            parse_mode: 'HTML',
          })
        } else {
          let errorMsg = sendData.slice(0, 200)
          // Check for anti-spam cooldown
          if (sendRes.status === 429) {
            errorMsg = 'Anti-spam cooldown active — wait 3 minutes before sending another email to this recipient.'
          }
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: `❌ <b>Failed to send email reply.</b>\n<code>${errorMsg}</code>`,
            parse_mode: 'HTML',
          })
        }

        return new Response('ok')
      }

      // Reply was to a bot message but no IG DM or email match found
      // If it's a persistent menu action, handle it directly.
      const replyFromBot = replyToMsg.from?.is_bot === true
      if (replyFromBot) {
        const replyAsText = (message.text as string).trim()
        const replyAction = resolvePersistentAction(replyAsText)

        if (replyAction === 'menu') {
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: '🎛 <b>Command Center</b>\n\nTap a button below to get started:',
            parse_mode: 'HTML',
            reply_markup: PERSISTENT_KEYBOARD,
          })
          return new Response('ok')
        }

        if (replyAction === 'invoice') {
          await supabase.from('webhook_events').delete()
            .eq('source', 'telegram').in('event_type', ['invoice_session', 'smm_session'])
            .filter('payload->>chat_id', 'eq', String(chatId))
          await supabase.from('webhook_events').insert({
            source: 'telegram',
            event_type: 'invoice_session',
            payload: { chat_id: chatId, history: [], created: Date.now() },
            processed: false,
          })
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: '💰 <b>Invoice Terminal</b>\n\nWhat can I help you with today sir?\n\n<i>Type your invoice commands naturally or tap ❌ Cancel to exit.</i>',
            parse_mode: 'HTML',
            reply_markup: PERSISTENT_KEYBOARD,
          })
          return new Response('ok')
        }

        if (replyAction === 'smm') {
          await supabase.from('webhook_events').delete()
            .eq('source', 'telegram').in('event_type', ['invoice_session', 'smm_session'])
            .filter('payload->>chat_id', 'eq', String(chatId))
          await supabase.from('webhook_events').insert({
            source: 'telegram',
            event_type: 'smm_session',
            payload: { chat_id: chatId, history: [], created: Date.now() },
            processed: false,
          })
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: '📱 <b>SMM Terminal</b>\n\nWhat can I help you with today sir?\n\n<i>Type your social media commands naturally or tap ❌ Cancel to exit.</i>',
            parse_mode: 'HTML',
            reply_markup: PERSISTENT_KEYBOARD,
          })
          return new Response('ok')
        }

        if (replyAction === 'cancel') {
          const { data: sessions } = await supabase.from('webhook_events').select('id')
            .eq('source', 'telegram')
            .in('event_type', ['xpost_session', 'invoice_session', 'smm_session'])
            .filter('payload->>chat_id', 'eq', String(chatId))
          if (sessions && sessions.length > 0) {
            await supabase.from('webhook_events').delete()
              .eq('source', 'telegram')
              .in('event_type', ['xpost_session', 'invoice_session', 'smm_session'])
              .filter('payload->>chat_id', 'eq', String(chatId))
            await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '⏭ Session cancelled.', reply_markup: PERSISTENT_KEYBOARD })
          } else {
            await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: 'ℹ️ Nothing to cancel.', reply_markup: PERSISTENT_KEYBOARD })
          }
          return new Response('ok')
        }

        // Check for active invoice session
        const { data: invSess } = await supabase.from('webhook_events')
          .select('id, payload')
          .eq('source', 'telegram').eq('event_type', 'invoice_session')
          .filter('payload->>chat_id', 'eq', String(chatId))
          .limit(1)
        if (invSess && invSess.length > 0) {
          const sp = invSess[0].payload as { chat_id: number; history: any[]; created: number }
          await processInvoiceCommand(chatId, replyAsText, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
          return new Response('ok')
        }

        // Check for active SMM session
        const { data: smmSess } = await supabase.from('webhook_events')
          .select('id, payload')
          .eq('source', 'telegram').eq('event_type', 'smm_session')
          .filter('payload->>chat_id', 'eq', String(chatId))
          .limit(1)
        if (smmSess && smmSess.length > 0) {
          const sp = smmSess[0].payload as { chat_id: number; history: any[]; created: number }
          await processSMMCommand(chatId, replyAsText, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
          return new Response('ok')
        }

        // No session active either — silently ignore instead of showing error
        console.log('[reply-router] No matching notification or session for message_id:', replyToId, '— ignoring')
        return new Response('ok')
      }
    }

    // ─── Ignore text-only replies to other messages (Cortex stays quiet) ───
    // BUT allow replies that contain media to fall through to media handler
    if (message.reply_to_message && !extractMedia(message)) {
      console.log('[telegram-media-listener] ignoring text reply to message:', message.reply_to_message.message_id)
      return new Response('ok')
    }

    // Only respond in DMs or allowed groups
    const isPrivate = chatType === 'private'
    const isAllowedGroup = ALLOWED_GROUP_IDS.includes(chatId)
    if (!isPrivate && !isAllowedGroup) {
      console.log('[telegram-media-listener] ignoring chat:', chatId, chatType)
      return new Response('ok')
    }

    // ─── /xpost command — interactive social posting ───
    const text = (message.text as string || '').trim()

    // Ensure bot commands are registered
    await ensureBotCommands(TG_TOKEN)

    // ─── Persistent keyboard button presses — check BEFORE sessions ───
    const persistentAction = resolvePersistentAction(text)
    const isPersistentButton = persistentAction !== null

    // ─── Menu action ───
    if (persistentAction === 'menu') {
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '🎛 <b>Command Center</b>\n\nTap a button below to get started:',
        parse_mode: 'HTML',
        reply_markup: PERSISTENT_KEYBOARD,
      })
      return new Response('ok')
    }

    const ALL_SESSIONS = ['xpost_session', 'invoice_session', 'smm_session', 'customer_session', 'calendar_session', 'calendly_session', 'meeting_session']

    // ─── Invoice action ───
    if (persistentAction === 'invoice') {
      await supabase.from('webhook_events').delete().eq('source', 'telegram').in('event_type', ALL_SESSIONS).filter('payload->>chat_id', 'eq', String(chatId))
      await supabase.from('webhook_events').insert({ source: 'telegram', event_type: 'invoice_session', payload: { chat_id: chatId, history: [], created: Date.now() }, processed: false })
      await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '💰 <b>Invoice Terminal</b>\n\nWhat can I help you with today sir?\n\n<i>Type your invoice commands naturally or tap ❌ Cancel to exit.</i>', parse_mode: 'HTML', reply_markup: PERSISTENT_KEYBOARD })
      return new Response('ok')
    }

    // ─── SMM action ───
    if (persistentAction === 'smm') {
      await supabase.from('webhook_events').delete().eq('source', 'telegram').in('event_type', ALL_SESSIONS).filter('payload->>chat_id', 'eq', String(chatId))
      await supabase.from('webhook_events').insert({ source: 'telegram', event_type: 'smm_session', payload: { chat_id: chatId, history: [], created: Date.now() }, processed: false })
      await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '📱 <b>SMM Terminal</b>\n\nWhat can I help you with today sir?\n\n<i>Type your social media commands naturally or tap ❌ Cancel to exit.</i>', parse_mode: 'HTML', reply_markup: PERSISTENT_KEYBOARD })
      return new Response('ok')
    }

    // ─── Customer / Calendar / Calendly / Meeting actions ───
    if (persistentAction === 'customer' || persistentAction === 'calendar' || persistentAction === 'calendly' || persistentAction === 'meeting') {
      const labels: Record<string, string> = { customer: '👤 Customer', calendar: '📅 Calendar', calendly: '🗓 Calendly', meeting: '🤝 Meeting' }
      const hints: Record<string, string> = {
        customer: 'Create, update, or search customers naturally.\n\n• <code>Create customer John Doe, email john@test.com</code>\n• <code>Update Warren status to active</code>',
        calendar: 'Add events, check schedule, manage your calendar.\n\n• <code>Add meeting tomorrow at 3pm</code>\n• <code>Show my schedule for next week</code>',
        calendly: 'Set your availability schedule.\n\n• <code>I\'m available Mon-Wed 2PM-5PM this week</code>\n• <code>Block off Friday</code>',
        meeting: 'Book meetings with customers.\n\n• <code>Setup a meeting with Warren at 5PM next Tuesday</code>\n• <code>Book a 30-min call with John tomorrow</code>',
      }
      const sessionType = `${persistentAction}_session`
      await supabase.from('webhook_events').delete().eq('source', 'telegram').in('event_type', ALL_SESSIONS).filter('payload->>chat_id', 'eq', String(chatId))
      await supabase.from('webhook_events').insert({ source: 'telegram', event_type: sessionType, payload: { chat_id: chatId, history: [], created: Date.now() }, processed: false })
      await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `${labels[persistentAction]} <b>Terminal</b>\n\n${hints[persistentAction]}\n\n<i>Type your commands naturally or tap ❌ Cancel to exit.</i>`, parse_mode: 'HTML', reply_markup: PERSISTENT_KEYBOARD })
      return new Response('ok')
    }

    // ─── Cancel action ───
    if (persistentAction === 'cancel') {
      const { data: sessions } = await supabase.from('webhook_events').select('id').eq('source', 'telegram').in('event_type', ALL_SESSIONS).filter('payload->>chat_id', 'eq', String(chatId))
      if (sessions && sessions.length > 0) {
        await supabase.from('webhook_events').delete().eq('source', 'telegram').in('event_type', ALL_SESSIONS).filter('payload->>chat_id', 'eq', String(chatId))
        await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '⏭ Session cancelled.', reply_markup: PERSISTENT_KEYBOARD })
      } else {
        await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: 'ℹ️ Nothing to cancel.', reply_markup: PERSISTENT_KEYBOARD })
      }
      return new Response('ok')
    }

    // ─── /invoice command — prompt-driven invoicing via Invoice Terminal ───
    if (text.toLowerCase().startsWith('/invoice')) {
      const invoicePrompt = text.replace(/^\/invoice\s*/i, '').trim()

      if (!invoicePrompt) {
        // No inline prompt — enter invoice session mode (like xpost)
        await supabase.from('webhook_events').delete()
          .eq('source', 'telegram').eq('event_type', 'invoice_session')
          .filter('payload->>chat_id', 'eq', String(chatId))

        await supabase.from('webhook_events').insert({
          source: 'telegram',
          event_type: 'invoice_session',
          payload: { chat_id: chatId, history: [], created: Date.now() },
          processed: false,
        })

        await tgPost(TG_TOKEN, 'sendMessage', {
          chat_id: chatId,
          text: '💰 <b>Invoice Terminal active.</b>\n\n'
            + 'Type your invoice commands naturally:\n'
            + '• <code>Send Warren a paid invoice for $500</code>\n'
            + '• <code>List all unpaid invoices</code>\n'
            + '• <code>Mark INV-01055 as paid</code>\n\n'
            + 'Send /cancel to exit invoice mode.',
          parse_mode: 'HTML',
        })
        return new Response('ok')
      }

      // Inline prompt — execute immediately
      await processInvoiceCommand(chatId, invoicePrompt, [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
      return new Response('ok')
    }

    // ─── /smm command — prompt-driven social media management ───
    if (text.toLowerCase().startsWith('/smm')) {
      const smmPrompt = text.replace(/^\/smm\s*/i, '').trim()

      if (!smmPrompt) {
        // No inline prompt — enter SMM session mode
        await supabase.from('webhook_events').delete()
          .eq('source', 'telegram').in('event_type', ['smm_session', 'invoice_session'])
          .filter('payload->>chat_id', 'eq', String(chatId))

        await supabase.from('webhook_events').insert({
          source: 'telegram',
          event_type: 'smm_session',
          payload: { chat_id: chatId, history: [], created: Date.now() },
          processed: false,
        })

        await tgPost(TG_TOKEN, 'sendMessage', {
          chat_id: chatId,
          text: '📱 <b>SMM Terminal active.</b>\n\nWhat can I help you with today sir?\n\n'
            + '<i>Type your social media commands naturally or /cancel to exit.</i>',
          parse_mode: 'HTML',
        })
        return new Response('ok')
      }

      // Inline prompt — execute immediately
      await processSMMCommand(chatId, smmPrompt, [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
      return new Response('ok')
    }

    // ─── /higs command — Higgsfield model reminder ───
    if (text.toLowerCase().startsWith('/higs')) {
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: `🎬 <b>Higgsfield Model Prompts:</b>\n\n`
          + `• <code>higgsfield-ai/soul/standard</code> — Default image model\n`
          + `• <code>higgsfield-ai/soul/turbo</code> — Fast image model\n`
          + `• <code>higgsfield-ai/dop/standard</code> — Default video model\n`
          + `• <code>higgsfield-ai/dop/turbo</code> — Fast video model\n`
          + `• <code>flux</code> — Flux image model\n`
          + `• <code>iris</code> — Iris image model`,
        parse_mode: 'HTML',
      })
      return new Response('ok')
    }

    // ─── Check for active invoice session (multi-turn invoice terminal) ───
    if (text && !text.startsWith('/') && !isPersistentButton) {
      const { data: invoiceSessions } = await supabase.from('webhook_events')
        .select('id, payload')
        .eq('source', 'telegram').eq('event_type', 'invoice_session')
        .filter('payload->>chat_id', 'eq', String(chatId))
        .order('created_at', { ascending: false })
        .limit(1)

      if (invoiceSessions && invoiceSessions.length > 0) {
        const session = invoiceSessions[0]
        const sp = session.payload as { chat_id: number; history: any[]; created: number }

        console.log('[invoice-tg] session active, processing:', text.slice(0, 100))

        await processInvoiceCommand(chatId, text, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
        return new Response('ok')
      }
    }

    // ─── Check for active SMM session (multi-turn SMM terminal) ───
    if (text && !text.startsWith('/') && !isPersistentButton) {
      const { data: smmSessions } = await supabase.from('webhook_events')
        .select('id, payload')
        .eq('source', 'telegram').eq('event_type', 'smm_session')
        .filter('payload->>chat_id', 'eq', String(chatId))
        .order('created_at', { ascending: false })
        .limit(1)

      if (smmSessions && smmSessions.length > 0) {
        const session = smmSessions[0]
        const sp = session.payload as { chat_id: number; history: any[]; created: number }

        console.log('[smm-tg] session active, processing:', text.slice(0, 100))

        await processSMMCommand(chatId, text, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
        return new Response('ok')
      }
    }

    if (text && !text.startsWith('/') && !isPersistentButton) {
      const { data: sessions } = await supabase.from('webhook_events')
        .select('id, payload')
        .eq('source', 'telegram').eq('event_type', 'xpost_session')
        .filter('payload->>chat_id', 'eq', String(chatId))
        .order('created_at', { ascending: false })
        .limit(1)

      if (sessions && sessions.length > 0) {
        const session = sessions[0]
        const sp = session.payload as { profile: string; platform: string; chat_id: number }

        // Delete session immediately
        await supabase.from('webhook_events').delete().eq('id', session.id)

        console.log('[xpost] posting to', sp.platform, 'via', sp.profile, ':', text.slice(0, 100))

        // Normalize platform name for the API
        const platformMap: Record<string, string> = { twitter: 'x', '𝕏': 'x' }
        const apiPlatform = platformMap[sp.platform] || sp.platform

        await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '⏳ Posting...', parse_mode: 'HTML' })

        const postRes = await fetch(`${SUPABASE_URL}/functions/v1/clawd-bot/smm-post`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-bot-secret': BOT_SECRET,
          },
          body: JSON.stringify({
            user: sp.profile,
            platforms: [apiPlatform],
            title: text,
            type: 'text',
          }),
        })
        const postResult = await postRes.text()
        console.log('[xpost] post result:', postRes.status, postResult.slice(0, 300))

        let success = false
        let requestId = ''
        try {
          const parsed = JSON.parse(postResult)
          success = postRes.ok && parsed.success
          requestId = parsed.request_id || parsed.data?.request_id || ''
        } catch { /* ignore */ }

        const platformEmojis: Record<string, string> = { x: '𝕏', twitter: '𝕏', instagram: '📸', facebook: '📘', linkedin: '💼', pinterest: '📌', tiktok: '🎵', youtube: '▶️' }
        const emoji = platformEmojis[sp.platform] || '🌐'

        if (success) {
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: `✅ ${emoji} <b>Posted to ${sp.platform}</b> via <b>${sp.profile}</b>${requestId ? `\n🆔 <code>${requestId}</code>` : ''}`,
            parse_mode: 'HTML',
          })
        } else {
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: `❌ <b>Failed to post.</b>\n<code>${postResult.slice(0, 200)}</code>`,
            parse_mode: 'HTML',
          })
        }
        return new Response('ok')
      }
    }

    const media = extractMedia(message)
    if (!media) {
      console.log('[telegram-media-listener] no media detected, ignoring')
      return new Response('ok')
    }

    console.log('[telegram-media-listener] media detected:', media.type, media.fileName, 'chat:', chatId, chatType)

    // Check for .webp
    if (media.type === 'image' && media.fileName.toLowerCase().endsWith('.webp')) {
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '⚠️ <b>.webp images are not supported.</b>\nPlease re-send as JPG or PNG.',
        parse_mode: 'HTML',
      })
      return new Response('ok')
    }

    // Store pending media in DB so it survives across function invocations
    const { data: inserted, error: insertErr } = await supabase
      .from('webhook_events')
      .insert({
        source: 'telegram',
        event_type: 'pending_media',
        payload: { fileId: media.fileId, type: media.type, fileName: media.fileName, fileSize: media.fileSize },
        processed: false,
      })
      .select('id')
      .single()

    if (insertErr || !inserted) {
      console.error('[telegram-media-listener] failed to store pending:', insertErr)
      await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '❌ Internal error. Please try again.' })
      return new Response('ok')
    }

    const pendingId = inserted.id
    const caption = message.caption ? `\n💬 <i>${message.caption}</i>` : ''
    const fromName = message.from?.first_name || 'Someone'
    const groupLabel = isAllowedGroup ? ` (from ${fromName})` : ''
    const sizeLabel = media.fileSize > 0 ? ` • ${Math.round(media.fileSize / (1024 * 1024))}MB` : ''
    const tooLargeWarning = media.fileSize > 20 * 1024 * 1024 ? '\n⚠️ <i>Large file — will need dashboard upload if saved</i>' : ''

    await tgPost(TG_TOKEN, 'sendMessage', {
      chat_id: chatId,
      text: `📎 <b>${media.fileName}</b> (${media.type}${sizeLabel})${groupLabel}${caption}${tooLargeWarning}\n\nSave to CRM?`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Yes, save', callback_data: `crm_save:${pendingId}` },
            { text: '❌ No, skip', callback_data: 'crm_skip' },
          ],
        ],
      },
    })

    return new Response('ok')
  } catch (err) {
    console.error('[telegram-media-listener] ERROR:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
