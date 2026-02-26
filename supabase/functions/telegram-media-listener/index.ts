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
      } catch { /* fallback to text link above */ }
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
              } catch {
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
              } catch {
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

      // ─── Higgsfield callbacks: type selection ───
      if (data === 'hf_type:image' || data === 'hf_type:video') {
        const genType = data.replace('hf_type:', '')
        await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cb.id, text: `${genType === 'video' ? '🎬 Video' : '🎨 Image'} selected` })

        const imageModels = [
          { id: 'higgsfield-ai/soul/standard', label: '🌟 Soul Standard' },
          { id: 'higgsfield-ai/soul/turbo', label: '⚡ Soul Turbo' },
          { id: 'flux', label: '📷 FLUX' },
        ]
        const videoModels = [
          { id: 'higgsfield-ai/dop/standard', label: '🎥 DOP Standard' },
          { id: 'higgsfield-ai/dop/turbo', label: '⚡ DOP Turbo' },
        ]
        const models = genType === 'video' ? videoModels : imageModels
        const rows = models.map(m => [{ text: m.label, callback_data: `hf_model:${genType}:${m.id}` }])
        rows.push([{ text: '❌ Cancel', callback_data: 'hf_cancel' }])

        if (chatId && messageId) {
          await tgPost(TG_TOKEN, 'editMessageText', {
            chat_id: chatId, message_id: messageId,
            text: `${genType === 'video' ? '🎬' : '🎨'} <b>${genType === 'video' ? 'Video' : 'Image'} Generation</b>\n\nSelect a model:`,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: rows },
          })
        }
        return new Response('ok')
      }

      // ─── Higgsfield callbacks: model selection → activate session ───
      if (data.startsWith('hf_model:')) {
        const parts = data.replace('hf_model:', '').split(':')
        const genType = parts[0] // 'image' or 'video'
        const modelId = parts.slice(1).join(':') // model ID may contain colons
        await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cb.id, text: `Model: ${modelId}` })

        // Clear sessions and create Higgsfield session with pre-selected type + model
        const ALL_SESSIONS_CB = ['xpost_session', 'invoice_session', 'smm_session', 'customer_session', 'calendar_session', 'calendly_session', 'meeting_session', 'custom_session', 'webdev_session', 'banana_session', 'higgsfield_session', 'email_session']
        if (chatId) {
          await supabase.from('webhook_events').delete().eq('source', 'telegram').in('event_type', ALL_SESSIONS_CB).filter('payload->>chat_id', 'eq', String(chatId))
          await supabase.from('webhook_events').insert({
            source: 'telegram',
            event_type: 'higgsfield_session',
            payload: { chat_id: chatId, history: [], created: Date.now(), gen_type: genType, model: modelId },
            processed: false,
          })
        }

        const isVideo = genType === 'video'
        const promptHint = isVideo
          ? '📎 <b>Send a photo</b> to animate into video, or type a motion prompt with a reference image.'
          : 'Type your image prompt. Include details like lighting, mood, composition.\n\n• <code>A futuristic storefront with neon signs at dusk 16:9 1080p</code>'

        if (chatId && messageId) {
          await tgPost(TG_TOKEN, 'editMessageText', {
            chat_id: chatId, message_id: messageId,
            text: `${isVideo ? '🎬' : '🎨'} <b>Higgsfield — ${isVideo ? 'Video' : 'Image'}</b>\n🔧 Model: <code>${modelId}</code>\n\n${promptHint}\n\n<i>Send /cancel to exit.</i>`,
            parse_mode: 'HTML',
          })
        }
        return new Response('ok')
      }

      // ─── Higgsfield callbacks: cancel ───
      if (data === 'hf_cancel') {
        await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Cancelled' })
        if (chatId) {
          await supabase.from('webhook_events').delete().eq('source', 'telegram').eq('event_type', 'higgsfield_session').filter('payload->>chat_id', 'eq', String(chatId))
        }
        if (chatId && messageId) {
          await tgPost(TG_TOKEN, 'editMessageText', { chat_id: chatId, message_id: messageId, text: '⏭ Higgsfield cancelled.' })
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

        if (replyAction === 'start') {
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: '🎛 <b>Command Center</b>\n\nTap a button below to get started:',
            parse_mode: 'HTML',
            reply_markup: PERSISTENT_KEYBOARD,
          })
          return new Response('ok')
        }

        const ALL_REPLY_SESSIONS = ['xpost_session', 'invoice_session', 'smm_session', 'customer_session', 'calendar_session', 'calendly_session', 'meeting_session', 'custom_session', 'webdev_session', 'banana_session', 'higgsfield_session', 'email_session']

        if (replyAction === 'custom') {
          await supabase.from('webhook_events').delete()
            .eq('source', 'telegram').in('event_type', ALL_REPLY_SESSIONS)
            .filter('payload->>chat_id', 'eq', String(chatId))
          await supabase.from('webhook_events').insert({
            source: 'telegram',
            event_type: 'custom_session',
            payload: { chat_id: chatId, history: [], created: Date.now() },
            processed: false,
          })
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: '📦 <b>Custom-U Terminal</b>\n\nManage upload portal links for your customers.\n\n• <code>Send Warren his upload link</code>\n• <code>Generate portal link for John</code>\n• <code>Revoke link for Jane</code>\n\n<i>Type your commands naturally or tap ❌ Cancel to exit.</i>',
            parse_mode: 'HTML',
            reply_markup: PERSISTENT_KEYBOARD,
          })
          return new Response('ok')
        }


        if (replyAction === 'invoice') {
          await supabase.from('webhook_events').delete()
            .eq('source', 'telegram').in('event_type', ALL_REPLY_SESSIONS)
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
            .eq('source', 'telegram').in('event_type', ALL_REPLY_SESSIONS)
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

        // Customer / Calendar / Calendly / Meeting via reply
        if (replyAction === 'customer' || replyAction === 'calendar' || replyAction === 'calendly' || replyAction === 'meeting' || replyAction === 'custom') {
          const labels: Record<string, string> = { customer: '👤 Customer', calendar: '📅 Calendar', calendly: '🗓 Calendly', meeting: '🤝 Meeting', custom: '📦 Custom-U' }
          const hints: Record<string, string> = {
            customer: 'Create, update, or search customers naturally.\n\n• <code>Create customer John Doe, email john@test.com</code>\n• <code>Update Warren status to active</code>',
            calendar: 'Add events, check schedule, manage your calendar.\n\n• <code>Add meeting tomorrow at 3pm</code>\n• <code>Show my schedule for next week</code>',
            calendly: 'Set your availability schedule.\n\n• <code>I\'m available Mon-Wed 2PM-5PM this week</code>\n• <code>Block off Friday</code>',
            meeting: 'Book meetings with customers.\n\n• <code>Setup a meeting with Warren at 5PM next Tuesday</code>\n• <code>Book a 30-min call with John tomorrow</code>',
            custom: 'Manage upload portal links for customers.\n\n• <code>Send Warren his upload link</code>\n• <code>Generate a portal link for John</code>\n• <code>Revoke upload link for Jane</code>\n• <code>Show who has active upload links</code>',
          }
          await supabase.from('webhook_events').delete()
            .eq('source', 'telegram').in('event_type', ALL_REPLY_SESSIONS)
            .filter('payload->>chat_id', 'eq', String(chatId))
          await supabase.from('webhook_events').insert({
            source: 'telegram',
            event_type: `${replyAction}_session`,
            payload: { chat_id: chatId, history: [], created: Date.now() },
            processed: false,
          })
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: `${labels[replyAction]} <b>Terminal</b>\n\n${hints[replyAction]}\n\n<i>Type your commands naturally or tap ❌ Cancel to exit.</i>`,
            parse_mode: 'HTML',
            reply_markup: PERSISTENT_KEYBOARD,
          })
          return new Response('ok')
        }

        // More / Back / Web Dev / Banana via reply
        if (replyAction === 'more') {
          await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '🎛 <b>Page 2 — Creative Tools</b>\n\nTap a button below:', parse_mode: 'HTML', reply_markup: PAGE_2_KEYBOARD })
          return new Response('ok')
        }
        if (replyAction === 'back') {
          await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '🎛 <b>Command Center</b>\n\nTap a button below to get started:', parse_mode: 'HTML', reply_markup: PERSISTENT_KEYBOARD })
          return new Response('ok')
        }
        if (replyAction === 'webdev') {
          await supabase.from('webhook_events').delete().eq('source', 'telegram').in('event_type', ALL_REPLY_SESSIONS).filter('payload->>chat_id', 'eq', String(chatId))
          await supabase.from('webhook_events').insert({ source: 'telegram', event_type: 'webdev_session', payload: { chat_id: chatId, history: [], created: Date.now() }, processed: false })
          await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '🌐 <b>Web Dev Terminal</b>\n\nDescribe what you want to build:\n\n• <code>Build a modern landing page for a coffee shop</code>\n• <code>Create a minimalist portfolio</code>\n\n<i>Type your prompt or tap ❌ Cancel to exit.</i>', parse_mode: 'HTML', reply_markup: PAGE_2_KEYBOARD })
          return new Response('ok')
        }
        if (replyAction === 'banana') {
          await supabase.from('webhook_events').delete().eq('source', 'telegram').in('event_type', ALL_REPLY_SESSIONS).filter('payload->>chat_id', 'eq', String(chatId))
          await supabase.from('webhook_events').insert({ source: 'telegram', event_type: 'banana_session', payload: { chat_id: chatId, history: [], created: Date.now() }, processed: false })
          await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '🍌 <b>Banana Image Generator</b>\n\nDescribe what image you want:\n\n• <code>A sunset over neon mountains</code>\n• <code>Logo for a tech startup</code>\n• 📎 <b>Send a photo</b> to use as reference for editing\n\n<i>Type your prompt, attach an image, or tap ❌ Cancel to exit.</i>', parse_mode: 'HTML', reply_markup: PAGE_2_KEYBOARD })
          return new Response('ok')
        }
        if (replyAction === 'higgsfield') {
          await supabase.from('webhook_events').delete().eq('source', 'telegram').in('event_type', ALL_REPLY_SESSIONS).filter('payload->>chat_id', 'eq', String(chatId))
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: '🎬 <b>Higgsfield AI Terminal</b>\n\nWhat would you like to generate?',
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [
              [{ text: '🎨 Image', callback_data: 'hf_type:image' }, { text: '🎬 Video', callback_data: 'hf_type:video' }],
              [{ text: '❌ Cancel', callback_data: 'hf_cancel' }],
            ]},
          })
          return new Response('ok')
        }
        if (replyAction === 'email') {
          await supabase.from('webhook_events').delete().eq('source', 'telegram').in('event_type', ALL_REPLY_SESSIONS).filter('payload->>chat_id', 'eq', String(chatId))
          await supabase.from('webhook_events').insert({ source: 'telegram', event_type: 'email_session', payload: { chat_id: chatId, history: [], created: Date.now() }, processed: false })
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: '📧 <b>AI Email Composer</b>\n\nTell me who to email and what to say.\n\n<i>Type your email command naturally or tap ❌ Cancel to exit.</i>',
            parse_mode: 'HTML',
            reply_markup: PERSISTENT_KEYBOARD,
          })
          return new Response('ok')
        }

          const { data: sessions } = await supabase.from('webhook_events').select('id')
            .eq('source', 'telegram')
            .in('event_type', ALL_REPLY_SESSIONS)
            .filter('payload->>chat_id', 'eq', String(chatId))
          if (sessions && sessions.length > 0) {
            await supabase.from('webhook_events').delete()
              .eq('source', 'telegram')
              .in('event_type', ['xpost_session', 'invoice_session', 'smm_session', 'customer_session', 'calendar_session', 'calendly_session', 'meeting_session', 'custom_session', 'email_session'])
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

        // Check for active module sessions (customer, calendar, calendly, meeting) — BEFORE SMM
        for (const mod of ['customer', 'calendar', 'calendly', 'meeting'] as const) {
          const { data: modSess } = await supabase.from('webhook_events')
            .select('id, payload')
            .eq('source', 'telegram').eq('event_type', `${mod}_session`)
            .filter('payload->>chat_id', 'eq', String(chatId))
            .limit(1)
          if (modSess && modSess.length > 0) {
            const sp = modSess[0].payload as { chat_id: number; history: any[]; created: number }
            await processModuleCommand(chatId, replyAsText, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase, mod)
            return new Response('ok')
          }
        }

        // Check for active Web Dev session
        const { data: wdSess } = await supabase.from('webhook_events')
          .select('id, payload')
          .eq('source', 'telegram').eq('event_type', 'webdev_session')
          .filter('payload->>chat_id', 'eq', String(chatId))
          .limit(1)
        if (wdSess && wdSess.length > 0) {
          const sp = wdSess[0].payload as { chat_id: number; history: any[]; created: number }
          await processWebDevCommand(chatId, replyAsText, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
          return new Response('ok')
        }

        // Check for active Banana session
        const { data: bnSess } = await supabase.from('webhook_events')
          .select('id, payload')
          .eq('source', 'telegram').eq('event_type', 'banana_session')
          .filter('payload->>chat_id', 'eq', String(chatId))
          .limit(1)
        if (bnSess && bnSess.length > 0) {
          const sp = bnSess[0].payload as { chat_id: number; history: any[]; created: number }
          await processBananaCommand(chatId, replyAsText, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
          return new Response('ok')
        }

        // Check for active Higgsfield session
        const { data: hfSess } = await supabase.from('webhook_events')
          .select('id, payload')
          .eq('source', 'telegram').eq('event_type', 'higgsfield_session')
          .filter('payload->>chat_id', 'eq', String(chatId))
          .limit(1)
        if (hfSess && hfSess.length > 0) {
          const sp = hfSess[0].payload as { chat_id: number; history: any[]; created: number; gen_type?: string; model?: string }
          await processHiggsFieldCommand(chatId, replyAsText, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase, undefined, sp.gen_type, sp.model)
          return new Response('ok')
        }

        // Check for active Email session
        const { data: emailSess } = await supabase.from('webhook_events')
          .select('id, payload')
          .eq('source', 'telegram').eq('event_type', 'email_session')
          .filter('payload->>chat_id', 'eq', String(chatId))
          .limit(1)
        if (emailSess && emailSess.length > 0) {
          const sp = emailSess[0].payload as { chat_id: number; history: any[]; created: number }
          await processEmailCommand(chatId, replyAsText, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
          return new Response('ok')
        }

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

        // No session active — auto-detect intent and route to correct module
        console.log('[reply-router] No active session, auto-detecting intent from:', replyAsText.slice(0, 80))

        const intentText = replyAsText.toLowerCase()
        let autoModule: 'customer' | 'invoice' | 'calendar' | 'meeting' | 'email' | null = null

        if (/\b(customer|lead|prospect|client|contact|create\s+a?\s*customer|add\s+customer|new\s+customer)\b/i.test(intentText)) {
          autoModule = 'customer'
        } else if (/\b(invoice|bill|payment|charge|receipt)\b/i.test(intentText)) {
          autoModule = 'invoice'
        } else if (/\b(meeting|book|schedule\s+a?\s*call|zoom|video\s+call)\b/i.test(intentText)) {
          autoModule = 'meeting'
        } else if (/\b(email|send\s+.*\s+(an?\s+)?email|mail\s+to|write\s+.*\s+email|draft\s+email)\b/i.test(intentText)) {
          autoModule = 'email'
        } else if (/\b(calendar|event|appointment|reminder|schedule)\b/i.test(intentText)) {
          autoModule = 'calendar'
        }

        if (autoModule) {
          console.log('[reply-router] Auto-detected module:', autoModule)
          // Create session and process in one go
          await supabase.from('webhook_events').delete().eq('source', 'telegram').in('event_type', ALL_REPLY_SESSIONS).filter('payload->>chat_id', 'eq', String(chatId))
          await supabase.from('webhook_events').insert({ source: 'telegram', event_type: `${autoModule}_session`, payload: { chat_id: chatId, history: [], created: Date.now() }, processed: false })

          if (autoModule === 'invoice') {
            await processInvoiceCommand(chatId, replyAsText, [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
          } else if (autoModule === 'email') {
            await processEmailCommand(chatId, replyAsText, [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
          } else {
            await processModuleCommand(chatId, replyAsText, [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase, autoModule)
          }
          return new Response('ok')
        }

        // Truly unrecognized — silently ignore
        console.log('[reply-router] No intent detected, ignoring')
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

    // ─── Ignore messages containing Cortex/Zyla keywords (handled by Cortex bot) ───
    if (/\b(cortex|zyla)\b/i.test(text)) {
      console.log('[telegram-media-listener] ignoring cortex/zyla message:', text.slice(0, 80))
      return new Response('ok')
    }

    // Ensure bot commands are registered
    await ensureBotCommands(TG_TOKEN)

    // ─── Persistent keyboard button presses — check BEFORE sessions ───
    const persistentAction = resolvePersistentAction(text)
    const isPersistentButton = persistentAction !== null

    // ─── Start / Menu action — show the keyboard ───
    if (persistentAction === 'start') {
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '🎛 <b>Command Center</b>\n\nTap a button below to get started:',
        parse_mode: 'HTML',
        reply_markup: PERSISTENT_KEYBOARD,
      })
      return new Response('ok')
    }

    const ALL_SESSIONS = ['xpost_session', 'invoice_session', 'smm_session', 'customer_session', 'calendar_session', 'calendly_session', 'meeting_session', 'custom_session', 'webdev_session', 'banana_session', 'higgsfield_session', 'email_session']

    // ─── Custom-U action ───
    if (persistentAction === 'custom') {
      const sessionType = 'custom_session'
      await supabase.from('webhook_events').delete().eq('source', 'telegram').in('event_type', ALL_SESSIONS).filter('payload->>chat_id', 'eq', String(chatId))
      await supabase.from('webhook_events').insert({ source: 'telegram', event_type: sessionType, payload: { chat_id: chatId, history: [], created: Date.now() }, processed: false })
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '📦 <b>Custom-U Terminal</b>\n\nManage upload portal links for your customers.\n\n• <code>Send Warren his upload link</code>\n• <code>Generate portal link for John</code>\n• <code>Revoke link for Jane</code>\n• <code>Who has active upload links?</code>\n\n<i>Type your commands naturally or tap ❌ Cancel to exit.</i>',
        parse_mode: 'HTML',
        reply_markup: PERSISTENT_KEYBOARD,
      })
      return new Response('ok')
    }


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

    // ─── More action — show Page 2 keyboard ───
    if (persistentAction === 'more') {
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '🎛 <b>Page 2 — Creative Tools</b>\n\nTap a button below:',
        parse_mode: 'HTML',
        reply_markup: PAGE_2_KEYBOARD,
      })
      return new Response('ok')
    }

    // ─── Back action — return to main keyboard ───
    if (persistentAction === 'back') {
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '🎛 <b>Command Center</b>\n\nTap a button below to get started:',
        parse_mode: 'HTML',
        reply_markup: PERSISTENT_KEYBOARD,
      })
      return new Response('ok')
    }

    // ─── Web Dev action ───
    if (persistentAction === 'webdev') {
      await supabase.from('webhook_events').delete().eq('source', 'telegram').in('event_type', ALL_SESSIONS).filter('payload->>chat_id', 'eq', String(chatId))
      await supabase.from('webhook_events').insert({ source: 'telegram', event_type: 'webdev_session', payload: { chat_id: chatId, history: [], created: Date.now() }, processed: false })
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '🌐 <b>Web Dev Terminal</b>\n\nDescribe what you want to build and I\'ll generate it using V0.\n\n• <code>Build a modern landing page for a coffee shop</code>\n• <code>Create a minimalist portfolio with dark mode</code>\n• <code>Design a SaaS pricing page with 3 tiers</code>\n\n<i>Type your prompt or tap ❌ Cancel to exit.</i>',
        parse_mode: 'HTML',
        reply_markup: PAGE_2_KEYBOARD,
      })
      return new Response('ok')
    }

    // ─── Banana (Nano Banana) action ───
    if (persistentAction === 'banana') {
      await supabase.from('webhook_events').delete().eq('source', 'telegram').in('event_type', ALL_SESSIONS).filter('payload->>chat_id', 'eq', String(chatId))
      await supabase.from('webhook_events').insert({ source: 'telegram', event_type: 'banana_session', payload: { chat_id: chatId, history: [], created: Date.now() }, processed: false })
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '🍌 <b>Banana Image Generator</b>\n\nDescribe what image you want to create.\n\n• <code>A sunset over neon mountains</code>\n• <code>Logo for a tech startup called NovaByte</code>\n• 📎 <b>Send a photo</b> to use as reference for editing\n\n<i>Type your prompt, attach an image, or tap ❌ Cancel to exit.</i>',
        parse_mode: 'HTML',
        reply_markup: PAGE_2_KEYBOARD,
      })
      return new Response('ok')
    }

    // ─── Higgsfield action ───
    if (persistentAction === 'higgsfield') {
      await supabase.from('webhook_events').delete().eq('source', 'telegram').in('event_type', ALL_SESSIONS).filter('payload->>chat_id', 'eq', String(chatId))
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '🎬 <b>Higgsfield AI Terminal</b>\n\nWhat would you like to generate?',
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [
          [{ text: '🎨 Image', callback_data: 'hf_type:image' }, { text: '🎬 Video', callback_data: 'hf_type:video' }],
          [{ text: '❌ Cancel', callback_data: 'hf_cancel' }],
        ]},
      })
      return new Response('ok')
    }

    // ─── Email action (AI Email Composer) ───
    if (persistentAction === 'email') {
      await supabase.from('webhook_events').delete().eq('source', 'telegram').in('event_type', ALL_SESSIONS).filter('payload->>chat_id', 'eq', String(chatId))
      await supabase.from('webhook_events').insert({ source: 'telegram', event_type: 'email_session', payload: { chat_id: chatId, history: [], created: Date.now() }, processed: false })
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '📧 <b>AI Email Composer</b>\n\n'
          + 'Tell me who to email and what to say — I\'ll craft and send it.\n\n'
          + '• <code>Send Bryan an email telling him how awesome he is</code>\n'
          + '• <code>Email Warren about the project deadline next week</code>\n'
          + '• <code>Draft a follow-up to Michael about the invoice</code>\n\n'
          + '<i>Type your email command naturally or tap ❌ Cancel to exit.</i>',
        parse_mode: 'HTML',
        reply_markup: PERSISTENT_KEYBOARD,
      })
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

    // ─── In GROUP chats, ignore free text that isn't a button press, /command, or reply to bot ───
    // This prevents the bot from reacting to other bots' messages or casual conversation
    const isBotReply = message.reply_to_message?.from?.is_bot === true
    if (!isPrivate && !isPersistentButton && !text.startsWith('/') && !isBotReply) {
      // Check if there's an active session for this chat — if so, allow the message through
      const ALL_CHECK_SESSIONS = ['invoice_session', 'smm_session', 'customer_session', 'calendar_session', 'calendly_session', 'meeting_session', 'custom_session', 'webdev_session', 'banana_session', 'xpost_session', 'higgsfield_session', 'email_session']
      const { data: activeSessions } = await supabase.from('webhook_events')
        .select('id')
        .eq('source', 'telegram')
        .in('event_type', ALL_CHECK_SESSIONS)
        .filter('payload->>chat_id', 'eq', String(chatId))
        .limit(1)

      if (!activeSessions || activeSessions.length === 0) {
        // No active session — check for media, otherwise ignore
        const mediaInMsg = extractMedia(message)
        if (!mediaInMsg) {
          console.log('[telegram-media-listener] group free-text ignored (no button/command/reply/session):', text.slice(0, 80))
          return new Response('ok')
        }
      } else {
        console.log('[telegram-media-listener] group free-text allowed — active session found for chat:', chatId)
      }
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

    // ─── /higgsfield command — prompt-driven Higgsfield generation ───
    if (text.toLowerCase().startsWith('/higgsfield')) {
      const hfPrompt = text.replace(/^\/higgsfield\s*/i, '').trim()

      if (!hfPrompt) {
        await supabase.from('webhook_events').delete()
          .eq('source', 'telegram').in('event_type', ALL_SESSIONS)
          .filter('payload->>chat_id', 'eq', String(chatId))
        await tgPost(TG_TOKEN, 'sendMessage', {
          chat_id: chatId,
          text: '🎬 <b>Higgsfield AI Terminal</b>\n\nWhat would you like to generate?',
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [
            [{ text: '🎨 Image', callback_data: 'hf_type:image' }, { text: '🎬 Video', callback_data: 'hf_type:video' }],
            [{ text: '❌ Cancel', callback_data: 'hf_cancel' }],
          ]},
        })
        return new Response('ok')
      }

      // Inline prompt — execute immediately
      await processHiggsFieldCommand(chatId, hfPrompt, [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
      return new Response('ok')
    }

    // ─── /email command — AI-powered email composer ───
    if (text.toLowerCase().startsWith('/email')) {
      const emailPrompt = text.replace(/^\/email\s*/i, '').trim()

      if (!emailPrompt) {
        await supabase.from('webhook_events').delete()
          .eq('source', 'telegram').in('event_type', ALL_SESSIONS)
          .filter('payload->>chat_id', 'eq', String(chatId))
        await supabase.from('webhook_events').insert({
          source: 'telegram',
          event_type: 'email_session',
          payload: { chat_id: chatId, history: [], created: Date.now() },
          processed: false,
        })
        await tgPost(TG_TOKEN, 'sendMessage', {
          chat_id: chatId,
          text: '📧 <b>AI Email Composer active.</b>\n\n'
            + 'Tell me who to email and what to say:\n'
            + '• <code>Send Bryan a thank you email for the project</code>\n'
            + '• <code>Email Michael about the deadline next Friday</code>\n'
            + '• <code>Write Warren a follow-up about the invoice</code>\n\n'
            + 'Send /cancel to exit email mode.',
          parse_mode: 'HTML',
        })
        return new Response('ok')
      }

      // Inline prompt — execute immediately
      await processEmailCommand(chatId, emailPrompt, [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
      return new Response('ok')
    }

    // ─── Check for active Email session ───
    if (text && !text.startsWith('/') && !isPersistentButton) {
      const { data: emailSessions } = await supabase.from('webhook_events')
        .select('id, payload')
        .eq('source', 'telegram').eq('event_type', 'email_session')
        .filter('payload->>chat_id', 'eq', String(chatId))
        .order('created_at', { ascending: false })
        .limit(1)

      if (emailSessions && emailSessions.length > 0) {
        const session = emailSessions[0]
        const sp = session.payload as { chat_id: number; history: any[]; created: number }
        console.log('[email-tg] session active, processing:', text.slice(0, 100))
        await processEmailCommand(chatId, text, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
        return new Response('ok')
      }
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

    // ─── Check for active Web Dev session ───
    if (text && !text.startsWith('/') && !isPersistentButton) {
      const { data: wdSessions } = await supabase.from('webhook_events')
        .select('id, payload')
        .eq('source', 'telegram').eq('event_type', 'webdev_session')
        .filter('payload->>chat_id', 'eq', String(chatId))
        .order('created_at', { ascending: false })
        .limit(1)

      if (wdSessions && wdSessions.length > 0) {
        const session = wdSessions[0]
        const sp = session.payload as { chat_id: number; history: any[]; created: number }
        console.log('[webdev-tg] session active, processing:', text.slice(0, 100))
        await processWebDevCommand(chatId, text, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
        return new Response('ok')
      }
    }

    // ─── Check for active Banana session ───
    if (text && !text.startsWith('/') && !isPersistentButton) {
      const { data: bnSessions } = await supabase.from('webhook_events')
        .select('id, payload')
        .eq('source', 'telegram').eq('event_type', 'banana_session')
        .filter('payload->>chat_id', 'eq', String(chatId))
        .order('created_at', { ascending: false })
        .limit(1)

      if (bnSessions && bnSessions.length > 0) {
        const session = bnSessions[0]
        const sp = session.payload as { chat_id: number; history: any[]; created: number }
        console.log('[banana-tg] session active, processing:', text.slice(0, 100))
        await processBananaCommand(chatId, text, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase)
        return new Response('ok')
      }
    }

    // ─── Check for active Higgsfield session ───
    if (text && !text.startsWith('/') && !isPersistentButton) {
      const { data: hfSessions } = await supabase.from('webhook_events')
        .select('id, payload')
        .eq('source', 'telegram').eq('event_type', 'higgsfield_session')
        .filter('payload->>chat_id', 'eq', String(chatId))
        .order('created_at', { ascending: false })
        .limit(1)

      if (hfSessions && hfSessions.length > 0) {
        const session = hfSessions[0]
        const sp = session.payload as { chat_id: number; history: any[]; created: number; gen_type?: string; model?: string }
        console.log('[higgsfield-tg] session active, processing:', text.slice(0, 100))
        await processHiggsFieldCommand(chatId, text, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase, undefined, sp.gen_type, sp.model)
        return new Response('ok')
      }
    }
    if (text && !text.startsWith('/') && !isPersistentButton) {
      for (const mod of ['customer', 'calendar', 'calendly', 'meeting', 'custom'] as const) {
        const { data: modSessions } = await supabase.from('webhook_events')
          .select('id, payload')
          .eq('source', 'telegram').eq('event_type', `${mod}_session`)
          .filter('payload->>chat_id', 'eq', String(chatId))
          .order('created_at', { ascending: false })
          .limit(1)

        if (modSessions && modSessions.length > 0) {
          const session = modSessions[0]
          const sp = session.payload as { chat_id: number; history: any[]; created: number }
          console.log(`[${mod}-tg] session active, processing:`, text.slice(0, 100))
          await processModuleCommand(chatId, text, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase, mod)
          return new Response('ok')
        }
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

    // ─── Check if media was sent during an active banana session (image reference) ───
    const media = extractMedia(message)
    if (media && media.type === 'image') {
      const { data: bnMediaSess } = await supabase.from('webhook_events')
        .select('id, payload')
        .eq('source', 'telegram').eq('event_type', 'banana_session')
        .filter('payload->>chat_id', 'eq', String(chatId))
        .limit(1)

      if (bnMediaSess && bnMediaSess.length > 0) {
        console.log('[banana-tg] image reference received, downloading file_id:', media.fileId)
        const caption = (message.caption as string) || 'Edit this image'
        try {
          // Download from Telegram
          const fileInfoRes = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getFile?file_id=${media.fileId}`)
          const fileInfo = await fileInfoRes.json()
          const filePath = fileInfo?.result?.file_path
          if (!filePath) throw new Error('Could not get file path from Telegram')

          const fileRes = await fetch(`https://api.telegram.org/file/bot${TG_TOKEN}/${filePath}`)
          const fileBytes = new Uint8Array(await fileRes.arrayBuffer())
          const ext = filePath.split('.').pop() || 'jpg'
          const storagePath = `nano-banana/ref_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`

          const { error: upErr } = await supabase.storage
            .from('content-uploads')
            .upload(storagePath, fileBytes, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: true })

          if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)

          const { data: pubUrl } = supabase.storage.from('content-uploads').getPublicUrl(storagePath)
          const imageUrl = pubUrl.publicUrl

          console.log('[banana-tg] reference image uploaded:', imageUrl)
          const sp = bnMediaSess[0].payload as { chat_id: number; history: any[]; created: number }
          await processBananaCommand(chatId, caption, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase, imageUrl)
          return new Response('ok')
        } catch (e: any) {
          console.error('[banana-tg] reference image error:', e)
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: `❌ <b>Could not process reference image:</b> <code>${(e.message || String(e)).slice(0, 200)}</code>\n\nTry sending the image again, or type a text prompt instead.`,
            parse_mode: 'HTML',
          })
          return new Response('ok')
        }
      }
    }

    // ─── Check if media was sent during an active Higgsfield session (image-to-video) ───
    if (media && media.type === 'image') {
      const { data: hfMediaSess } = await supabase.from('webhook_events')
        .select('id, payload')
        .eq('source', 'telegram').eq('event_type', 'higgsfield_session')
        .filter('payload->>chat_id', 'eq', String(chatId))
        .limit(1)

      if (hfMediaSess && hfMediaSess.length > 0) {
        console.log('[higgsfield-tg] image-to-video reference received, downloading file_id:', media.fileId)
        const caption = (message.caption as string) || 'Animate this image with cinematic motion'
        try {
          const fileInfoRes = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getFile?file_id=${media.fileId}`)
          const fileInfo = await fileInfoRes.json()
          const filePath = fileInfo?.result?.file_path
          if (!filePath) throw new Error('Could not get file path from Telegram')

          const fileRes = await fetch(`https://api.telegram.org/file/bot${TG_TOKEN}/${filePath}`)
          const fileBytes = new Uint8Array(await fileRes.arrayBuffer())
          const ext = filePath.split('.').pop() || 'jpg'
          const storagePath = `higgsfield/ref_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`

          const { error: upErr } = await supabase.storage
            .from('content-uploads')
            .upload(storagePath, fileBytes, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: true })

          if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)

          const { data: pubUrl } = supabase.storage.from('content-uploads').getPublicUrl(storagePath)
          const imageUrl = pubUrl.publicUrl

          console.log('[higgsfield-tg] reference image uploaded for video:', imageUrl)
          const sp = hfMediaSess[0].payload as { chat_id: number; history: any[]; created: number; gen_type?: string; model?: string }
          await processHiggsFieldCommand(chatId, caption, sp.history || [], TG_TOKEN, SUPABASE_URL!, BOT_SECRET!, supabase, imageUrl, sp.gen_type, sp.model)
          return new Response('ok')
        } catch (e: any) {
          console.error('[higgsfield-tg] reference image error:', e)
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: `❌ <b>Could not process image for video:</b> <code>${(e.message || String(e)).slice(0, 200)}</code>\n\nTry sending the image again.`,
            parse_mode: 'HTML',
          })
          return new Response('ok')
        }
      }
    }

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
