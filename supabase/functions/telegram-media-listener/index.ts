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
    [{ text: '📦 Custom' }, { text: '➡️ More' }],
    [{ text: '❌ Cancel' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
}

const PAGE_2_KEYBOARD = {
  keyboard: [
    [{ text: '🌐 Web Dev' }, { text: '🍌 Banana' }],
    [{ text: '🎬 Higgsfield' }, { text: '🤖 AI Assistant' }],
    [{ text: '📧 Email' }, { text: '❌ Cancel' }],
    [{ text: '⬅️ Back' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
}

// Register bot commands — fire-and-forget, non-blocking, once per cold boot
let commandsRegistered = false
function ensureBotCommandsBg(token: string) {
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
    { command: 'assistant', description: '🤖 AI Assistant — multi-module orchestrator' },
    { command: 'webdev', description: '🌐 Web Dev Terminal' },
    { command: 'banana', description: '🍌 Nano Banana Image Gen' },
    { command: 'higgsfield', description: '🎬 Higgsfield AI Generate' },
    { command: 'xpost', description: '📡 Quick post to social media' },
    { command: 'higs', description: '🎬 Higgsfield model list' },
    { command: 'cancel', description: '❌ Cancel active session' },
  ]

  // Fire-and-forget: register commands in background, don't block the response
  const promises = [
    fetch(`${TG_API}${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: allCommands }),
    }).catch(() => {}),
    ...ALLOWED_GROUP_IDS.map(groupId =>
      fetch(`${TG_API}${token}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: allCommands,
          scope: { type: 'chat', chat_id: groupId },
        }),
      }).catch(() => {})
    ),
  ]
  // Don't await — let it happen in background
  Promise.all(promises).then(() => console.log('[cmds] registered')).catch(() => {})
}

async function tgPost(token: string, method: string, body: Record<string, unknown>) {
  if (method === 'sendMessage' && !body.reply_markup) {
    body.reply_markup = PERSISTENT_KEYBOARD
  }
  const res = await fetch(`${TG_API}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) console.log(`[tg:${method}] ERR ${res.status}`, text.slice(0, 150))
  return res
}

function resolvePersistentAction(input: string): 'invoice' | 'smm' | 'customer' | 'calendar' | 'calendly' | 'meeting' | 'custom' | 'start' | 'cancel' | 'more' | 'back' | 'webdev' | 'banana' | 'higgsfield' | 'email' | 'assistant' | null {
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
  if (normalized === 'ai assistant' || normalized === 'assistant' || normalized === '/assistant') return 'assistant'
  return null
}

// ─── AI Assistant via Telegram (multi-module orchestrator) ───
async function processAssistantCommand(
  chatId: number,
  prompt: string,
  history: { role: string; text: string }[],
  tgToken: string,
  supabaseUrl: string,
  botSecret: string,
  supabase: any,
) {
  await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: '🤖 <b>AI Assistant thinking...</b>\n\n<i>Decomposing your request into steps...</i>', parse_mode: 'HTML' })

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/ai-assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': botSecret,
      },
      body: JSON.stringify({ prompt, history, chat_id: String(chatId) }),
    })
    const result = await res.json()

    let replyText = ''

    if (result?.type === 'clarify') {
      replyText = `❓ ${result.message}`
    } else if (result?.type === 'executed') {
      const lines: string[] = []
      if (result.summary) lines.push(`📋 <b>${result.summary}</b>\n`)
      for (const step of result.steps || []) {
        const icon = step.success ? '✅' : '❌'
        lines.push(`${icon} <b>Step ${step.step}</b> [${step.module}]: ${step.description}`)
        if (!step.success && step.error) {
          lines.push(`   ⚠️ ${step.error}`)
        }
        if (step.success && step.data) {
          const parts: string[] = []
          if (step.data.url) parts.push(`🔗 ${step.data.url}`)
          if (step.data.preview_url) parts.push(`🔗 <a href="${step.data.preview_url}">Preview</a>`)
          if (step.data.edit_url) parts.push(`<a href="${step.data.edit_url}">Edit</a>`)
          if (step.data.invoice_number) parts.push(`#${step.data.invoice_number}`)
          if (step.data.amount) parts.push(`$${Number(step.data.amount).toFixed(2)}`)
          if (step.data.to) parts.push(`📨 ${step.data.to}`)
          if (step.data.subject) parts.push(`"${step.data.subject}"`)
          if (step.data.email_sent) parts.push('📧 sent')
          if (step.data.message && typeof step.data.message === 'string') parts.push(step.data.message.slice(0, 100))
          if (parts.length) lines.push(`   → ${parts.join(' · ')}`)
        }
      }
      replyText = lines.join('\n') || '✅ All steps completed.'
    } else if (result?.type === 'message') {
      replyText = result.message
    } else {
      replyText = `<pre>${JSON.stringify(result, null, 2).slice(0, 3500)}</pre>`
    }

    // Update conversation history
    const { data: sessions } = await supabase.from('webhook_events')
      .select('id, payload')
      .eq('source', 'telegram').eq('event_type', 'assistant_session')
      .filter('payload->>chat_id', 'eq', String(chatId))
      .limit(1)

    if (sessions && sessions.length > 0) {
      const session = sessions[0]
      const payload = session.payload as any
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
    console.error('[assistant-tg] error:', e)
    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ <b>AI Assistant failed:</b> <code>${(e.message || String(e)).slice(0, 300)}</code>`,
      parse_mode: 'HTML',
    })
  }
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
  // minimal logging — only log errors

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
    ensureBotCommandsBg(TG_TOKEN) // non-blocking

    const rawBody = await req.text()
    console.log('[tg] in:', rawBody.slice(0, 150))
    const update = JSON.parse(rawBody)

    // ─── CALLBACK QUERIES (inline button presses) ───
    if (update.callback_query) {
      const cbq = update.callback_query
      const cbData = cbq.data as string
      const cbChatId = cbq.message?.chat?.id

      // Answer the callback to remove loading spinner
      await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cbq.id })

      // ─── xpost flow callbacks ───
      if (cbData.startsWith('xpost_profile_') || cbData.startsWith('xpost_platform_') || cbData === 'xpost_cancel') {
        if (cbData === 'xpost_cancel') {
          await supabase.from('webhook_events').delete()
            .eq('source', 'telegram').eq('event_type', 'xpost_session')
            .filter('payload->>chat_id', 'eq', String(cbChatId))
          await tgPost(TG_TOKEN, 'sendMessage', { chat_id: cbChatId, text: '❌ Post cancelled.' })
          return new Response('ok')
        }

        // Look up xpost session
        const { data: xSessions } = await supabase.from('webhook_events')
          .select('id, payload')
          .eq('source', 'telegram').eq('event_type', 'xpost_session')
          .filter('payload->>chat_id', 'eq', String(cbChatId))
          .order('created_at', { ascending: false }).limit(1)

        if (xSessions && xSessions.length > 0) {
          const xs = xSessions[0]
          const xp = xs.payload as any

          if (cbData.startsWith('xpost_profile_')) {
            const profileIdx = parseInt(cbData.replace('xpost_profile_', ''))
            const selectedProfile = xp.profiles?.[profileIdx]
            if (selectedProfile) {
              // Update session with selected profile, ask for platform
              await supabase.from('webhook_events').update({
                payload: { ...xp, step: 'platform', selected_profile: selectedProfile },
              }).eq('id', xs.id)

              const platformButtons = [
                [{ text: '𝕏 X (Twitter)', callback_data: 'xpost_platform_x' }],
                [{ text: '📸 Instagram', callback_data: 'xpost_platform_instagram' }],
                [{ text: '❌ Cancel', callback_data: 'xpost_cancel' }],
              ]
              await tgPost(TG_TOKEN, 'sendMessage', {
                chat_id: cbChatId,
                text: `✅ Profile: <b>${selectedProfile.name || selectedProfile.platform_username}</b>\n\nSelect platform:`,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: platformButtons },
              })
            }
          } else if (cbData.startsWith('xpost_platform_')) {
            const platform = cbData.replace('xpost_platform_', '')
            await supabase.from('webhook_events').update({
              payload: { ...xp, step: 'message', platform },
            }).eq('id', xs.id)
            await tgPost(TG_TOKEN, 'sendMessage', {
              chat_id: cbChatId,
              text: `✅ Platform: <b>${platform}</b>\n\n📝 Now type your post message:`,
              parse_mode: 'HTML',
            })
          }
        }
        return new Response('ok')
      }

      // ─── Higgsfield model selection callbacks ───
      if (cbData.startsWith('higs_model_')) {
        const model = cbData.replace('higs_model_', '')
        // Update higgsfield session with selected model
        const { data: hSessions } = await supabase.from('webhook_events')
          .select('id, payload')
          .eq('source', 'telegram').eq('event_type', 'higgsfield_session')
          .filter('payload->>chat_id', 'eq', String(cbChatId))
          .limit(1)

        if (hSessions && hSessions.length > 0) {
          const hs = hSessions[0]
          const hp = hs.payload as any
          await supabase.from('webhook_events').update({
            payload: { ...hp, model },
          }).eq('id', hs.id)
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: cbChatId,
            text: `✅ Model set: <code>${model}</code>\n\nNow send your prompt (optionally attach an image for video generation).`,
            parse_mode: 'HTML',
          })
        }
        return new Response('ok')
      }

      // ─── Higgsfield gen type selection ───
      if (cbData === 'higs_type_image' || cbData === 'higs_type_video') {
        const genType = cbData === 'higs_type_video' ? 'video' : 'image'
        const { data: hSessions } = await supabase.from('webhook_events')
          .select('id, payload')
          .eq('source', 'telegram').eq('event_type', 'higgsfield_session')
          .filter('payload->>chat_id', 'eq', String(cbChatId))
          .limit(1)

        if (hSessions && hSessions.length > 0) {
          const hs = hSessions[0]
          const hp = hs.payload as any
          await supabase.from('webhook_events').update({
            payload: { ...hp, gen_type: genType },
          }).eq('id', hs.id)
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: cbChatId,
            text: `✅ Type: <b>${genType}</b>\n\nNow send your prompt${genType === 'video' ? ' and attach a source image' : ''}:`,
            parse_mode: 'HTML',
          })
        }
        return new Response('ok')
      }

      // ─── Media save/skip callbacks ───
      if (cbData.startsWith('save_') || cbData.startsWith('skip_')) {
        const action = cbData.startsWith('save_') ? 'save' : 'skip'
        const eventId = cbData.replace(/^(save_|skip_)/, '')

        if (action === 'skip') {
          await supabase.from('webhook_events').update({ processed: true }).eq('id', eventId)
          await tgPost(TG_TOKEN, 'editMessageText', {
            chat_id: cbChatId,
            message_id: cbq.message.message_id,
            text: '⏭️ Skipped.',
          })
          return new Response('ok')
        }

        // Save — retrieve pending media
        const { data: pendingEvent } = await supabase.from('webhook_events')
          .select('*').eq('id', eventId).single()

        if (!pendingEvent) {
          await tgPost(TG_TOKEN, 'editMessageText', {
            chat_id: cbChatId,
            message_id: cbq.message.message_id,
            text: '⚠️ Media expired or already processed.',
          })
          return new Response('ok')
        }

        const mediaPayload = pendingEvent.payload as any
        const fileId = mediaPayload.file_id
        const fileName = mediaPayload.file_name || 'file'
        const mediaType = mediaPayload.type || 'doc'

        // Get file URL from Telegram
        const fileInfoRes = await fetch(`${TG_API}${TG_TOKEN}/getFile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_id: fileId }),
        })
        const fileInfo = await fileInfoRes.json()
        const filePath = fileInfo.result?.file_path

        if (!filePath) {
          await tgPost(TG_TOKEN, 'editMessageText', {
            chat_id: cbChatId,
            message_id: cbq.message.message_id,
            text: '❌ Could not retrieve file from Telegram.',
          })
          return new Response('ok')
        }

        // Download the file
        const downloadUrl = `https://api.telegram.org/file/bot${TG_TOKEN}/${filePath}`
        const fileRes = await fetch(downloadUrl)
        const fileBlob = await fileRes.blob()
        const fileBuffer = await fileBlob.arrayBuffer()

        // Upload to Supabase storage
        const storagePath = `telegram/${Date.now()}_${fileName}`
        const { error: uploadErr } = await supabase.storage
          .from('content-uploads')
          .upload(storagePath, new Uint8Array(fileBuffer), {
            contentType: fileBlob.type || 'application/octet-stream',
            upsert: false,
          })

        if (uploadErr) {
          console.error('[save] upload error:', uploadErr)
          await tgPost(TG_TOKEN, 'editMessageText', {
            chat_id: cbChatId,
            message_id: cbq.message.message_id,
            text: `❌ Upload failed: ${uploadErr.message}`,
          })
          return new Response('ok')
        }

        // Get public URL
        const { data: urlData } = supabase.storage.from('content-uploads').getPublicUrl(storagePath)
        const publicUrl = urlData?.publicUrl || ''

        // Save to content_assets
        await supabase.from('content_assets').insert({
          title: fileName,
          type: mediaType,
          url: publicUrl,
          source: 'telegram',
          status: 'draft',
          category: 'Telegram',
          tags: ['telegram', mediaType],
        })

        // Mark event processed
        await supabase.from('webhook_events').update({ processed: true }).eq('id', eventId)

        await tgPost(TG_TOKEN, 'editMessageText', {
          chat_id: cbChatId,
          message_id: cbq.message.message_id,
          text: `✅ Saved <b>${fileName}</b> to CRM content library.`,
          parse_mode: 'HTML',
        })
        return new Response('ok')
      }

      return new Response('ok')
    }

    // ─── MESSAGE HANDLING ───
    const message = update.message
    if (!message) return new Response('ok')

    const chatId = message.chat.id
    const text = (message.text || message.caption || '').trim()
    const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup'
    const isAllowedGroup = isGroup && ALLOWED_GROUP_IDS.includes(chatId)

    // In groups, only respond to allowed groups
    if (isGroup && !isAllowedGroup) return new Response('ok')

    // ─── IG DM Reply: only check in private chats with reply-to ───
    if (text && !isGroup && message.reply_to_message) {
      const repliedMsgId = message.reply_to_message.message_id
      const { data: igComm } = await supabase
        .from('communications')
        .select('id, from_address, metadata, customer_id')
        .eq('type', 'instagram')
        .eq('direction', 'inbound')
        .eq('provider', 'upload-post-dm-notify')
        .filter('metadata->>telegram_message_id', 'eq', String(repliedMsgId))
        .limit(1)

      if (igComm && igComm.length > 0) {
        const comm = igComm[0]
        const meta = comm.metadata as any
        const recipientUsername = meta?.ig_username || comm.from_address
        const participantId = meta?.participant_id

        if (participantId) {
          await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `📨 Sending DM to @${recipientUsername}...` })
          try {
            const smmRes = await fetch(`${SUPABASE_URL}/functions/v1/smm-api?action=ig-dm-send`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
              },
              body: JSON.stringify({
                platform: 'instagram',
                user: 'STU25',
                recipient_id: participantId,
                message: text,
              }),
            })
            const smmData = await smmRes.json()
            if (smmData?.error) {
              await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `❌ DM failed: ${smmData.error}` })
            } else {
              await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `✅ DM sent to @${recipientUsername}` })
            }
          } catch (e: any) {
            console.error('[ig-dm-reply] error:', e)
            await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `❌ Failed to send DM: ${e.message}` })
          }
          return new Response('ok')
        }
      }
    }

    // Session types we track (moved to module-level constants for performance)
    const ALL_SESSIONS = ['assistant_session', 'invoice_session', 'smm_session', 'customer_session', 'calendar_session', 'meeting_session', 'calendly_session', 'custom_session', 'webdev_session', 'banana_session', 'higgsfield_session', 'xpost_session', 'email_session']
    const ALL_REPLY_SESSIONS = ['assistant_session', 'invoice_session', 'smm_session', 'customer_session', 'calendar_session', 'meeting_session', 'calendly_session', 'custom_session', 'webdev_session', 'banana_session', 'higgsfield_session', 'email_session']

    // ─── Check for persistent button / slash command ───
    const action = resolvePersistentAction(text)

    if (action === 'cancel') {
      // Clean up all sessions for this chat
      for (const sessionType of ALL_SESSIONS) {
        await supabase.from('webhook_events').delete()
          .eq('source', 'telegram').eq('event_type', sessionType)
          .filter('payload->>chat_id', 'eq', String(chatId))
      }
      await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '❌ All sessions cancelled. Pick a command to start fresh.' })
      return new Response('ok')
    }

    if (action === 'more') {
      await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '📋 <b>Page 2</b> — More tools:', parse_mode: 'HTML', reply_markup: PAGE_2_KEYBOARD })
      return new Response('ok')
    }

    if (action === 'back') {
      await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '📋 <b>Main Menu</b>', parse_mode: 'HTML', reply_markup: PERSISTENT_KEYBOARD })
      return new Response('ok')
    }

    if (action === 'start') {
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '🤖 <b>CLAWDbot Command Center</b>\n\nTap a button or type a command. I\'m ready to help with invoices, customers, emails, social media, and more.\n\n<i>Tip: Type naturally — "Send Bryan an email about the project update" — and I\'ll handle the rest.</i>',
        parse_mode: 'HTML',
        reply_markup: PERSISTENT_KEYBOARD,
      })
      return new Response('ok')
    }

    // ─── Handle /xpost command ───
    if (text.toLowerCase().startsWith('/xpost')) {
      // Fetch SMM profiles
      try {
        const profilesRes = await fetch(`${SUPABASE_URL}/functions/v1/smm-api?action=profiles`, {
          headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': Deno.env.get('SUPABASE_ANON_KEY')! },
        })
        const profilesData = await profilesRes.json()
        const profiles = profilesData?.profiles || profilesData?.data?.profiles || []

        if (!profiles.length) {
          await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '⚠️ No SMM profiles found. Add profiles in the SMM dashboard first.' })
          return new Response('ok')
        }

        // Create xpost session
        await supabase.from('webhook_events').insert({
          source: 'telegram',
          event_type: 'xpost_session',
          payload: { chat_id: chatId, step: 'profile', profiles, created: Date.now() },
        })

        const profileButtons = profiles.map((p: any, i: number) => [{
          text: `${p.platform === 'x' ? '𝕏' : '📸'} ${p.name || p.platform_username}`,
          callback_data: `xpost_profile_${i}`,
        }])
        profileButtons.push([{ text: '❌ Cancel', callback_data: 'xpost_cancel' }])

        await tgPost(TG_TOKEN, 'sendMessage', {
          chat_id: chatId,
          text: '📡 <b>Quick Post</b>\n\nSelect a profile:',
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: profileButtons },
        })
      } catch (e: any) {
        console.error('[xpost] error:', e)
        await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `❌ Failed to load profiles: ${e.message}` })
      }
      return new Response('ok')
    }

    // ─── Handle /higs command (model list) ───
    if (text.toLowerCase().startsWith('/higs')) {
      const modelButtons = [
        [{ text: '🎨 Flux (Image)', callback_data: 'higs_model_flux' }],
        [{ text: '🌸 Iris (Image)', callback_data: 'higs_model_iris' }],
        [{ text: '🎬 Image → Video', callback_data: 'higs_type_video' }],
        [{ text: '🖼️ Image Only', callback_data: 'higs_type_image' }],
      ]
      // Create/update higgsfield session
      await supabase.from('webhook_events').delete()
        .eq('source', 'telegram').eq('event_type', 'higgsfield_session')
        .filter('payload->>chat_id', 'eq', String(chatId))
      await supabase.from('webhook_events').insert({
        source: 'telegram',
        event_type: 'higgsfield_session',
        payload: { chat_id: chatId, history: [], created: Date.now() },
      })
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '🎬 <b>Higgsfield AI</b>\n\nSelect a model or generation type:',
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: modelButtons },
      })
      return new Response('ok')
    }

    // ─── Start a new module session ───
    const SESSION_MAP: Record<string, string> = {
      invoice: 'invoice_session',
      smm: 'smm_session',
      customer: 'customer_session',
      calendar: 'calendar_session',
      meeting: 'meeting_session',
      calendly: 'calendly_session',
      custom: 'custom_session',
      webdev: 'webdev_session',
      banana: 'banana_session',
      higgsfield: 'higgsfield_session',
      email: 'email_session',
      assistant: 'assistant_session',
    }

    if (action && SESSION_MAP[action]) {
      const sessionType = SESSION_MAP[action]
      const labels: Record<string, string> = {
        invoice: '💰 Invoice Terminal',
        smm: '📱 SMM Terminal',
        customer: '👤 Customer Terminal',
        calendar: '📅 Calendar Terminal',
        meeting: '🤝 Meeting Terminal',
        calendly: '🗓 Calendly Terminal',
        custom: '📦 Custom-U Terminal',
        webdev: '🌐 Web Dev Terminal',
        banana: '🍌 Banana Image Gen',
        higgsfield: '🎬 Higgsfield AI',
        email: '📧 AI Email Composer',
        assistant: '🤖 AI Assistant',
      }
      const hints: Record<string, string> = {
        invoice: 'Try: "Create an invoice for Bryan, $500 for web design"',
        smm: 'Try: "Post about our new website launch on X"',
        customer: 'Try: "Add a new customer John Smith, email john@example.com"',
        calendar: 'Try: "Schedule a meeting with Bryan next Tuesday at 2pm"',
        meeting: 'Try: "Create a meeting room for the team"',
        calendly: 'Try: "Set my availability Mon-Fri 9am-5pm"',
        custom: 'Try: "Generate a portal link for Bryan"',
        webdev: 'Try: "Build a landing page for a coffee shop"',
        banana: 'Try: "A futuristic city at sunset in cyberpunk style"',
        higgsfield: 'Try: "A cat playing piano" or attach an image for video',
        email: 'Try: "Send Bryan an email telling him how great he is"',
        assistant: 'Try: "Build Warren a website, then email him the link, and send a $500 invoice"',
      }

      // Clean up old sessions for this module
      await supabase.from('webhook_events').delete()
        .eq('source', 'telegram').eq('event_type', sessionType)
        .filter('payload->>chat_id', 'eq', String(chatId))

      // Create new session
      await supabase.from('webhook_events').insert({
        source: 'telegram',
        event_type: sessionType,
        payload: { chat_id: chatId, history: [], created: Date.now() },
      })

      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: `${labels[action]} <b>activated!</b>\n\n${hints[action]}\n\n<i>Type your command or /cancel to exit.</i>`,
        parse_mode: 'HTML',
      })
      return new Response('ok')
    }

    // ─── Check for active sessions (SINGLE query instead of 12) ───
    const { data: activeSessions } = await supabase.from('webhook_events')
      .select('id, event_type, payload')
      .eq('source', 'telegram')
      .in('event_type', ALL_REPLY_SESSIONS)
      .filter('payload->>chat_id', 'eq', String(chatId))
      .eq('processed', false)
      .order('created_at', { ascending: false }).limit(1)

    if (activeSessions && activeSessions.length > 0) {
      const session = activeSessions[0]
      const sessionType = session.event_type
      const sp = session.payload as any
      const history = sp.history || []

      // Check for media in the message (for banana/higgsfield)
      const media = extractMedia(message)
      let imageUrl: string | undefined

      if (media && (sessionType === 'banana_session' || sessionType === 'higgsfield_session')) {
        const fileInfoRes = await fetch(`${TG_API}${TG_TOKEN}/getFile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_id: media.fileId }),
        })
        const fileInfo = await fileInfoRes.json()
        const filePath = fileInfo.result?.file_path
        if (filePath) {
          imageUrl = `https://api.telegram.org/file/bot${TG_TOKEN}/${filePath}`
        }
      }

      // Route to the correct processor
      if (sessionType === 'assistant_session') {
        await processAssistantCommand(chatId, text, history, TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase)
      } else if (sessionType === 'invoice_session') {
        await processInvoiceCommand(chatId, text, history, TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase)
      } else if (sessionType === 'smm_session') {
        await processSMMCommand(chatId, text, history, TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase)
      } else if (sessionType === 'email_session') {
        await processEmailCommand(chatId, text, history, TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase)
      } else if (sessionType === 'webdev_session') {
        await processWebDevCommand(chatId, text, history, TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase)
      } else if (sessionType === 'banana_session') {
        await processBananaCommand(chatId, text, history, TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase, imageUrl)
      } else if (sessionType === 'higgsfield_session') {
        await processHiggsFieldCommand(chatId, text, history, TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase, imageUrl, sp.gen_type, sp.model)
      } else {
        const mod = sessionType.replace('_session', '') as any
        await processModuleCommand(chatId, text, history, TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase, mod)
      }
      return new Response('ok')
    }

    // ─── Handle xpost session text (message step) ───
    const { data: xSessions } = await supabase.from('webhook_events')
      .select('id, payload')
      .eq('source', 'telegram').eq('event_type', 'xpost_session')
      .filter('payload->>chat_id', 'eq', String(chatId))
      .eq('processed', false)
      .order('created_at', { ascending: false }).limit(1)

    if (xSessions && xSessions.length > 0) {
      const xs = xSessions[0]
      const xp = xs.payload as any

      if (xp.step === 'message' && text) {
        await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '📡 Posting...' })
        try {
          const postRes = await fetch(`${SUPABASE_URL}/functions/v1/smm-api?action=quick-post`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
            },
            body: JSON.stringify({
              profile_id: xp.selected_profile?.id,
              platform: xp.platform,
              message: text,
            }),
          })
          const postData = await postRes.json()
          if (postData?.error) {
            await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `❌ ${postData.error}` })
          } else {
            await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `✅ Posted to ${xp.platform}!` })
          }
        } catch (e: any) {
          await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `❌ Post failed: ${e.message}` })
        }
        // Clean up session
        await supabase.from('webhook_events').delete().eq('id', xs.id)
        return new Response('ok')
      }
    }

    // ─── Auto-intent detection for free text ───
    if (text && !isGroup) {
      const lower = text.toLowerCase()

      // Email intent
      if (/\b(send|write|draft|compose|email|mail)\b.*\b(email|mail|message|note)\b/i.test(text) ||
          /\b(email|mail)\b.*\b(to|for|about)\b/i.test(text)) {
        // Auto-create email session and process
        await supabase.from('webhook_events').delete()
          .eq('source', 'telegram').eq('event_type', 'email_session')
          .filter('payload->>chat_id', 'eq', String(chatId))
        await supabase.from('webhook_events').insert({
          source: 'telegram',
          event_type: 'email_session',
          payload: { chat_id: chatId, history: [], created: Date.now() },
        })
        await processEmailCommand(chatId, text, [], TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase)
        return new Response('ok')
      }

      // Invoice intent
      if (/\b(invoice|bill|charge|payment)\b/i.test(lower)) {
        await supabase.from('webhook_events').delete()
          .eq('source', 'telegram').eq('event_type', 'invoice_session')
          .filter('payload->>chat_id', 'eq', String(chatId))
        await supabase.from('webhook_events').insert({
          source: 'telegram',
          event_type: 'invoice_session',
          payload: { chat_id: chatId, history: [], created: Date.now() },
        })
        await processInvoiceCommand(chatId, text, [], TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase)
        return new Response('ok')
      }

      // SMM intent
      if (/\b(post|tweet|publish|schedule)\b.*\b(social|twitter|x|instagram|ig)\b/i.test(lower) ||
          /\b(social media|smm)\b/i.test(lower)) {
        await supabase.from('webhook_events').delete()
          .eq('source', 'telegram').eq('event_type', 'smm_session')
          .filter('payload->>chat_id', 'eq', String(chatId))
        await supabase.from('webhook_events').insert({
          source: 'telegram',
          event_type: 'smm_session',
          payload: { chat_id: chatId, history: [], created: Date.now() },
        })
        await processSMMCommand(chatId, text, [], TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase)
        return new Response('ok')
      }
    }

    // ─── MEDIA HANDLING (ask before saving) ───
    const media = extractMedia(message)
    if (media) {
      const MAX_SIZE = 20 * 1024 * 1024
      if (media.fileSize > MAX_SIZE) {
        await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `⚠️ File too large (${(media.fileSize / 1024 / 1024).toFixed(1)}MB). Max is 20MB.` })
        return new Response('ok')
      }

      // Store pending media in webhook_events
      const { data: inserted } = await supabase.from('webhook_events').insert({
        source: 'telegram',
        event_type: 'pending_media',
        payload: {
          chat_id: chatId,
          file_id: media.fileId,
          file_name: media.fileName,
          type: media.type,
          file_size: media.fileSize,
          caption: text || null,
        },
        processed: false,
      }).select('id').single()

      if (inserted) {
        await tgPost(TG_TOKEN, 'sendMessage', {
          chat_id: chatId,
          text: `📎 <b>${media.fileName}</b> (${media.type})\n\nSave to CRM content library?`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Save', callback_data: `save_${inserted.id}` },
                { text: '⏭️ Skip', callback_data: `skip_${inserted.id}` },
              ],
            ],
          },
        })
      }
      return new Response('ok')
    }

    // ─── In groups, ignore free text without media or commands ───
    if (isGroup) return new Response('ok')

    // ─── Fallback for unrecognized text in DMs ───
    if (text) {
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '🤖 I didn\'t catch that. Tap a button below or type /menu to see all commands.\n\n<i>Tip: You can also just describe what you need — "Send Bryan an email" or "Create an invoice for $500"</i>',
        parse_mode: 'HTML',
      })
    }

    return new Response('ok')

  } catch (err: any) {
    console.error('[telegram-media-listener] ERROR:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
