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
    [{ text: '📧 Email' }, { text: '📦 Custom' }],
    [{ text: '➡️ More' }, { text: '❌ Cancel' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
}

const PAGE_2_KEYBOARD = {
  keyboard: [
    [{ text: '🌐 Web Dev' }, { text: '🍌 Banana' }],
    [{ text: '🎬 Higgsfield' }, { text: '❌ Cancel' }],
    [{ text: '⬅️ Back' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
}

// Register bot commands + set persistent keyboard on first call
let commandsRegistered = false
async function ensureBotCommands(token: string) {
  if (commandsRegistered) return
  commandsRegistered = true

  const allCommands = [
    { command: 'menu', description: '📋 Open Command Center' },
    { command: 'invoice', description: '💰 Invoice Terminal' },
    { command: 'smm', description: '📱 SMM Terminal' },
    { command: 'customer', description: '👤 Customer Terminal' },
    { command: 'calendar', description: '📅 Calendar Terminal' },
    { command: 'calendly', description: '🗓 Availability Setup' },
    { command: 'meeting', description: '🤝 Meeting Terminal' },
    { command: 'email', description: '📧 AI Email Composer' },
    { command: 'custom', description: '📦 Custom-U Portal Links' },
    { command: 'webdev', description: '🌐 Web Dev Terminal' },
    { command: 'banana', description: '🍌 Nano Banana Image Gen' },
    { command: 'higgsfield', description: '🎬 Higgsfield AI Generate' },
    { command: 'xpost', description: '📡 Quick post to social media' },
    { command: 'higs', description: '🎬 Higgsfield model list' },
    { command: 'cancel', description: '❌ Cancel active session' },
  ]

  // Register commands globally (default scope — all private chats)
  await fetch(`${TG_API}${token}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands: allCommands }),
  })

  // Register commands for the specific group chat so autocomplete works there too
  for (const groupId of ALLOWED_GROUP_IDS) {
    await fetch(`${TG_API}${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: allCommands,
        scope: { type: 'chat', chat_id: groupId },
      }),
    })
  }

  console.log('[ensureBotCommands] registered', allCommands.length, 'commands globally + per-group')
}

async function tgPost(token: string, method: string, body: Record<string, unknown>) {
  // Always attach the persistent keyboard to sendMessage calls unless a custom reply_markup is set
  if (method === 'sendMessage' && !body.reply_markup) {
    body.reply_markup = PERSISTENT_KEYBOARD
  }
  const res = await fetch(`${TG_API}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log(`[tg:${method}]`, res.status, text.slice(0, 200))

  return res
}

function resolvePersistentAction(input: string): 'invoice' | 'smm' | 'customer' | 'calendar' | 'calendly' | 'meeting' | 'custom' | 'start' | 'cancel' | 'more' | 'back' | 'webdev' | 'banana' | 'higgsfield' | 'email' | null {
  // Strip leading emoji, @botname suffix, and normalize
  const normalized = input.replace(/^[^a-zA-Z0-9/]+/, '').replace(/@\S+/, '').trim().toLowerCase()
  if (normalized === '/start' || normalized === '/menu' || normalized === 'menu' || normalized === 'start') return 'start'
  if (normalized === '/custom' || normalized === 'custom' || normalized === 'custom-u') return 'custom'
  if (normalized === '/invoice' || normalized === 'invoice') return 'invoice'
  if (normalized === '/smm' || normalized === 'smm') return 'smm'
  if (normalized === '/customer' || normalized === 'customer') return 'customer'
  if (normalized === '/calendar' || normalized === 'calendar') return 'calendar'
  if (normalized === '/calendly' || normalized === 'calendly') return 'calendly'
  if (normalized === '/meeting' || normalized === 'meeting') return 'meeting'
  if (normalized === '/cancel' || normalized === 'cancel') return 'cancel'
  if (normalized === 'more' || normalized === '/more') return 'more'
  if (normalized === 'back' || normalized === '/back') return 'back'
  if (normalized === 'web dev' || normalized === 'webdev' || normalized === '/webdev') return 'webdev'
  if (normalized === 'banana' || normalized === '/banana') return 'banana'
  if (normalized === 'higgsfield' || normalized === '/higgsfield') return 'higgsfield'
  if (normalized === 'email' || normalized === '/email') return 'email'
  return null
}

// ─── Email Terminal via Telegram (AI-powered email composer) ───
async function processEmailCommand(
  chatId: number,
  prompt: string,
  history: { role: string; text: string }[],
  tgToken: string,
  supabaseUrl: string,
  botSecret: string,
  supabase: any,
) {
  await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: '🧠 Composing email...', parse_mode: 'HTML' })

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/email-command`, {
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
            if (action.data.to) parts.push(`📨 ${action.data.to}`)
            if (action.data.subject) parts.push(`📋 "${action.data.subject}"`)
            if (action.data.email_sent) parts.push('📧 sent')
            if (parts.length) lines.push(`  → ${parts.join(' · ')}`)
            if (action.data.summary) lines.push(`\n💡 ${action.data.summary}`)
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
      .eq('source', 'telegram').eq('event_type', 'email_session')
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
    console.error('[email-tg] error:', e)
    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ <b>Email command failed:</b> <code>${(e.message || String(e)).slice(0, 300)}</code>`,
      parse_mode: 'HTML',
    })
  }
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
  module: 'customer' | 'calendar' | 'meeting' | 'calendly' | 'custom',
) {
  const moduleLabels: Record<string, string> = {
    customer: '👤 Customer',
    calendar: '📅 Calendar',
    meeting: '🤝 Meeting',
    calendly: '🗓 Calendly',
    custom: '📦 Custom-U',
  }

  await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: `⏳ Processing ${moduleLabels[module]} command...`, parse_mode: 'HTML' })

  // Map modules to their edge function endpoints
  const moduleEndpoints: Record<string, { fn: string; bodyExtra?: Record<string, unknown> }> = {
    customer: { fn: 'customer-scheduler' },
    calendar: { fn: 'clawd-bot/calendar-command' },
    meeting: { fn: 'clawd-bot/meeting-command' },
    calendly: { fn: 'clawd-bot/availability-command' },
    custom: { fn: 'custom-u-scheduler' },
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

// ─── Web Dev Terminal via Telegram (V0 Designer) ───
async function processWebDevCommand(
  chatId: number,
  prompt: string,
  history: { role: string; text: string }[],
  tgToken: string,
  supabaseUrl: string,
  botSecret: string,
  supabase: any,
) {
  await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: '🧠 Thinking a bit... generating website...', parse_mode: 'HTML' })

  try {
    // First try prompt-machine to optimize the prompt, then v0-designer
    const res = await fetch(`${supabaseUrl}/functions/v1/clawd-bot/generate-website`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': botSecret,
      },
      body: JSON.stringify({ prompt, chat_id: String(chatId) }),
    })
    const rawData = await res.json()
    const result = rawData?.data || rawData

    let replyText = ''

    if (result?.preview_url) {
      replyText = `✅ <b>Website Generated!</b>\n\n`
        + `🔗 <a href="${result.preview_url}">Preview</a>`
        + (result.edit_url ? ` · <a href="${result.edit_url}">Edit</a>` : '')
        + `\n📋 <i>${prompt.slice(0, 200)}</i>`
    } else if (result?.id) {
      replyText = `⏳ <b>Website generation started!</b>\n🆔 <code>${result.id}</code>\n\nYou'll get a notification when it's ready.`
    } else if (result?.error) {
      replyText = `❌ ${result.error}`
    } else {
      replyText = `<pre>${JSON.stringify(result, null, 2).slice(0, 3500)}</pre>`
    }

    // Update conversation history
    const { data: sessions } = await supabase.from('webhook_events')
      .select('id, payload')
      .eq('source', 'telegram').eq('event_type', 'webdev_session')
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
      await supabase.from('webhook_events').update({ payload: { ...payload, history: newHistory } }).eq('id', session.id)
    }

    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: replyText.slice(0, 4000),
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    })
  } catch (e: any) {
    console.error('[webdev-tg] error:', e)
    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ <b>Web Dev command failed:</b> <code>${(e.message || String(e)).slice(0, 300)}</code>`,
      parse_mode: 'HTML',
    })
  }
}

// ─── Banana (Nano Banana) Terminal via Telegram ───
async function processBananaCommand(
  chatId: number,
  prompt: string,
  history: { role: string; text: string }[],
  tgToken: string,
  supabaseUrl: string,
  botSecret: string,
  supabase: any,
  imageUrl?: string,
) {
  const editMode = !!imageUrl
  await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: editMode ? '🍌 Editing image with reference...' : '🍌 Generating image...', parse_mode: 'HTML' })

  try {
    const payload: Record<string, unknown> = { prompt, provider: 'nano-banana' }
    if (imageUrl) payload.image_url = imageUrl

    const res = await fetch(`${supabaseUrl}/functions/v1/clawd-bot/generate-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': botSecret,
      },
      body: JSON.stringify(payload),
    })
    const rawData = await res.json()
    const result = rawData?.data || rawData

    let replyText = ''

    if (result?.url) {
      replyText = `🍌 <b>Image Generated!</b>\n\n🔗 <a href="${result.url}">View Image</a>\n📋 <i>${prompt.slice(0, 200)}</i>`
      // Try to send the image directly
      try {
        await tgPost(tgToken, 'sendPhoto', { chat_id: chatId, photo: result.url, caption: `🍌 ${prompt.slice(0, 200)}` })
      } catch (_e) { /* fallback to text link above */ }
    } else if (result?.content_asset_id || result?.id) {
      replyText = `✅ <b>Image created!</b>\n🆔 <code>${result.content_asset_id || result.id}</code>\n\nCheck the Content Library for your image.`
    } else if (result?.error) {
      replyText = `❌ ${result.error}`
    } else {
      replyText = `<pre>${JSON.stringify(result, null, 2).slice(0, 3500)}</pre>`
    }

    // Update conversation history
    const { data: sessions } = await supabase.from('webhook_events')
      .select('id, payload')
      .eq('source', 'telegram').eq('event_type', 'banana_session')
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
      await supabase.from('webhook_events').update({ payload: { ...payload, history: newHistory } }).eq('id', session.id)
    }

    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: replyText.slice(0, 4000),
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    })
  } catch (e: any) {
    console.error('[banana-tg] error:', e)
    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ <b>Banana command failed:</b> <code>${(e.message || String(e)).slice(0, 300)}</code>`,
      parse_mode: 'HTML',
    })
  }
}

// ─── Higgsfield AI Terminal via Telegram ───
async function processHiggsFieldCommand(
  chatId: number,
  prompt: string,
  history: { role: string; text: string }[],
  tgToken: string,
  supabaseUrl: string,
  botSecret: string,
  supabase: any,
  imageUrl?: string,
  sessionGenType?: string,
  sessionModel?: string,
) {
  const isVideo = !!imageUrl || sessionGenType === 'video'

  // Video requires a source image — guard against missing image_url
  if (isVideo && !imageUrl) {
    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: '⚠️ <b>Video generation requires a source image.</b>\n\n📎 Send a photo first, then I\'ll animate it into a video with your prompt.\n\n<i>Attach an image and try again.</i>',
      parse_mode: 'HTML',
    })
    return
  }

  await tgPost(tgToken, 'sendMessage', {
    chat_id: chatId,
    text: isVideo ? '🎬 Generating video from image...' : '🎨 Generating image with Higgsfield...',
    parse_mode: 'HTML',
  })

  try {
    // Use session-selected model, or detect from prompt as fallback
    let model: string | undefined = sessionModel
    let cleanPrompt = prompt
    if (!model) {
      const modelMatch = prompt.match(/\b(?:model[:\s]*)?((higgsfield-ai\/\S+|flux|iris))\b/i)
      if (modelMatch) {
        model = modelMatch[1]
        cleanPrompt = prompt.replace(modelMatch[0], '').trim()
      }
    }

    // Detect aspect ratio
    let aspectRatio: string | undefined
    const arMatch = cleanPrompt.match(/\b(\d+:\d+)\b/)
    if (arMatch && ['1:1', '4:3', '16:9', '9:16'].includes(arMatch[1])) {
      aspectRatio = arMatch[1]
    }

    // Detect resolution
    let resolution: string | undefined
    const resMatch = cleanPrompt.match(/\b(480p|720p|1080p)\b/i)
    if (resMatch) {
      resolution = resMatch[1].toLowerCase()
    }

    // Detect duration for video
    let duration: number | undefined
    const durMatch = cleanPrompt.match(/\b(\d+)\s*(?:sec|seconds?|s)\b/i)
    if (durMatch) {
      duration = parseInt(durMatch[1])
      if (duration > 10) duration = 10
      if (duration < 1) duration = 5
    }

    // Build payload for higgsfield-api/generate
    const payload: Record<string, unknown> = {
      prompt: cleanPrompt || prompt,
      type: isVideo ? 'video' : 'image',
    }
    if (model) payload.model = model
    if (aspectRatio && !isVideo) payload.aspect_ratio = aspectRatio
    if (resolution && !isVideo) payload.resolution = resolution
    if (imageUrl) payload.image_url = imageUrl
    if (duration && isVideo) payload.duration = duration

    const res = await fetch(`${supabaseUrl}/functions/v1/higgsfield-api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': botSecret,
      },
      body: JSON.stringify(payload),
    })
    const rawData = await res.json()
    const result = rawData?.data || rawData

    if (!res.ok || !result?.request_id) {
      const errMsg = rawData?.error || result?.error || JSON.stringify(result).slice(0, 300)
      await tgPost(tgToken, 'sendMessage', {
        chat_id: chatId,
        text: `❌ <b>Higgsfield generation failed:</b>\n<code>${errMsg}</code>`,
        parse_mode: 'HTML',
      })
      return
    }

    const requestId = result.request_id
    const botTaskId = result.bot_task_id
    const genType = result.type || (isVideo ? 'video' : 'image')

    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: `⏳ <b>${genType === 'video' ? '🎬 Video' : '🎨 Image'} generation queued!</b>\n\n`
        + `🆔 <code>${requestId}</code>\n`
        + `📋 <i>${(cleanPrompt || prompt).slice(0, 200)}</i>\n\n`
        + `I'll auto-check the status and notify you when it's ready.`,
      parse_mode: 'HTML',
    })

    // Update conversation history
    const { data: sessions } = await supabase.from('webhook_events')
      .select('id, payload')
      .eq('source', 'telegram').eq('event_type', 'higgsfield_session')
      .filter('payload->>chat_id', 'eq', String(chatId))
      .limit(1)

    if (sessions && sessions.length > 0) {
      const session = sessions[0]
      const sp = session.payload as { chat_id: number; history: any[]; created: number }
      const newHistory = [
        ...(sp.history || []),
        { role: 'user', text: prompt },
        { role: 'assistant', text: `Queued ${genType} generation: ${requestId}` },
      ].slice(-10)
      await supabase.from('webhook_events').update({ payload: { ...sp, history: newHistory } }).eq('id', session.id)
    }

    // Auto-poll: schedule polls at 10s, 30s, 60s, 120s
    const pollDelays = [10000, 30000, 60000, 120000]
    for (const delay of pollDelays) {
      setTimeout(async () => {
        try {
          const pollRes = await fetch(`${supabaseUrl}/functions/v1/higgsfield-api/poll`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-bot-secret': botSecret,
            },
            body: JSON.stringify({ request_id: requestId, bot_task_id: botTaskId }),
          })
          const pollData = await pollRes.json()
          const pollResult = pollData?.data || pollData

          if (pollResult?.status === 'completed' && pollResult?.output_url) {
            // Send the result to Telegram
            const outputUrl = pollResult.output_url
            const outputType = pollResult.output_type || genType

            if (outputType === 'video') {
              try {
                await tgPost(tgToken, 'sendVideo', {
                  chat_id: chatId,
                  video: outputUrl,
                  caption: `🎬 Higgsfield video ready!\n📋 ${(cleanPrompt || prompt).slice(0, 150)}`,
                })
              } catch (_e) {
                await tgPost(tgToken, 'sendMessage', {
                  chat_id: chatId,
                  text: `🎬 <b>Video Ready!</b>\n\n🔗 <a href="${outputUrl}">Download Video</a>\n📋 <i>${(cleanPrompt || prompt).slice(0, 200)}</i>`,
                  parse_mode: 'HTML',
                  disable_web_page_preview: false,
                })
              }
            } else {
              try {
                await tgPost(tgToken, 'sendPhoto', {
                  chat_id: chatId,
                  photo: outputUrl,
                  caption: `🎨 Higgsfield image ready!\n📋 ${(cleanPrompt || prompt).slice(0, 150)}`,
                })
              } catch (_e) {
                await tgPost(tgToken, 'sendMessage', {
                  chat_id: chatId,
                  text: `🎨 <b>Image Ready!</b>\n\n🔗 <a href="${outputUrl}">View Image</a>\n📋 <i>${(cleanPrompt || prompt).slice(0, 200)}</i>`,
                  parse_mode: 'HTML',
                  disable_web_page_preview: false,
                })
              }
            }
          } else if (pollResult?.status === 'failed' || pollResult?.status === 'nsfw') {
            await tgPost(tgToken, 'sendMessage', {
              chat_id: chatId,
              text: `❌ <b>Higgsfield ${genType} ${pollResult.status}.</b>\n🆔 <code>${requestId}</code>${pollResult.status === 'nsfw' ? '\n\n⚠️ Content was flagged. Try a different prompt.' : ''}`,
              parse_mode: 'HTML',
            })
          }
          // If still in_progress or queued, the next poll will check
        } catch (e) {
          console.error(`[higgsfield-poll] error at ${delay}ms:`, e)
        }
      }, delay)
    }
  } catch (e: any) {
    console.error('[higgsfield-tg] error:', e)
    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ <b>Higgsfield command failed:</b> <code>${(e.message || String(e)).slice(0, 300)}</code>`,
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
    console.log('[telegram-media-listener] test body:', rawBody.slice(0, 100))
    return new Response('ok-test')
  } catch (err) {
    console.error('[telegram-media-listener] ERROR:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})

