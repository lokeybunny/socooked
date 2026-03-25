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
const ALLOWED_GROUP_IDS = [-5295903251, -1002188568751]

// Channel ID for X Feed forwarding (PebbleHost bot posts here)
const X_FEED_CHANNEL_ID = -1003740017231

// Channel ID for Market Cap Alerts
const MCAP_ALERT_CHANNEL_ID = -1003767278197

// Channel ID for KOL Groups
const KOL_CHANNEL_ID = -1003736895151

// Channel ID for Meta Narrative tracking
const META_CHANNEL_ID = -1003804658600

// Channel ID for Gainers (take profit alerts)
const GAINERS_CHANNEL_ID = -1003862520317

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
    [{ text: '🍌2️⃣ Banana2' }, { text: '🎬 Higgsfield' }],
    [{ text: '🤖 AI Assistant' }, { text: '📧 Email' }],
    [{ text: '📝 Proposal' }, { text: '🔍 Audit' }],
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
    { command: 'banana2', description: '🍌2️⃣ Banana2 — Gemini 3 Image Gen' },
    { command: 'higgsfield', description: '🎬 Higgsfield AI Generate' },
    { command: 'xpost', description: '📡 Quick post to social media' },
    { command: 'higs', description: '🎬 Higgsfield model list' },
    { command: 'cancel', description: '❌ Cancel active session' },
    { command: 'proposal', description: '📝 Create & send a proposal' },
    { command: 'audit', description: '🔍 Audit a website + Instagram' },
    { command: 'gains', description: '⚡ Toggle TP10 gain alerts on/off' },
    { command: 'shill', description: '🚀 Shill video to X Community' },
    { command: 'shill2', description: '🎯 Shill video to Shill X community' },
  ]

  // Fire-and-forget: register commands + ensure webhook accepts channel_post
  const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-media-listener`
  const promises = [
    fetch(`${TG_API}${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: allCommands }),
    }).catch(() => {}),
    // Re-register webhook with channel_post in allowed_updates
    fetch(`${TG_API}${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query', 'channel_post'],
      }),
    }).then(r => r.text()).then(t => console.log('[webhook] setWebhook:', t)).catch(() => {}),
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
    // Hide menu commands in the Shill Lounge — bot is forwarding-only there
    fetch(`${TG_API}${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [],
        scope: { type: 'chat', chat_id: -1002188568751 },
      }),
    }).catch(() => {}),
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

function resolvePersistentAction(input: string): 'invoice' | 'smm' | 'customer' | 'calendar' | 'calendly' | 'meeting' | 'custom' | 'start' | 'cancel' | 'more' | 'back' | 'webdev' | 'banana' | 'banana2' | 'higgsfield' | 'email' | 'assistant' | 'proposal' | 'gains' | 'audit' | null {
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
  if (normalized === 'banana2' || normalized === '/banana2' || /banana\s*2/.test(normalized) || /^2.*banana2$/i.test(normalized)) return 'banana2'
  if ((normalized === 'banana' || normalized === '/banana') && !/banana2/.test(normalized)) return 'banana'
  if (normalized === 'higgsfield' || normalized === '/higgsfield') return 'higgsfield'
  if (normalized === 'email' || normalized === '/email') return 'email'
  if (normalized === 'ai assistant' || normalized === 'assistant' || normalized === '/assistant') return 'assistant'
  if (normalized === 'proposal' || normalized === '/proposal') return 'proposal'
  if (normalized === 'audit' || normalized === '/audit') return 'audit'
  if (normalized === 'gains' || normalized === '/gains') return 'gains'
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
            const d = action.data?.invoice || action.data
            if (d.invoice_number) parts.push(`#${d.invoice_number}`)
            if (d.amount) parts.push(`$${Number(d.amount).toFixed(2)}`)
            if (d.status) parts.push(d.status)
            if (d.customer_name) parts.push(d.customer_name)
            if (action.data.gmail_id || action.data.email_sent || d.sent_at) parts.push('📧 email sent')
            if (action.data.pdf_attached || action.data.gmail_id) parts.push('📎 PDF')
            if (d.payment_url) parts.push('💳 Pay Now link')
            if (action.data.customer_email) parts.push(`→ ${action.data.customer_email}`)
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

// ─── SMM Terminal via Telegram (Prompt mode — direct actions) ───
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

// ─── SMM Strategist via Telegram (Cortex content planner — synced with web app) ───
async function processSMMStrategist(
  chatId: number,
  prompt: string,
  history: { role: string; text: string }[],
  tgToken: string,
  supabaseUrl: string,
  supabase: any,
  profileUsername: string,
  platform: string,
) {
  await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: '🧠 <b>Cortex Strategist</b> thinking...', parse_mode: 'HTML' })

  try {
    // 1. Save user message to shared conversation table
    await supabase.from('smm_conversations').insert({
      profile_username: profileUsername,
      platform,
      source: 'telegram',
      role: 'user',
      message: prompt,
      meta: { chat_id: chatId },
    })

    // 2. Call smm-scheduler with full history from shared table
    const { data: convHistory } = await supabase.from('smm_conversations')
      .select('role, message')
      .eq('profile_username', profileUsername)
      .eq('platform', platform)
      .order('created_at', { ascending: true })
      .limit(30)

    const formattedHistory = (convHistory || []).map((m: any) => ({
      role: m.role === 'cortex' ? 'assistant' : m.role,
      text: m.message,
    }))

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const res = await fetch(`${supabaseUrl}/functions/v1/smm-scheduler`, {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        profile: profileUsername,
        history: formattedHistory,
      }),
    })
    const result = await res.json()

    let replyText = ''
    if (result?.type === 'clarify') {
      replyText = result.message
    } else if (result?.type === 'content_plan') {
      replyText = `✅ ${result.message}`
    } else if (result?.type === 'message') {
      replyText = result.message
    } else {
      replyText = result?.message || 'Done.'
    }

    // 3. Save Cortex response to shared conversation table
    await supabase.from('smm_conversations').insert({
      profile_username: profileUsername,
      platform,
      source: 'telegram',
      role: 'cortex',
      message: replyText,
      meta: { chat_id: chatId, type: result?.type || 'message' },
    })

    // 4. Update session history
    const { data: sessions } = await supabase.from('webhook_events')
      .select('id, payload')
      .eq('source', 'telegram').eq('event_type', 'smm_strategist_session')
      .filter('payload->>chat_id', 'eq', String(chatId))
      .limit(1)

    if (sessions && sessions.length > 0) {
      const session = sessions[0]
      const payload = session.payload as any
      const newHistory = [
        ...(payload.history || []),
        { role: 'user', text: prompt },
        { role: 'assistant', text: replyText.slice(0, 500) },
      ].slice(-20)
      await supabase.from('webhook_events').update({
        payload: { ...payload, history: newHistory },
      }).eq('id', session.id)
    }

    // 5. Format Telegram reply
    let tgReply = ''
    if (result?.type === 'clarify') {
      tgReply = `❓ ${replyText}`
    } else if (result?.type === 'content_plan') {
      tgReply = `📅 <b>Content Plan Created!</b>\n\n${replyText}\n\n<i>View & edit in the app → Content Schedule tab</i>`

      // Ask if they want to generate media for the week
      await tgPost(tgToken, 'sendMessage', {
        chat_id: chatId,
        text: tgReply.slice(0, 4000),
        parse_mode: 'HTML',
      })
      await tgPost(tgToken, 'sendMessage', {
        chat_id: chatId,
        text: '🎨 <b>Would you like me to generate images and videos for the week?</b>\n\n<i>I\'ll use AI to create visuals for each scheduled post.</i>',
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Yes, generate media', callback_data: 'smm_gen_yes' },
              { text: '⏭️ Not now', callback_data: 'smm_gen_no' },
            ],
          ],
        },
      })
      // Already sent — skip the final send below
      return
    } else {
      tgReply = replyText
    }

    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: tgReply.slice(0, 4000),
      parse_mode: 'HTML',
    })
  } catch (e: any) {
    console.error('[smm-strategist-tg] error:', e)
    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ <b>Strategist failed:</b> <code>${(e.message || String(e)).slice(0, 300)}</code>`,
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
    // Extract phone number from prompt if provided (e.g. "build a site for 555-123-4567")
    const phoneMatch = prompt.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)
    const extractedPhone = phoneMatch ? phoneMatch[0] : null

    // First try prompt-machine to optimize the prompt, then v0-designer
    const res = await fetch(`${supabaseUrl}/functions/v1/clawd-bot/generate-website`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': botSecret,
      },
      body: JSON.stringify({ prompt, chat_id: String(chatId), ...(extractedPhone ? { phone: extractedPhone } : {}) }),
    })
    const rawData = await res.json()
    const result = rawData?.data || rawData

    let replyText = ''

    if (result?.preview_url) {
      replyText = `✅ <b>Website Generated!</b>\n\n`
        + `🔗 <a href="${result.preview_url}">Preview</a>`
        + (result.edit_url ? ` · <a href="${result.edit_url}">Edit</a>` : '')
        + `\n📋 <i>${prompt.slice(0, 200)}</i>`
    } else if (result?.status === 'generating' && result?.edit_url) {
      // v0-designer returns immediately with edit_url — preview comes later via polling
      replyText = `⏳ <b>Website is generating!</b>\n\n`
        + `✏️ <a href="${result.edit_url}">Edit in V0</a>\n`
        + `📋 <i>${prompt.slice(0, 200)}</i>\n\n`
        + `<i>You'll get a notification with the preview link once it's ready.</i>`

      // Fire-and-forget: trigger v0-poll after 30s to check for completion
      const chatIdForPoll = result.chat_id
      if (chatIdForPoll) {
        setTimeout(async () => {
          try {
            for (let attempt = 0; attempt < 6; attempt++) {
              await new Promise(r => setTimeout(r, 30000))
              const pollRes = await fetch(`${supabaseUrl}/functions/v1/v0-poll?chat_id=${chatIdForPoll}`, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  'Content-Type': 'application/json',
                  'x-bot-secret': botSecret,
                },
              })
              const pollData = await pollRes.json()
              const pollResult = pollData?.data?.results?.[0]
              if (pollResult?.status === 'completed' && pollResult?.preview_url) {
                await tgPost(tgToken, 'sendMessage', {
                  chat_id: chatId,
                  text: `✅ <b>Website Ready!</b>\n\n🔗 <a href="${pollResult.preview_url}">Preview</a> · <a href="${result.edit_url}">Edit</a>\n📋 <i>${prompt.slice(0, 100)}</i>`,
                  parse_mode: 'HTML',
                  disable_web_page_preview: false,
                })
                return
              }
              if (pollResult?.status === 'failed') {
                await tgPost(tgToken, 'sendMessage', {
                  chat_id: chatId,
                  text: `❌ <b>Website generation failed.</b> Try again with /webdev`,
                  parse_mode: 'HTML',
                })
                return
              }
            }
          } catch (e) {
            console.error('[webdev-poll-bg] error:', e)
          }
        }, 0)
      }
    } else if (result?.chat_id && result?.edit_url) {
      // Fallback for any response with edit_url but no preview yet
      replyText = `⏳ <b>Website is generating!</b>\n\n✏️ <a href="${result.edit_url}">Edit in V0</a>\n📋 <i>${prompt.slice(0, 200)}</i>`
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

    const imageOutputUrl = result?.url || result?.output_url
    let photoSent = false
    if (imageOutputUrl) {
      replyText = `🍌 <b>Image Generated!</b>\n\n🔗 <a href="${imageOutputUrl}">View Image</a>\n📋 <i>${prompt.slice(0, 200)}</i>`
      // Try to send the image directly
      try {
        await tgPost(tgToken, 'sendPhoto', { chat_id: chatId, photo: imageOutputUrl, caption: `🍌 ${prompt.slice(0, 200)}` })
        photoSent = true
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

    if (!photoSent) {
      await tgPost(tgToken, 'sendMessage', {
        chat_id: chatId,
        text: replyText.slice(0, 4000),
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      })
    }
  } catch (e: any) {
    console.error('[banana-tg] error:', e)
    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ <b>Banana command failed:</b> <code>${(e.message || String(e)).slice(0, 300)}</code>`,
      parse_mode: 'HTML',
    })
  }
}

// ─── Banana2 (Gemini 3 Pro Image) Terminal via Telegram ───
async function processBanana2Command(
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
  await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: editMode ? '🍌2️⃣ Editing image with Banana2...' : '🍌2️⃣ Generating image with Banana2 (Gemini 3)...', parse_mode: 'HTML' })

  try {
    const payload: Record<string, unknown> = { prompt, provider: 'nano-banana', model: 'google/gemini-3-pro-image-preview' }
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

    const imageOutputUrl = result?.url || result?.output_url
    let photoSent = false
    if (imageOutputUrl) {
      replyText = `🍌2️⃣ <b>Banana2 Image Generated!</b>\n\n🔗 <a href="${imageOutputUrl}">View Image</a>\n📋 <i>${prompt.slice(0, 200)}</i>`
      try {
        await tgPost(tgToken, 'sendPhoto', { chat_id: chatId, photo: imageOutputUrl, caption: `🍌2️⃣ ${prompt.slice(0, 200)}` })
        photoSent = true
      } catch (_e) { /* fallback to text link */ }
    } else if (result?.content_asset_id || result?.id) {
      replyText = `✅ <b>Banana2 image created!</b>\n🆔 <code>${result.content_asset_id || result.id}</code>\n\nCheck the Content Library for your image.`
    } else if (result?.error) {
      replyText = `❌ ${result.error}`
    } else {
      replyText = `<pre>${JSON.stringify(result, null, 2).slice(0, 3500)}</pre>`
    }

    // Update conversation history
    const { data: sessions } = await supabase.from('webhook_events')
      .select('id, payload')
      .eq('source', 'telegram').eq('event_type', 'banana2_session')
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

    if (!photoSent) {
      await tgPost(tgToken, 'sendMessage', {
        chat_id: chatId,
        text: replyText.slice(0, 4000),
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      })
    }
  } catch (e: any) {
    console.error('[banana2-tg] error:', e)
    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ <b>Banana2 command failed:</b> <code>${(e.message || String(e)).slice(0, 300)}</code>`,
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

// ─── Proposal Session: multi-step wizard + PDF generation + email ───
const PROPOSAL_STEPS = ['recipient', 'name', 'service', 'cost', 'terms', 'deadline', 'confirm'] as const

async function processProposalSession(
  chatId: number,
  text: string,
  sessionId: string,
  sp: any,
  tgToken: string,
  supabaseUrl: string,
  supabase: any,
) {
  const step = sp.step as string
  const data = sp.data || {}

  // Step 1: recipient — accept email or name, resolve from CRM
  if (step === 'recipient') {
    const input = text.trim()
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)

    if (isEmail) {
      // Direct email — look up name from CRM
      data.email = input
      const { data: custs } = await supabase.from('customers')
        .select('full_name')
        .ilike('email', input)
        .limit(1)
      if (custs && custs.length > 0) {
        data.clientName = custs[0].full_name
        await supabase.from('webhook_events').update({ payload: { ...sp, step: 'service', data } }).eq('id', sessionId)
        await tgPost(tgToken, 'sendMessage', {
          chat_id: chatId,
          text: `✅ Found <b>${data.clientName}</b> (${data.email}) in CRM.\n\n🛠 <b>What is the service?</b>\n\n<i>e.g. Website Design, Brand Identity Package</i>`,
          parse_mode: 'HTML',
        })
      } else {
        await supabase.from('webhook_events').update({ payload: { ...sp, step: 'name', data } }).eq('id', sessionId)
        await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: '👤 <b>What is the client\'s name?</b>', parse_mode: 'HTML' })
      }
    } else {
      // Name input — search CRM by name
      const { data: custs } = await supabase.from('customers')
        .select('full_name, email')
        .ilike('full_name', `%${input}%`)
        .limit(5)

      const withEmail = (custs || []).filter((c: any) => c.email)

      if (withEmail.length === 1) {
        data.clientName = withEmail[0].full_name
        data.email = withEmail[0].email
        await supabase.from('webhook_events').update({ payload: { ...sp, step: 'service', data } }).eq('id', sessionId)
        await tgPost(tgToken, 'sendMessage', {
          chat_id: chatId,
          text: `✅ Found <b>${data.clientName}</b> — ${data.email}\n\n🛠 <b>What is the service?</b>\n\n<i>e.g. Website Design, Brand Identity Package</i>`,
          parse_mode: 'HTML',
        })
      } else if (withEmail.length > 1) {
        // Multiple matches — ask to pick
        const list = withEmail.map((c: any, i: number) => `${i + 1}. <b>${c.full_name}</b> — ${c.email}`).join('\n')
        data._candidates = withEmail
        await supabase.from('webhook_events').update({ payload: { ...sp, step: 'pick_customer', data } }).eq('id', sessionId)
        await tgPost(tgToken, 'sendMessage', {
          chat_id: chatId,
          text: `👥 Multiple matches found:\n\n${list}\n\n<b>Reply with the number</b> or type a different name/email.`,
          parse_mode: 'HTML',
        })
      } else {
        // No match — store name, ask for email
        data.clientName = input
        await supabase.from('webhook_events').update({ payload: { ...sp, step: 'email_manual', data } }).eq('id', sessionId)
        await tgPost(tgToken, 'sendMessage', {
          chat_id: chatId,
          text: `⚠️ No CRM match for "<b>${input}</b>".\n\n📧 <b>What email should we send the proposal to?</b>`,
          parse_mode: 'HTML',
        })
      }
    }
    return
  }
  if (step === 'pick_customer') {
    const idx = parseInt(text.trim()) - 1
    const candidates = data._candidates || []
    if (idx >= 0 && idx < candidates.length) {
      data.clientName = candidates[idx].full_name
      data.email = candidates[idx].email
      delete data._candidates
      await supabase.from('webhook_events').update({ payload: { ...sp, step: 'service', data } }).eq('id', sessionId)
      await tgPost(tgToken, 'sendMessage', {
        chat_id: chatId,
        text: `✅ Selected <b>${data.clientName}</b> — ${data.email}\n\n🛠 <b>What is the service?</b>`,
        parse_mode: 'HTML',
      })
    } else {
      // Treat as new name/email input, restart recipient step
      await supabase.from('webhook_events').update({ payload: { ...sp, step: 'recipient', data: {} } }).eq('id', sessionId)
      return processProposalSession(chatId, text, sessionId, { ...sp, step: 'recipient', data: {} }, tgToken, supabaseUrl, supabase)
    }
    return
  }
  if (step === 'email_manual') {
    data.email = text.trim()
    await supabase.from('webhook_events').update({ payload: { ...sp, step: 'service', data } }).eq('id', sessionId)
    await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: '🛠 <b>What is the service?</b>\n\n<i>e.g. Website Design, Brand Identity Package, Social Media Management</i>', parse_mode: 'HTML' })
    return
  }
  if (step === 'name') {
    data.clientName = text.trim()
    await supabase.from('webhook_events').update({ payload: { ...sp, step: 'service', data } }).eq('id', sessionId)
    await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: '🛠 <b>What is the service?</b>\n\n<i>e.g. Website Design, Brand Identity Package, Social Media Management</i>', parse_mode: 'HTML' })
    return
  }
  if (step === 'service') {
    data.service = text.trim()
    await supabase.from('webhook_events').update({ payload: { ...sp, step: 'cost', data } }).eq('id', sessionId)
    await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: '💰 <b>What is the cost of the project?</b>\n\n<i>e.g. $1,500 or 2000</i>', parse_mode: 'HTML' })
    return
  }
  if (step === 'cost') {
    data.cost = text.trim()
    await supabase.from('webhook_events').update({ payload: { ...sp, step: 'terms', data } }).eq('id', sessionId)
    await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: '📋 <b>What are the terms of payment?</b>\n\n<i>e.g. 1/2 up front, 1/2 when done</i>', parse_mode: 'HTML' })
    return
  }
  if (step === 'terms') {
    data.terms = text.trim()
    await supabase.from('webhook_events').update({ payload: { ...sp, step: 'deadline', data } }).eq('id', sessionId)
    await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: '📅 <b>When is the job due?</b>\n\n<i>e.g. March 15, 2026 or 2 weeks</i>', parse_mode: 'HTML' })
    return
  }
  if (step === 'deadline') {
    data.deadline = text.trim()
    await supabase.from('webhook_events').update({ payload: { ...sp, step: 'confirm', data } }).eq('id', sessionId)

    // Build preview
    const costDisplay = data.cost.startsWith('$') ? data.cost : `$${data.cost}`
    const preview = `📝 <b>PROPOSAL PREVIEW</b>\n\n`
      + `📧 <b>To:</b> ${data.email}\n`
      + `👤 <b>Client:</b> ${data.clientName}\n`
      + `🛠 <b>Service:</b> ${data.service}\n`
      + `💰 <b>Cost:</b> ${costDisplay}\n`
      + `📋 <b>Terms:</b> ${data.terms}\n`
      + `📅 <b>Deadline:</b> ${data.deadline}\n\n`
      + `<i>A professional PDF proposal will be attached to the email.</i>\n\n`
      + `<b>Is this okay to send?</b> Reply <b>Yes</b> or <b>No</b>.`
    await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: preview, parse_mode: 'HTML' })
    return
  }
  if (step === 'confirm') {
    const lower = text.trim().toLowerCase()
    if (lower === 'no' || lower === 'n' || lower === 'cancel') {
      await supabase.from('webhook_events').delete().eq('id', sessionId)
      await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: '❌ Proposal cancelled.' })
      return
    }
    if (lower !== 'yes' && lower !== 'y' && lower !== 'send') {
      await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: '❓ Reply <b>Yes</b> to send or <b>No</b> to cancel.', parse_mode: 'HTML' })
      return
    }

    // Generate & send proposal
    await tgPost(tgToken, 'sendMessage', { chat_id: chatId, text: '⏳ <b>Generating proposal PDF and sending...</b>', parse_mode: 'HTML' })

    try {
      const costDisplay = data.cost.startsWith('$') ? data.cost : `$${data.cost}`
      const now = new Date()
      const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles' })

      // Fetch signature image from storage
      let signatureBytes: Uint8Array | null = null
      try {
        const sigUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/site-assets/branding/warren-signature.jpg`
        const sigRes = await fetch(sigUrl)
        if (sigRes.ok) {
          signatureBytes = new Uint8Array(await sigRes.arrayBuffer())
        }
      } catch (e) { console.error('[proposal] Failed to fetch signature image:', e) }

      // Build structured PDF with embedded signature
      const pdfBytes = buildStructuredPdfWithSignature(data.clientName, data.email, data.service, costDisplay, data.terms, data.deadline, dateStr, timeStr, signatureBytes)

      // Convert to base64
      let binary = ''
      for (let i = 0; i < pdfBytes.length; i++) {
        binary += String.fromCharCode(pdfBytes[i])
      }
      const pdfBase64 = btoa(binary)

      // Build email body
      const emailBody = `
        <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;">
          <p>Hello ${data.clientName},</p>
          <p>Thank you for your interest in our services. Please find attached a detailed proposal for the <b>${data.service}</b> project.</p>
          <p>We've outlined the scope, pricing, and timeline in the attached PDF. Please review it at your convenience.</p>
          <p>If you have any questions or would like to discuss any aspect of this proposal, please don't hesitate to reach out.</p>
          <p>We look forward to working with you!</p>
        </div>`

      // Send via gmail-api with PDF attachment
      const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
      const sendRes = await fetch(`${supabaseUrl}/functions/v1/gmail-api?action=send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          to: data.email,
          subject: `Proposal: ${data.service} - STU25`,
          body: emailBody,
          attachments: [{
            filename: `STU25_Proposal_${data.clientName.replace(/\s+/g, '_')}.pdf`,
            mimeType: 'application/pdf',
            data: pdfBase64,
          }],
        }),
      })
      const sendResult = await sendRes.json()

      if (sendResult?.success || sendResult?.id) {
        await tgPost(tgToken, 'sendMessage', {
          chat_id: chatId,
          text: `✅ <b>Proposal sent!</b>\n\n📧 Delivered to: ${data.email}\n📋 Service: ${data.service}\n💰 ${costDisplay}\n📎 PDF attached`,
          parse_mode: 'HTML',
        })

        // ─── Pipeline: Proposal sent → move deal to "proposal" ───
        try {
          const { data: cust } = await supabase.from('customers')
            .select('id')
            .eq('email', data.email)
            .limit(1)
            .maybeSingle()
          if (cust) {
            const { data: deal } = await supabase.from('deals')
              .select('id, stage')
              .eq('customer_id', cust.id)
              .in('status', ['open'])
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            if (deal && deal.stage !== 'proposal') {
              await supabase.from('deals').update({ stage: 'proposal' }).eq('id', deal.id)
              await supabase.from('activity_log').insert({
                entity_type: 'deal',
                entity_id: deal.id,
                action: 'updated',
                meta: { title: data.clientName, from_stage: deal.stage, to_stage: 'proposal', auto: true },
              })
              console.log(`[pipeline] Deal ${deal.id} moved ${deal.stage} → proposal (proposal sent)`)
            }
          }
        } catch (pipeErr) {
          console.error('[pipeline] Proposal stage advance error:', pipeErr)
        }
      } else {
        throw new Error(sendResult?.error || 'Send failed')
      }

      // Clean up session
      await supabase.from('webhook_events').delete().eq('id', sessionId)
    } catch (e: any) {
      console.error('[proposal] error:', e)
      await tgPost(tgToken, 'sendMessage', {
        chat_id: chatId,
        text: `❌ <b>Proposal failed:</b> <code>${(e.message || String(e)).slice(0, 300)}</code>`,
        parse_mode: 'HTML',
      })
    }
    return
  }
}

function buildProposalPdf(clientName: string, email: string, service: string, cost: string, terms: string, deadline: string, dateStr: string, timeStr: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  @page { size: letter; margin: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; color: #1a1a2e; background: #fff; }
  .page { width: 8.5in; min-height: 11in; padding: 0; position: relative; }
  .header { background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #2d1b69 100%); color: #fff; padding: 50px 60px 40px; }
  .header h1 { font-size: 36px; font-weight: 300; margin: 0 0 8px; letter-spacing: 2px; }
  .header .tagline { font-size: 14px; color: #a0a0c0; letter-spacing: 4px; text-transform: uppercase; }
  .header .logo-text { font-size: 42px; font-weight: 700; letter-spacing: 3px; margin-bottom: 4px; }
  .divider { height: 4px; background: linear-gradient(90deg, #6c63ff, #00d2ff, #6c63ff); }
  .body { padding: 40px 60px; }
  .proposal-title { font-size: 28px; font-weight: 600; color: #1a1a2e; margin: 0 0 5px; }
  .proposal-subtitle { font-size: 14px; color: #666; margin-bottom: 30px; }
  .section { margin-bottom: 28px; }
  .section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #6c63ff; font-weight: 600; margin-bottom: 6px; }
  .section-value { font-size: 16px; color: #1a1a2e; line-height: 1.5; }
  .detail-grid { display: flex; flex-wrap: wrap; gap: 24px; margin-bottom: 30px; }
  .detail-box { flex: 1; min-width: 200px; background: #f8f8fc; border-radius: 8px; padding: 20px; border-left: 3px solid #6c63ff; }
  .detail-box .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #888; margin-bottom: 6px; }
  .detail-box .value { font-size: 18px; font-weight: 600; color: #1a1a2e; }
  .cost-box { background: #f0eeff; border-left-color: #6c63ff; }
  .cost-box .value { font-size: 28px; color: #6c63ff; }
  .terms-section { background: #fafafa; border-radius: 8px; padding: 24px; margin: 30px 0; border: 1px solid #eee; }
  .terms-section h3 { font-size: 16px; margin: 0 0 12px; color: #1a1a2e; }
  .terms-section p { font-size: 14px; color: #444; line-height: 1.7; margin: 0 0 8px; }
  .agreement { background: #fff8f0; border: 1px solid #ffd6a0; border-radius: 8px; padding: 20px; margin: 30px 0; }
  .agreement p { font-size: 13px; color: #8a6d3b; line-height: 1.6; margin: 0; }
  .signature-block { margin-top: 50px; padding-top: 30px; border-top: 1px solid #ddd; }
  .signature-block .sig-name { font-family: 'Georgia', serif; font-size: 32px; font-style: italic; color: #1a1a2e; margin-bottom: 4px; }
  .signature-block .sig-title { font-size: 14px; color: #666; }
  .signature-block .sig-date { font-size: 12px; color: #999; margin-top: 8px; }
  .footer { position: absolute; bottom: 0; left: 0; right: 0; background: #0f0f23; color: #a0a0c0; padding: 20px 60px; font-size: 12px; display: flex; justify-content: space-between; }
  .footer a { color: #6c63ff; text-decoration: none; }
</style></head>
<body>
<div class="page">
  <div class="header">
    <div class="logo-text">STU25</div>
    <div class="tagline">Creative Studio & Digital Agency</div>
  </div>
  <div class="divider"></div>
  <div class="body">
    <div class="proposal-title">Service Proposal</div>
    <div class="proposal-subtitle">Prepared for ${clientName} | ${dateStr}</div>

    <div class="section">
      <div class="section-label">Prepared For</div>
      <div class="section-value"><b>${clientName}</b><br/>${email}</div>
    </div>

    <div class="section">
      <div class="section-label">Service Description</div>
      <div class="section-value">${service}</div>
    </div>

    <div class="detail-grid">
      <div class="detail-box cost-box">
        <div class="label">Project Cost</div>
        <div class="value">${cost}</div>
      </div>
      <div class="detail-box">
        <div class="label">Deadline</div>
        <div class="value">${deadline}</div>
      </div>
    </div>

    <div class="terms-section">
      <h3>Payment Terms</h3>
      <p>${terms}</p>
    </div>

    <div class="agreement">
      <p><b>Agreement:</b> Any form of payment made towards this project shall constitute acceptance of this proposal and its terms, and shall serve as a binding signature on behalf of the client. By remitting payment, the client agrees to the scope of work, pricing, and terms outlined in this document.</p>
    </div>

    <div class="signature-block">
      <div class="sig-name">Warren Thompson</div>
      <div class="sig-title">Founder & Creative Director, STU25</div>
      <div class="sig-date">Signed: ${dateStr} at ${timeStr} PST</div>
    </div>
  </div>
  <div class="footer">
    <span>STU25.com | (702) 832-2317</span>
    <span>warren@stu25.com</span>
  </div>
</div>
</body>
</html>`
}

async function htmlToPdfBase64(_html: string, _supabaseUrl: string, _supabase: any): Promise<string> {
  // Legacy stub — replaced by buildStructuredPdf
  return ''
}

function buildStructuredPdfWithSignature(clientName: string, email: string, service: string, cost: string, terms: string, deadline: string, dateStr: string, timeStr: string, signatureImg: Uint8Array | null): Uint8Array {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const lines: string[] = []
  let y = 740

  // ── Header background ──
  lines.push('q 0.059 0.059 0.137 rg 0 692 612 100 re f Q')
  lines.push('q 0.424 0.388 1.0 rg 0 688 612 4 re f Q')
  lines.push(`BT /F2 28 Tf 1 0 0 1 72 755 Tm 1 1 1 rg (STU25) Tj ET`)
  lines.push(`BT /F1 10 Tf 1 0 0 1 72 733 Tm 0.63 0.63 0.75 rg (Creative Studio & Digital Agency) Tj ET`)
  lines.push(`BT /F1 10 Tf 1 0 0 1 72 717 Tm 0.63 0.63 0.75 rg (STU25.com  |  \\(702\\) 832-2317  |  warren@stu25.com) Tj ET`)
  lines.push('0 0 0 rg')
  y = 665

  // ── Title ──
  lines.push(`BT /F2 22 Tf 1 0 0 1 72 ${y} Tm (SERVICE PROPOSAL) Tj ET`)
  y -= 24
  lines.push(`BT /F1 11 Tf 1 0 0 1 72 ${y} Tm 0.4 0.4 0.4 rg (Prepared for ${esc(clientName)}  |  ${esc(dateStr)}) Tj ET`)
  y -= 20
  lines.push(`q 0.85 0.85 0.85 rg 72 ${y} 468 1 re f Q`)
  y -= 20
  lines.push('0 0 0 rg')

  // ── Client ──
  lines.push(`BT /F2 9 Tf 1 0 0 1 72 ${y} Tm 0.424 0.388 1.0 rg (PREPARED FOR) Tj ET`)
  y -= 18
  lines.push(`BT /F2 14 Tf 1 0 0 1 72 ${y} Tm 0 0 0 rg (${esc(clientName)}) Tj ET`)
  y -= 16
  lines.push(`BT /F1 11 Tf 1 0 0 1 72 ${y} Tm 0.3 0.3 0.3 rg (${esc(email)}) Tj ET`)
  y -= 24

  // ── Service ──
  lines.push(`BT /F2 9 Tf 1 0 0 1 72 ${y} Tm 0.424 0.388 1.0 rg (SERVICE DESCRIPTION) Tj ET`)
  y -= 18
  lines.push('0 0 0 rg')
  const wrapText = (txt: string, maxLen: number, sz: number, x: number, font = '/F1') => {
    const words = txt.split(' ')
    let cur = ''
    for (const w of words) {
      if ((cur + ' ' + w).length > maxLen) {
        lines.push(`BT ${font} ${sz} Tf 1 0 0 1 ${x} ${y} Tm (${esc(cur.trim())}) Tj ET`)
        y -= sz + 4
        cur = w
      } else { cur += ' ' + w }
    }
    if (cur.trim()) {
      lines.push(`BT ${font} ${sz} Tf 1 0 0 1 ${x} ${y} Tm (${esc(cur.trim())}) Tj ET`)
      y -= sz + 4
    }
  }
  wrapText(service, 80, 11, 72)
  y -= 8

  // ── Cost & Deadline boxes ──
  const boxTop = y + 8
  lines.push(`q 0.941 0.933 1.0 rg 72 ${boxTop - 55} 220 60 re f Q`)
  lines.push(`q 0.424 0.388 1.0 rg 72 ${boxTop - 55} 3 60 re f Q`)
  lines.push(`q 0.96 0.96 0.98 rg 310 ${boxTop - 55} 220 60 re f Q`)
  lines.push(`q 0.424 0.388 1.0 rg 310 ${boxTop - 55} 3 60 re f Q`)
  lines.push(`BT /F1 9 Tf 1 0 0 1 84 ${boxTop - 10} Tm 0.5 0.5 0.5 rg (PROJECT COST) Tj ET`)
  lines.push(`BT /F2 20 Tf 1 0 0 1 84 ${boxTop - 34} Tm 0.424 0.388 1.0 rg (${esc(cost)}) Tj ET`)
  lines.push(`BT /F1 9 Tf 1 0 0 1 322 ${boxTop - 10} Tm 0.5 0.5 0.5 rg (DEADLINE) Tj ET`)
  lines.push(`BT /F2 16 Tf 1 0 0 1 322 ${boxTop - 34} Tm 0.1 0.1 0.1 rg (${esc(deadline)}) Tj ET`)
  y = boxTop - 72

  // ── Payment Terms ──
  const termsBoxH = 70
  lines.push(`q 0.97 0.97 0.97 rg 72 ${y - termsBoxH + 10} 468 ${termsBoxH} re f Q`)
  lines.push(`q 0.9 0.9 0.9 rg 72 ${y + 10} 468 1 re f 72 ${y - termsBoxH + 10} 468 1 re f Q`)
  lines.push(`BT /F2 12 Tf 1 0 0 1 84 ${y} Tm 0 0 0 rg (Payment Terms) Tj ET`)
  y -= 20
  lines.push('0.27 0.27 0.27 rg')
  wrapText(terms, 72, 11, 84)
  y -= 12

  // ── Agreement ──
  const agText = 'Any form of payment made towards this project shall constitute acceptance of this proposal and its terms, and shall serve as a binding signature on behalf of the client. By remitting payment, the client agrees to the scope of work, pricing, and terms outlined herein.'
  const agH = 80
  lines.push(`q 1.0 0.973 0.941 rg 72 ${y - agH + 10} 468 ${agH} re f Q`)
  lines.push(`q 1.0 0.839 0.627 rg 72 ${y + 10} 468 1 re f 72 ${y - agH + 10} 468 1 re f Q`)
  lines.push(`BT /F2 11 Tf 1 0 0 1 84 ${y} Tm 0.54 0.43 0.23 rg (Agreement) Tj ET`)
  y -= 16
  lines.push('0.54 0.43 0.23 rg')
  wrapText(agText, 70, 9, 84)
  y -= 16

  // Ensure signature section stays on page
  if (y < 140) y = 140

  // ── Signature section ──
  lines.push(`q 0.85 0.85 0.85 rg 72 ${y + 4} 250 1 re f Q`)
  y -= 8

  // If we have the signature image, draw it; otherwise fall back to cursive font
  // Parse actual pixel dimensions to maintain aspect ratio
  let sigImgW = 200
  let sigImgH = 70
  if (signatureImg && signatureImg[0] === 0xFF && signatureImg[1] === 0xD8) {
    // Extract JPEG dimensions for aspect ratio
    let pw = 1, ph = 1
    let i = 2
    while (i < signatureImg.length - 8) {
      if (signatureImg[i] === 0xFF) {
        const m = signatureImg[i + 1]
        if (m >= 0xC0 && m <= 0xC3) {
          ph = (signatureImg[i + 5] << 8) | signatureImg[i + 6]
          pw = (signatureImg[i + 7] << 8) | signatureImg[i + 8]
          break
        }
        const sl = (signatureImg[i + 2] << 8) | signatureImg[i + 3]
        i += 2 + sl
      } else { i++ }
    }
    // Scale to fit 200pt wide, preserving aspect ratio
    sigImgH = Math.round(200 * (ph / pw))
    if (sigImgH > 100) sigImgH = 100 // cap height
    if (sigImgH < 30) sigImgH = 30
  }
  if (signatureImg) {
    lines.push(`q ${sigImgW} 0 0 ${sigImgH} 72 ${y - sigImgH + 20} cm /SigImg Do Q`)
    y -= sigImgH - 10
  } else {
    // Fallback: cursive text
    lines.push(`BT /F3 30 Tf 1 0 0 1 72 ${y} Tm 0.08 0.08 0.18 rg (Warren A Thompson) Tj ET`)
    y -= 10
  }

  // Purple accent underline
  lines.push(`q 0.424 0.388 1.0 rg 72 ${y} 220 2 re f Q`)
  y -= 18
  // Printed name
  lines.push(`BT /F2 12 Tf 1 0 0 1 72 ${y} Tm 0.1 0.1 0.2 rg (Warren A Thompson) Tj ET`)
  y -= 16
  lines.push(`BT /F1 11 Tf 1 0 0 1 72 ${y} Tm 0.4 0.4 0.4 rg (Founder & Creative Director, STU25) Tj ET`)
  y -= 16
  lines.push(`BT /F1 9 Tf 1 0 0 1 72 ${y} Tm 0.6 0.6 0.6 rg (Signed: ${esc(dateStr)} at ${esc(timeStr)} PST) Tj ET`)

  // ── Footer ──
  lines.push('q 0.059 0.059 0.137 rg 0 0 612 35 re f Q')
  lines.push(`BT /F1 9 Tf 1 0 0 1 72 12 Tm 0.63 0.63 0.75 rg (STU25.com  |  \\(702\\) 832-2317) Tj ET`)
  lines.push(`BT /F1 9 Tf 1 0 0 1 420 12 Tm 0.63 0.63 0.75 rg (warren@stu25.com) Tj ET`)

  const stream = lines.join('\n')
  const streamBytes = new TextEncoder().encode(stream)
  const streamLen = streamBytes.length

  // ── Build PDF with image XObject if signature image exists ──
  if (signatureImg && signatureImg.length > 0) {
    // Detect if JPEG by magic bytes
    const isJpeg = signatureImg[0] === 0xFF && signatureImg[1] === 0xD8
    const filter = isJpeg ? '/DCTDecode' : '/FlateDecode'
    const colorSpace = '/DeviceRGB'

    // Parse actual JPEG dimensions from SOF marker
    let imgPixelW = 1024, imgPixelH = 1024
    if (isJpeg) {
      let i = 2
      while (i < signatureImg.length - 8) {
        if (signatureImg[i] === 0xFF) {
          const marker = signatureImg[i + 1]
          // SOF0-SOF3 markers contain dimensions
          if (marker >= 0xC0 && marker <= 0xC3) {
            imgPixelH = (signatureImg[i + 5] << 8) | signatureImg[i + 6]
            imgPixelW = (signatureImg[i + 7] << 8) | signatureImg[i + 8]
            break
          }
          const segLen = (signatureImg[i + 2] << 8) | signatureImg[i + 3]
          i += 2 + segLen
        } else { i++ }
      }
    }

    const te = new TextEncoder()

    const obj1 = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n\n`
    const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n\n`
    const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n   /Contents 4 0 R\n   /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> /XObject << /SigImg 8 0 R >> >> >>\nendobj\n\n`
    const obj4pre = `4 0 obj\n<< /Length ${streamLen} >>\nstream\n`
    const obj4post = `\nendstream\nendobj\n\n`
    const obj5 = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n\n`
    const obj6 = `6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n\n`
    const obj7 = `7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /ZapfChancery-MediumItalic /Encoding /WinAnsiEncoding >>\nendobj\n\n`
    const obj8pre = `8 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgPixelW} /Height ${imgPixelH} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter ${filter} /Length ${signatureImg.length} >>\nstream\n`
    const obj8post = `\nendstream\nendobj\n\n`
    const trailer = `xref\n0 9\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000000 00000 n \n0000000000 00000 n \n0000000000 00000 n \n0000000000 00000 n \n0000000000 00000 n \n\ntrailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n0\n%%EOF`

    // Concatenate all parts as binary
    const parts = [
      te.encode(obj1), te.encode(obj2), te.encode(obj3),
      te.encode(obj4pre), streamBytes, te.encode(obj4post),
      te.encode(obj5), te.encode(obj6), te.encode(obj7),
      te.encode(obj8pre), signatureImg, te.encode(obj8post),
      te.encode(trailer)
    ]
    const totalLen = parts.reduce((a, p) => a + p.length, 0)
    const result = new Uint8Array(totalLen)
    let offset = 0
    for (const p of parts) {
      result.set(p, offset)
      offset += p.length
    }
    return result
  }

  // No signature image — text-only PDF
  const pdfText = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R
   /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> >>
endobj

4 0 obj
<< /Length ${streamLen} >>
stream
${stream}
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>
endobj

6 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>
endobj

7 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /ZapfChancery-MediumItalic /Encoding /WinAnsiEncoding >>
endobj

xref
0 8
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000290 00000 n 
0000000000 00000 n 
0000000000 00000 n 
0000000000 00000 n 

trailer
<< /Size 8 /Root 1 0 R >>
startxref
0
%%EOF`

  return new TextEncoder().encode(pdfText)
}

// ─── Audit Session: multi-step wizard (website → IG → generate) ───
async function processAuditSession(
  chatId: number,
  text: string,
  sessionId: string,
  sp: any,
  tgToken: string,
  supabaseUrl: string,
  supabase: any,
) {
  const step = sp.step || 'website'
  const data = sp.data || {}

  if (step === 'website') {
    const lower = text.trim().toLowerCase()
    if (lower === 'skip') {
      // Skip website, go to IG
      await supabase.from('webhook_events').update({
        payload: { ...sp, step: 'instagram', data: { ...data, website_url: null } },
      }).eq('id', sessionId)
      await tgPost(tgToken, 'sendMessage', {
        chat_id: chatId,
        text: '📱 <b>Step 2:</b> Enter the Instagram handle\n\n<i>Example: @somebrand or somebrand</i>\n<i>Type "skip" to skip Instagram too (at least one is needed).</i>',
        parse_mode: 'HTML',
      })
    } else {
      // Validate URL
      let url = text.trim()
      if (!url.startsWith('http')) url = 'https://' + url
      await supabase.from('webhook_events').update({
        payload: { ...sp, step: 'instagram', data: { ...data, website_url: url } },
      }).eq('id', sessionId)
      await tgPost(tgToken, 'sendMessage', {
        chat_id: chatId,
        text: `✅ Website: <code>${url}</code>\n\n📱 <b>Step 2:</b> Enter the Instagram handle\n\n<i>Example: @somebrand or somebrand</i>\n<i>Type "skip" to skip Instagram.</i>`,
        parse_mode: 'HTML',
      })
    }
    return
  }

  if (step === 'instagram') {
    const lower = text.trim().toLowerCase()
    let igHandle: string | null = null

    if (lower !== 'skip') {
      igHandle = text.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')
    }

    if (!data.website_url && !igHandle) {
      await tgPost(tgToken, 'sendMessage', {
        chat_id: chatId,
        text: '⚠️ You need at least a website URL or Instagram handle. Please enter an Instagram handle or type /audit to start over.',
        parse_mode: 'HTML',
      })
      return
    }

    // Start the audit
    await supabase.from('webhook_events').delete().eq('id', sessionId)

    const targets: string[] = []
    if (data.website_url) targets.push(`🌐 ${data.website_url}`)
    if (igHandle) targets.push(`📱 @${igHandle}`)

    await tgPost(tgToken, 'sendMessage', {
      chat_id: chatId,
      text: `🔍 <b>Starting Audit...</b>\n\n${targets.join('\n')}\n\n⏳ This takes 1-2 minutes. I'll scrape, analyze, and generate your PDF report.`,
      parse_mode: 'HTML',
    })

    try {
      const auditRes = await fetch(`${supabaseUrl}/functions/v1/audit-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')!}`,
          'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
        },
        body: JSON.stringify({
          website_url: data.website_url || null,
          ig_handle: igHandle || null,
          chat_id: String(chatId),
        }),
        signal: AbortSignal.timeout(180000), // 3 min timeout
      })

      const result = await auditRes.json()

      if (!auditRes.ok || result.error) {
        await tgPost(tgToken, 'sendMessage', {
          chat_id: chatId,
          text: `❌ <b>Audit failed:</b> ${result.error || 'Unknown error'}`,
          parse_mode: 'HTML',
        })
        return
      }

      // Send summary stats
      const statsLines: string[] = ['📊 <b>Audit Complete!</b>\n']
      if (result.website_scraped) statsLines.push('✅ Website scraped')
      if (result.ig_scraped && result.ig_data) {
        statsLines.push(`✅ Instagram: ${result.ig_data.followers?.toLocaleString()} followers | ${result.ig_data.engagement_rate} engagement`)
      }

      // Try to send PDF as document
      if (result.pdf_url) {
        statsLines.push(`\n📄 <a href="${result.pdf_url}">Download Full PDF Report</a>`)
        try {
          await tgPost(tgToken, 'sendDocument', {
            chat_id: chatId,
            document: result.pdf_url,
            caption: `📊 Digital Audit Report — ${igHandle ? '@' + igHandle : data.website_url || 'Client'}`,
          })
        } catch (e) {
          console.log('[audit-tg] Could not send PDF as document, sending link instead')
        }
      }

      await tgPost(tgToken, 'sendMessage', {
        chat_id: chatId,
        text: statsLines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      })

      // Send a truncated text preview
      if (result.report_text) {
        const preview = result.report_text.slice(0, 3500)
          .replace(/</g, '&lt;').replace(/>/g, '&gt;')
        await tgPost(tgToken, 'sendMessage', {
          chat_id: chatId,
          text: `<pre>${preview}</pre>\n\n<i>Full report in the PDF above ☝️</i>`,
          parse_mode: 'HTML',
        })
      }
    } catch (e: any) {
      console.error('[audit-tg] error:', e)
      await tgPost(tgToken, 'sendMessage', {
        chat_id: chatId,
        text: `❌ <b>Audit failed:</b> <code>${(e.message || String(e)).slice(0, 300)}</code>`,
        parse_mode: 'HTML',
      })
    }
    return
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
    // Check body for setup_webhook command
    const rawBody = await req.text()
    let parsedBody: any = {}
    try { parsedBody = JSON.parse(rawBody) } catch {}
    
    if (parsedBody?.setup_webhook === true) {
      const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-media-listener`
      
      // Delete existing webhook first to force allowed_updates refresh
      const delRes = await fetch(`${TG_API}${TG_TOKEN}/deleteWebhook`)
      const delText = await delRes.text()
      console.log('[webhook] deleteWebhook:', delText)
      
      // Re-set with channel_post included
      const whRes = await fetch(`${TG_API}${TG_TOKEN}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message', 'callback_query', 'channel_post'],
        }),
      })
      const whText = await whRes.text()
      console.log('[webhook] setWebhook result:', whText)
      
      const infoRes = await fetch(`${TG_API}${TG_TOKEN}/getWebhookInfo`)
      const infoText = await infoRes.text()
      console.log('[webhook] getWebhookInfo:', infoText)
      
      return new Response(JSON.stringify({ deleteWebhook: JSON.parse(delText), setWebhook: JSON.parse(whText), webhookInfo: JSON.parse(infoText) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    ensureBotCommandsBg(TG_TOKEN) // non-blocking

    console.log('[tg] in:', rawBody.slice(0, 150))
    const update = parsedBody

    // ─── NEW MEMBER WELCOME for Shill Lounge (-1002188568751) ───
    const SHILL_LOUNGE_ID = -1002188568751
    if (update.message?.new_chat_members && update.message.chat.id === SHILL_LOUNGE_ID) {
      const newMembers = update.message.new_chat_members
      for (const member of newMembers) {
        if (member.is_bot) continue
        const firstName = member.first_name || 'there'
        const welcomeText =
          `👋 *Welcome, ${firstName}!*\n\n` +
          `This Telegram group is the *Shill Lounge* — a place to hang out and stay updated on alerts.\n\n` +
          `🔨 *Real work happens in Discord!*\n` +
          `Want to become a *RAIDER* or *SHILLER*? Head over to Discord and open a ticket:\n\n` +
          `👉 [Join Discord](https://discord.gg/warrenguru)\n\n` +
          `💰 Shillers earn per verified click\n` +
          `⚔️ Raiders earn $0.02 per verified raid\n\n` +
          `See you in the trenches! 🚀`
        await tgPost(TG_TOKEN, 'sendMessage', {
          chat_id: SHILL_LOUNGE_ID,
          text: welcomeText,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        })
      }
      return new Response('ok')
    }

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

      // ─── SMM Generate AI callback ───
      if (cbData === 'smm_gen_yes' || cbData === 'smm_gen_no') {
        if (cbData === 'smm_gen_no') {
          await tgPost(TG_TOKEN, 'editMessageText', {
            chat_id: cbChatId,
            message_id: cbq.message.message_id,
            text: '👍 No problem — you can generate media anytime from the app or by typing "generate media" here.',
          })
          return new Response('ok')
        }

        // Yes — trigger smm-media-gen for the full week
        await tgPost(TG_TOKEN, 'editMessageText', {
          chat_id: cbChatId,
          message_id: cbq.message.message_id,
          text: '🎨 <b>Generating media for the week...</b>\n\n<i>This may take a few minutes. I\'ll notify you when it\'s done.</i>',
          parse_mode: 'HTML',
        })

        try {
          // Get dates for the next 7 days
          const dates: string[] = []
          const now = new Date()
          for (let i = 0; i <= 7; i++) {
            const d = new Date(now)
            d.setDate(d.getDate() + i)
            dates.push(d.toISOString().split('T')[0])
          }

          const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
          const genRes = await fetch(`${SUPABASE_URL}/functions/v1/smm-media-gen`, {
            method: 'POST',
            headers: {
              'apikey': ANON_KEY,
              'Authorization': `Bearer ${ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ force_dates: dates }),
          })
          const genResult = await genRes.json()

          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: cbChatId,
            text: `✅ <b>Media generation complete!</b>\n\n${genResult?.message || `Generated ${genResult?.generated || 0} asset(s)`}`,
            parse_mode: 'HTML',
          })
        } catch (e: any) {
          console.error('[smm-gen-tg] error:', e)
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: cbChatId,
            text: `❌ Media generation failed: ${e.message}`,
          })
        }
        return new Response('ok')
      }

      // ─── SMM mode selection callbacks ───
      if (cbData === 'smm_mode_prompt' || cbData === 'smm_mode_strategist') {
        // Clean up any old SMM sessions
        await supabase.from('webhook_events').delete()
          .eq('source', 'telegram').in('event_type', ['smm_session', 'smm_strategist_session'])
          .filter('payload->>chat_id', 'eq', String(cbChatId))

        if (cbData === 'smm_mode_prompt') {
          await supabase.from('webhook_events').insert({
            source: 'telegram',
            event_type: 'smm_session',
            payload: { chat_id: cbChatId, history: [], created: Date.now() },
          })
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: cbChatId,
            text: '📝 <b>SMM Prompt Mode</b> activated!\n\nDirect commands for posting, scheduling, and analytics.\n\n<i>Try: "Post about our new website launch on X"</i>',
            parse_mode: 'HTML',
          })
        } else {
          await supabase.from('webhook_events').insert({
            source: 'telegram',
            event_type: 'smm_strategist_session',
            payload: { chat_id: cbChatId, history: [], created: Date.now(), profile: 'STU25', platform: 'instagram' },
          })
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: cbChatId,
            text: '🧠 <b>Cortex SMM Strategist</b> activated!\n\nI\'ll help you build a full content strategy. Conversations sync in real-time with the web app.\n\n<i>Tell me about your brand and what platforms you want to plan for.</i>',
            parse_mode: 'HTML',
          })
        }
        return new Response('ok')
      }

      // ─── SHILL TIMING callbacks ───
      if (cbData === 'shill_timing_now' || cbData === 'shill_timing_schedule') {
        const { data: shillSessions } = await supabase.from('webhook_events')
          .select('id, payload')
          .eq('source', 'telegram').eq('event_type', 'shill_session')
          .filter('payload->>chat_id', 'eq', String(cbChatId))
          .eq('processed', false).limit(1)
        const ss = shillSessions?.[0]
        if (ss) {
          const ssp = ss.payload as any
          const timing = cbData === 'shill_timing_now' ? 'now' : 'schedule'
          await supabase.from('webhook_events').update({
            payload: { ...ssp, step: 'video', timing },
          }).eq('id', ss.id)
          const label = timing === 'now' ? '🚀 Got it — posting immediately after upload.' : '📅 Got it — video will be scheduled (max 3/hour, randomized times).'
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: cbChatId,
            text: `${label}\n\n📹 Now upload the video.`,
            parse_mode: 'HTML',
          })
        }
        return new Response('ok')
      }

      // ─── SHILL X TIMING callbacks ───
      if (cbData === 'shill_x_timing_now' || cbData === 'shill_x_timing_schedule') {
        const { data: sxSessions } = await supabase.from('webhook_events')
          .select('id, payload')
          .eq('source', 'telegram').eq('event_type', 'shill_x_session')
          .filter('payload->>chat_id', 'eq', String(cbChatId))
          .eq('processed', false).limit(1)
        const sx = sxSessions?.[0]
        if (sx) {
          const sxp = sx.payload as any
          const timing = cbData === 'shill_x_timing_now' ? 'now' : 'schedule'
          await supabase.from('webhook_events').update({
            payload: { ...sxp, step: 'video', timing },
          }).eq('id', sx.id)
          const label = timing === 'now' ? '🚀 Got it — posting immediately after upload.' : '📅 Got it — video will be scheduled.'
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: cbChatId,
            text: `${label}\n\n📹 Now upload the video.`,
            parse_mode: 'HTML',
          })
        }
        return new Response('ok')
      }

      // ─── SHILL NOW copy callback ───
      if (cbData === 'shill_copy') {
        const { data: shillConfigs } = await supabase
          .from('site_configs')
          .select('content, section')
          .eq('site_id', 'smm-auto-shill')

        const enabledCfg = shillConfigs?.find((r: any) => (r.content as any)?.enabled)
        const shillContent = enabledCfg?.content as any
        const campaignUrl = shillContent?.campaign_url || ''
        const ticker = shillContent?.ticker || ''

        if (!ticker) {
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: cbChatId,
            text: '⚠️ No ticker configured in Auto Shill settings.',
          })
          return new Response('ok')
        }

        const tickerClean = ticker.replace(/^\$/, '')
        const copyText = `${ticker} #${tickerClean} #repost` +
          (campaignUrl ? `\n${campaignUrl}` : '')

        await tgPost(TG_TOKEN, 'sendMessage', {
          chat_id: cbChatId,
          text: `📋 <b>Shill Copy — tap to copy:</b>\n\n<code>${copyText}</code>`,
          parse_mode: 'HTML',
        })
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

    // ─── CHANNEL POST: Market Cap Alerts from channel ───
    const channelPost = update.channel_post
    if (channelPost && channelPost.chat?.id === MCAP_ALERT_CHANNEL_ID) {
      const cpText = (channelPost.text || channelPost.caption || '').trim()
      if (cpText) {
        try {
          // Look for "crossed" milestone pattern
          const crossedMatch = cpText.match(/crossed\s*\$?([\d,.]+)\s*k?/i)
          if (crossedMatch) {
            // Extract CA — check pumpfun/<ca> pattern first, then raw base58
            const pumpfunMatch = cpText.match(/pumpfun\/([1-9A-HJ-NP-Za-km-z]{32,44})/i)
            const rawCaMatch = cpText.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/)
            const ca = pumpfunMatch ? pumpfunMatch[1] : (rawCaMatch ? rawCaMatch[0] : '')
            
            // Parse milestone value
            let rawVal = crossedMatch[1].replace(/,/g, '')
            let milestoneValue = parseFloat(rawVal)
            // If value looks like "30" or "50" (shorthand for 30k, 50k)
            if (milestoneValue < 1000) milestoneValue *= 1000
            
            // Determine milestone label
            let milestone = '30k'
            if (milestoneValue >= 100000) milestone = '100k+'
            else if (milestoneValue >= 90000) milestone = '90k'
            else if (milestoneValue >= 80000) milestone = '80k'
            else if (milestoneValue >= 70000) milestone = '70k'
            else if (milestoneValue >= 60000) milestone = '60k'
            else if (milestoneValue >= 50000) milestone = '50k'
            else if (milestoneValue >= 40000) milestone = '40k'
            
            // Extract token name/symbol if present
            const symbolMatch = cpText.match(/\$([A-Z]{2,10})/i)
            let tokenSymbol = symbolMatch ? symbolMatch[1] : null
            let tokenName: string | null = null

            // DexScreener lookup for ticker AND token name
            if (ca) {
              try {
                const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`)
                if (dexRes.ok) {
                  const dexData = await dexRes.json()
                  const pair = dexData?.pairs?.[0]
                  if (pair?.baseToken) {
                    if (!tokenSymbol && pair.baseToken.symbol) {
                      tokenSymbol = pair.baseToken.symbol
                    }
                    tokenName = pair.baseToken.name || null
                    console.log(`[mcap] DexScreener resolved: $${tokenSymbol} (${tokenName}) for ${ca.slice(0, 8)}...`)
                  }
                }
              } catch (e) {
                console.log(`[mcap] DexScreener lookup failed for ${ca.slice(0, 8)}...`)
              }
            }
            
            // Check for legacy j7tracker in message text (now called LORE)
            const isJ7Tracker = cpText.toLowerCase().includes('j7tracker')
            
            // URLs
            const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi
            const urls = (cpText.match(urlRegex) || []) as string[]
            const sourceUrl = urls[0] || ''
            
            if (ca) {
              // Only accept pump.fun tokens (CA ends with "pump")
              if (!ca.toLowerCase().endsWith('pump')) {
                console.log(`[mcap] Skipping non-pump CA: ${ca.slice(0, 8)}...`)
              } else {
              // Dedup by CA + milestone within 5 min
              const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
              const { data: existing } = await supabase.from('market_cap_alerts')
                .select('id')
                .eq('ca_address', ca)
                .eq('milestone', milestone)
                .gte('created_at', fiveMinAgo)
                .limit(1)
              
              if (!existing || existing.length === 0) {
                const { data: inserted } = await supabase.from('market_cap_alerts').insert({
                  ca_address: ca,
                  token_symbol: tokenSymbol,
                  token_name: tokenName,
                  milestone,
                  milestone_value: milestoneValue,
                  raw_message: cpText.slice(0, 1000),
                  source_url: sourceUrl,
                  is_j7tracker: isJ7Tracker,
                  telegram_channel_id: MCAP_ALERT_CHANNEL_ID,
                }).select('id').single()
                
                console.log(`[mcap] Stored alert: ${ca.slice(0, 8)}... crossed ${milestone} (j7: ${isJ7Tracker})`)
                
                // Auto-audit if 50K+ crossed
                if (milestoneValue >= 50000 && inserted?.id) {
                  // Fire-and-forget audit
                  fetch(`${SUPABASE_URL}/functions/v1/moralis-audit`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                      'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
                    },
                    body: JSON.stringify({ ca_address: ca, alert_id: inserted.id }),
                  }).catch(e => console.error('[mcap] auto-audit error:', e))
              }
              } // end pump filter else
            }
          }
          }
        } catch (e: any) {
          console.error('[mcap] channel parse error:', e)
        }
      }
      return new Response('ok')
    }

    // ─── CHANNEL POST: KOL Group CA extraction ───
    if (channelPost && channelPost.chat?.id === KOL_CHANNEL_ID) {
      const cpText = (channelPost.text || channelPost.caption || '').trim()
      if (cpText) {
        try {
          // Extract any Solana CA addresses (base58, 32-44 chars)
          const pumpfunMatch = cpText.match(/pumpfun\/([1-9A-HJ-NP-Za-km-z]{32,44})/i)
          const rawCaMatch = cpText.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/)
          const ca = pumpfunMatch ? pumpfunMatch[1] : (rawCaMatch ? rawCaMatch[0] : '')

          if (ca) {
              // Only accept pump.fun tokens (CA ends with "pump")
              if (!ca.toLowerCase().endsWith('pump')) {
                console.log(`[kol] Skipping non-pump CA: ${ca.slice(0, 8)}...`)
              } else {
            // Extract token symbol if present in text
            const symbolMatch = cpText.match(/\$([A-Z]{2,10})/i)
            let tokenSymbol = symbolMatch ? symbolMatch[1] : null
            let tokenName: string | null = null

            // DexScreener lookup for missing ticker AND token name
            if (!tokenSymbol) {
              try {
                const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`)
                if (dexRes.ok) {
                  const dexData = await dexRes.json()
                  const pair = dexData?.pairs?.[0]
                  if (pair?.baseToken?.symbol) {
                    tokenSymbol = pair.baseToken.symbol
                    tokenName = pair.baseToken.name || null
                    console.log(`[kol] DexScreener resolved: $${tokenSymbol} (${tokenName}) for ${ca.slice(0, 8)}...`)
                  }
                }
              } catch (e) {
                console.log(`[kol] DexScreener lookup failed for ${ca.slice(0, 8)}...`)
              }
            } else {
              // We have a ticker but still need the name
              try {
                const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`)
                if (dexRes.ok) {
                  const dexData = await dexRes.json()
                  const pair = dexData?.pairs?.[0]
                  if (pair?.baseToken?.name) {
                    tokenName = pair.baseToken.name
                    console.log(`[kol] DexScreener resolved name: ${tokenName} for $${tokenSymbol}`)
                  }
                }
              } catch (e) {
                console.log(`[kol] DexScreener name lookup failed for ${ca.slice(0, 8)}...`)
              }
            }

            // Parse milestone from text if present, default to 30k
            const crossedMatch = cpText.match(/crossed\s*\$?([\d,.]+)\s*k?/i)
            let milestoneValue = 30000
            let milestone = '30k'
            if (crossedMatch) {
              let rawVal = crossedMatch[1].replace(/,/g, '')
              milestoneValue = parseFloat(rawVal)
              if (milestoneValue < 1000) milestoneValue *= 1000
              if (milestoneValue >= 100000) milestone = '100k+'
              else if (milestoneValue >= 90000) milestone = '90k'
              else if (milestoneValue >= 80000) milestone = '80k'
              else if (milestoneValue >= 70000) milestone = '70k'
              else if (milestoneValue >= 60000) milestone = '60k'
              else if (milestoneValue >= 50000) milestone = '50k'
              else if (milestoneValue >= 40000) milestone = '40k'
            }

            // URLs — always ensure a pump.fun link for KOL alerts
            const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi
            const urls = (cpText.match(urlRegex) || []) as string[]
            const sourceUrl = urls[0] || `https://pump.fun/${ca}`

            // Dedup by CA within 5 min
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
            const { data: existing } = await supabase.from('market_cap_alerts')
              .select('id')
              .eq('ca_address', ca)
              .eq('is_kol', true)
              .gte('created_at', fiveMinAgo)
              .limit(1)

            if (!existing || existing.length === 0) {
              await supabase.from('market_cap_alerts').insert({
                ca_address: ca,
                token_symbol: tokenSymbol,
                token_name: tokenName,
                milestone,
                milestone_value: milestoneValue,
                raw_message: cpText.slice(0, 1000),
                source_url: sourceUrl,
                is_kol: true,
                telegram_channel_id: KOL_CHANNEL_ID,
              })
              console.log(`[kol] Stored KOL alert: ${ca.slice(0, 8)}... ${milestone}`)

              // Send to Discord KOL webhook
              const discordKolUrl = Deno.env.get('DISCORD_KOL_WEBHOOK_URL')
              if (discordKolUrl) {
                const sym = tokenSymbol ? ` $${tokenSymbol}` : ''
                const discordMsg = `🟡 KOL Alert: ${ca}${sym} — ${milestone}`
                fetch(discordKolUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ content: discordMsg }),
                }).catch(e => console.error('[discord-kol] webhook error:', e))
              }
             }
              } // end pump filter else
           }
         } catch (e: any) {
          console.error('[kol] channel parse error:', e)
        }
      }
      return new Response('ok')
    }

    // ─── CHANNEL POST: Gainers (Take Profit alerts) ───
    if (channelPost && channelPost.chat?.id === GAINERS_CHANNEL_ID) {
      const cpText = (channelPost.text || channelPost.caption || '').trim()
      if (cpText) {
        try {
          // Look for "take profit #N" pattern
          const tpMatch = cpText.match(/take\s*profit\s*#?(\d+)/i)
          if (tpMatch) {
            const tpNumber = parseInt(tpMatch[1])

            // Track ALL TPs (TP#1+) — visual urgency scales at TP#5+ and TP#10+
            // No hard gate — every TP is stored for full progression tracking
            
            // Extract CA — check pumpfun/<ca> pattern first, then raw base58
            const pumpfunMatch = cpText.match(/pumpfun\/([1-9A-HJ-NP-Za-km-z]{32,44})/i)
            const rawCaMatch = cpText.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/)
            const ca = pumpfunMatch ? pumpfunMatch[1] : (rawCaMatch ? rawCaMatch[0] : '')
            
            if (ca) {
              // Only accept pump.fun tokens (CA ends with "pump")
              if (!ca.toLowerCase().endsWith('pump')) {
                console.log(`[gainers] Skipping non-pump CA: ${ca.slice(0, 8)}...`)
                return new Response('ok')
              }
              {
              // Extract token symbol if present
              const symbolMatch = cpText.match(/\$([A-Z]{2,10})/i)
              let tokenSymbol = symbolMatch ? symbolMatch[1] : null
              let tokenName: string | null = null

              // DexScreener lookup for ticker AND token name
              try {
                const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`)
                if (dexRes.ok) {
                  const dexData = await dexRes.json()
                  const pair = dexData?.pairs?.[0]
                  if (pair?.baseToken) {
                    if (!tokenSymbol && pair.baseToken.symbol) {
                      tokenSymbol = pair.baseToken.symbol
                    }
                    tokenName = pair.baseToken.name || null
                    console.log(`[gainers] DexScreener resolved: $${tokenSymbol} (${tokenName}) for ${ca.slice(0, 8)}...`)
                  }
                }
              } catch (e) {
                console.log(`[gainers] DexScreener lookup failed for ${ca.slice(0, 8)}...`)
              }

              // URLs
              const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi
              const urls = (cpText.match(urlRegex) || []) as string[]
              const sourceUrl = urls[0] || `https://pump.fun/${ca}`
              
              // Use milestone field to track take profit level
              const milestone = `TP#${tpNumber}`
              const milestoneValue = tpNumber * 10000 // TP#1=10k, TP#2=20k, etc.
              
              // Dedup by CA + milestone within 5 min
              const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
              const { data: existing } = await supabase.from('market_cap_alerts')
                .select('id')
                .eq('ca_address', ca)
                .eq('milestone', milestone)
                .gte('created_at', fiveMinAgo)
                .limit(1)
              
              if (!existing || existing.length === 0) {
                const isTopGainer = tpNumber >= 10
                const { data: insertedAlert, error: insertErr } = await supabase.from('market_cap_alerts').upsert({
                  ca_address: ca,
                  token_symbol: tokenSymbol,
                  token_name: tokenName,
                  milestone,
                  milestone_value: milestoneValue,
                  raw_message: cpText.slice(0, 1000),
                  source_url: sourceUrl,
                  is_kol: false,
                  is_j7tracker: false,
                  telegram_channel_id: GAINERS_CHANNEL_ID,
                  is_top_gainer: isTopGainer,
                }, { onConflict: 'ca_address,milestone', ignoreDuplicates: true }).select('id').single()
                if (insertErr && insertErr.code !== 'PGRST116') {
                  console.error(`[gainers] Insert error:`, insertErr.message)
                  return new Response('ok')
                }
                if (!insertedAlert) {
                  console.log(`[gainers] Dedup: TP#${tpNumber} ${ca.slice(0, 8)}... already exists`)
                  return new Response('ok')
                }
                console.log(`[gainers] Stored TP#${tpNumber} alert: ${ca.slice(0, 8)}...`)

                // LORE check for TP5+ alerts (fire-and-forget)
                if (tpNumber >= 5 && insertedAlert?.id) {
                  try {
                    const loreUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/lore-check`
                    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
                    fetch(loreUrl, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'apikey': anonKey,
                        'Authorization': `Bearer ${anonKey}`,
                      },
                      body: JSON.stringify({ ca_address: ca, alert_id: insertedAlert.id }),
                    }).catch(e => console.error(`[gainers] LORE check error:`, e.message))
                    console.log(`[gainers] LORE check triggered for TP#${tpNumber}: ${ca.slice(0, 8)}...`)
                  } catch (e: any) {
                    console.error(`[gainers] LORE trigger error:`, e.message)
                  }
                }

                // Send CA to Discord webhook for TP#10+ alerts
                if (tpNumber >= 10) {
                  const discordWebhookUrl = Deno.env.get('DISCORD_TP8_WEBHOOK_URL')
                  if (discordWebhookUrl) {
                    try {
                      const discordMsg = ca
                      await fetch(discordWebhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: discordMsg }),
                      })
                      console.log(`[gainers] Sent TP#${tpNumber} to Discord: ${ca.slice(0, 8)}...`)
                    } catch (discordErr: any) {
                      console.error(`[gainers] Discord webhook error:`, discordErr.message)
                    }
                  }
                  // Auto-trigger full Moralis audit for TP10+ (Top Gainers)
                  if (isTopGainer && insertedAlert?.id) {
                    try {
                      const auditUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/moralis-audit`
                      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
                      await fetch(auditUrl, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'apikey': anonKey,
                          'Authorization': `Bearer ${anonKey}`,
                        },
                        body: JSON.stringify({ ca_address: ca, alert_id: insertedAlert.id }),
                      })
                      console.log(`[gainers] Auto-audit triggered for TP#${tpNumber}: ${ca.slice(0, 8)}...`)
                    } catch (auditErr: any) {
                      console.error(`[gainers] Auto-audit error:`, auditErr.message)
                    }
                  }
                }
              }
              } // end pump filter block
            }
          }
        } catch (e: any) {
          console.error('[gainers] channel parse error:', e)
        }
      }
      return new Response('ok')
    }

    // ─── CHANNEL POST: Meta Narrative Channel ───
    if (channelPost && channelPost.chat?.id === META_CHANNEL_ID) {
      const cpText = (channelPost.text || channelPost.caption || '').trim()
      console.log(`[meta] Channel post received (len=${cpText.length}): ${cpText.slice(0, 100)}`)
      if (cpText && cpText.length > 10) {
        try {
          const metaRes = await fetch(`${SUPABASE_URL}/functions/v1/meta-extract`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')!}`,
            },
            body: JSON.stringify({
              message: cpText.slice(0, 2000),
              message_id: String(channelPost.message_id || ''),
            }),
          })
          const metaBody = await metaRes.text()
          console.log(`[meta] extract response ${metaRes.status}: ${metaBody.slice(0, 200)}`)
        } catch (e: any) {
          console.error('[meta] extract error:', e.message || e)
        }
      }
      return new Response('ok')
    }

    // ─── CHANNEL POST: X Feed from channel ───
    if (channelPost && channelPost.chat?.id === X_FEED_CHANNEL_ID) {
      const cpText = (channelPost.text || channelPost.caption || '').trim()
      if (cpText) {
        try {
          const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi
          const allUrls = (cpText.match(urlRegex) || []) as string[]
          const sourceUrls = allUrls.filter((u: string) => !u.includes('discord.gg'))
          const sourceUrl = sourceUrls[0] || ''
          const mediaExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm']
          const mediaUrl = sourceUrls.find((u: string) => mediaExts.some(ext => u.toLowerCase().includes(ext))) || ''

          let authorUsername = ''
          let authorDisplayName = ''

          if (channelPost.forward_origin) {
            const origin = channelPost.forward_origin as any
            if (origin.type === 'channel') {
              authorUsername = origin.chat?.username || origin.chat?.title || ''
              authorDisplayName = origin.chat?.title || authorUsername
            } else if (origin.type === 'user') {
              authorUsername = origin.sender_user?.username || ''
              authorDisplayName = [origin.sender_user?.first_name, origin.sender_user?.last_name].filter(Boolean).join(' ') || authorUsername
            }
          } else if (channelPost.forward_from_chat) {
            authorUsername = (channelPost.forward_from_chat as any).username || (channelPost.forward_from_chat as any).title || ''
            authorDisplayName = (channelPost.forward_from_chat as any).title || authorUsername
          } else if (channelPost.forward_from) {
            authorUsername = (channelPost.forward_from as any).username || ''
            authorDisplayName = [(channelPost.forward_from as any).first_name, (channelPost.forward_from as any).last_name].filter(Boolean).join(' ') || authorUsername
          }

          const twitterHandleMatch = cpText.match(/@(\w{1,15})/) || sourceUrl.match(/(?:twitter\.com|x\.com)\/(\w+)/)
          if (twitterHandleMatch && !authorUsername) {
            authorUsername = twitterHandleMatch[1]
            authorDisplayName = authorDisplayName || authorUsername
          }

          if (!authorUsername) {
            authorUsername = (channelPost.from as any)?.username || (channelPost.sender_chat as any)?.username || 'feed'
            authorDisplayName = (channelPost.sender_chat as any)?.title || (channelPost.from as any)?.first_name || authorUsername
          }

          const cleanText = cpText.replace(urlRegex, '').replace(/<[^>]*>/g, '').trim()

          if (cleanText || sourceUrl) {
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
            const { data: existing } = await supabase.from('x_feed_tweets')
              .select('id')
              .eq('raw_message', cpText.slice(0, 500))
              .gte('created_at', fiveMinAgo)
              .limit(1)

            if (!existing || existing.length === 0) {
              let tgMediaUrl = mediaUrl
              if (!tgMediaUrl && channelPost.photo) {
                const photos = channelPost.photo as any[]
                const largest = photos[photos.length - 1]
                if (largest?.file_id) {
                  const fileRes = await fetch(`${TG_API}${TG_TOKEN}/getFile`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file_id: largest.file_id }),
                  })
                  const fileData = await fileRes.json()
                  if (fileData.result?.file_path) {
                    tgMediaUrl = `https://api.telegram.org/file/bot${TG_TOKEN}/${fileData.result.file_path}`
                  }
                }
              }

              // If still no media, try fetching OG image from source URL
              if (!tgMediaUrl && sourceUrl) {
                try {
                  const ogRes = await fetch(sourceUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bot)' },
                    redirect: 'follow',
                    signal: AbortSignal.timeout(8000),
                  })
                  if (ogRes.ok) {
                    const html = await ogRes.text()
                    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
                      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
                      || html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
                      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i)
                    if (ogMatch?.[1]) {
                      tgMediaUrl = ogMatch[1]
                      console.log(`[x-feed] OG image found for ${sourceUrl}: ${tgMediaUrl.slice(0, 80)}`)
                    }
                  }
                } catch (ogErr: any) {
                  console.log(`[x-feed] OG fetch skipped for ${sourceUrl}: ${ogErr.message?.slice(0, 60)}`)
                }
              }

              await supabase.from('x_feed_tweets').insert({
                tweet_text: cleanText || sourceUrl,
                author_username: authorUsername.replace('@', ''),
                author_display_name: authorDisplayName,
                source_url: sourceUrl,
                media_url: tgMediaUrl,
                raw_message: cpText.slice(0, 500),
              })

              console.log(`[x-feed] Stored channel post from @${authorUsername}: "${(cleanText || sourceUrl).slice(0, 60)}"`)
            }
          }
        } catch (e: any) {
          console.error('[x-feed] channel parse error:', e)
        }
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

    // Shill Lounge: bot is forwarding-only, ignore all user commands/messages
    // SHILL_LOUNGE_ID already declared above
    if (isGroup && chatId === SHILL_LOUNGE_ID) {
      // new_chat_members is handled above; everything else is ignored
      return new Response('ok')
    }

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

    // ─── Unified Reply Router: auto-detect GVoice vs Gmail → route to correct sender ───
    // If original Telegram notification contains "Google Voice" → warrenthecreativeyt@gmail.com
    // Everything else → warren@stu25.com
    if (text && (!isGroup || isAllowedGroup) && message.reply_to_message) {
      const repliedMsgId = message.reply_to_message.message_id
      const repliedText = message.reply_to_message.text || ''
      const isGVoice = /google\s*voice/i.test(repliedText)

      let recipientAddr = ''
      let threadId = ''
      let gmailId = ''
      let replyTo = ''
      let matched = false

      if (isGVoice) {
        // ── GVoice: check communications (type=phone, provider=gvoice-poll) ──
        const { data: gvComm } = await supabase
          .from('communications')
          .select('id, from_address, metadata, phone_number')
          .eq('type', 'phone')
          .eq('direction', 'inbound')
          .eq('provider', 'gvoice-poll')
          .filter('metadata->>telegram_message_id', 'eq', String(repliedMsgId))
          .limit(1)

        if (gvComm && gvComm.length > 0) {
          const comm = gvComm[0]
          const meta = comm.metadata as any
          recipientAddr = comm.phone_number || comm.from_address || 'unknown'
          threadId = meta?.thread_id || ''
          gmailId = meta?.gmail_id || ''
          replyTo = meta?.reply_to || ''
          matched = true
        } else {
          const { data: weMatch } = await supabase
            .from('webhook_events')
            .select('payload')
            .eq('source', 'gvoice-poll')
            .eq('event_type', 'gvoice_forwarded')
            .filter('payload->>telegram_message_id', 'eq', String(repliedMsgId))
            .limit(1)
          if (weMatch && weMatch.length > 0) {
            const wp = weMatch[0].payload as any
            recipientAddr = wp?.phone || 'unknown'
            threadId = wp?.thread_id || ''
            gmailId = wp?.gmail_id || ''
            replyTo = wp?.reply_to || ''
            matched = true
          }
        }
      } else {
        // ── Gmail: check communications (type=email, provider=gmail) ──
        const { data: gmailComm } = await supabase
          .from('communications')
          .select('id, from_address, subject, metadata, customer_id')
          .eq('type', 'email')
          .eq('direction', 'inbound')
          .eq('provider', 'gmail')
          .filter('metadata->>telegram_message_id', 'eq', String(repliedMsgId))
          .limit(1)

        if (gmailComm && gmailComm.length > 0) {
          const comm = gmailComm[0]
          const meta = comm.metadata as any
          recipientAddr = comm.from_address || 'unknown'
          threadId = meta?.gmail_thread_id || ''
          gmailId = meta?.gmail_id || comm.id
          matched = true
        } else {
          const { data: weMatch } = await supabase
            .from('webhook_events')
            .select('payload')
            .eq('source', 'gmail')
            .eq('event_type', 'email_notification')
            .filter('payload->>telegram_message_id', 'eq', String(repliedMsgId))
            .limit(1)
          if (weMatch && weMatch.length > 0) {
            const wp = weMatch[0].payload as any
            recipientAddr = wp?.from || 'unknown'
            threadId = wp?.gmail_thread_id || ''
            gmailId = wp?.gmail_id || ''
            matched = true
          }
        }
      }

      if (matched) {
        const sendingVia = isGVoice ? 'WarrentheCreativeyt@gmail.com' : 'warren@stu25.com'
        const icon = isGVoice ? '💬' : '📨'
        await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `${icon} Replying to ${recipientAddr} via ${sendingVia}...` })

        try {
          let replyRes: Response
          if (isGVoice) {
            replyRes = await fetch(`${SUPABASE_URL}/functions/v1/gvoice-poll?action=reply`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': Deno.env.get('SUPABASE_ANON_KEY')! },
              body: JSON.stringify({ thread_id: threadId, gmail_id: gmailId, message: text, phone: recipientAddr, reply_to: replyTo }),
            })
          } else {
            replyRes = await fetch(`${SUPABASE_URL}/functions/v1/gmail-poll?action=reply`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': Deno.env.get('SUPABASE_ANON_KEY')! },
              body: JSON.stringify({ thread_id: threadId, gmail_id: gmailId, message: text, to_email: recipientAddr }),
            })
          }
          const replyData = await replyRes.json()
          if (!replyRes.ok || replyData?.error) {
            await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `❌ Reply failed: ${replyData?.error || 'Unknown error'}` })
          } else {
            await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `✅ Reply sent to ${recipientAddr} via ${sendingVia}` })
          }
        } catch (e: any) {
          console.error('[unified-reply] error:', e)
          await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `❌ Failed to send reply: ${e.message}` })
        }
        return new Response('ok')
      }
    }

    // ─── Check for persistent button / slash command BEFORE reply guard ───
    const action = resolvePersistentAction(text)

    // ─── If this is a reply-to-message and no button/command matched, stay silent ───
    // This prevents the bot from treating replies as session input
    if (message.reply_to_message && (!isGroup || isAllowedGroup) && !action) {
      return new Response('ok')
    }

    // Session types we track (moved to module-level constants for performance)
    const ALL_SESSIONS = ['assistant_session', 'invoice_session', 'smm_session', 'smm_strategist_session', 'customer_session', 'calendar_session', 'meeting_session', 'calendly_session', 'custom_session', 'webdev_session', 'banana_session', 'banana2_session', 'higgsfield_session', 'xpost_session', 'email_session', 'proposal_session', 'audit_session', 'shill_session', 'shill_x_session']
    const ALL_REPLY_SESSIONS = ['assistant_session', 'invoice_session', 'smm_session', 'smm_strategist_session', 'customer_session', 'calendar_session', 'meeting_session', 'calendly_session', 'custom_session', 'webdev_session', 'banana_session', 'banana2_session', 'higgsfield_session', 'email_session', 'proposal_session', 'audit_session', 'shill_session', 'shill_x_session']

    // action already resolved above (before reply guard)

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

    // ─── Handle /gains toggle ───
    if (action === 'gains') {
      try {
        // Check current state from site_configs
        const { data: existing } = await supabase
          .from('site_configs')
          .select('content')
          .eq('site_id', 'system')
          .eq('section', 'tp8_alerts')
          .single()

        const currentlyEnabled = existing?.content?.enabled !== false // default true
        const newEnabled = !currentlyEnabled

        // Upsert the toggle state
        await supabase
          .from('site_configs')
          .upsert({
            site_id: 'system',
            section: 'tp8_alerts',
            content: { enabled: newEnabled },
            is_published: true,
          }, { onConflict: 'site_id,section' })

        const statusEmoji = newEnabled ? '✅' : '🔴'
        const statusText = newEnabled ? 'ON' : 'OFF'
        await tgPost(TG_TOKEN, 'sendMessage', {
          chat_id: chatId,
          text: `${statusEmoji} <b>TP10 Gain Alerts: ${statusText}</b>\n\nType /gains again to toggle.`,
          parse_mode: 'HTML',
        })
      } catch (e: any) {
        console.error('[gains-toggle] error:', e)
        await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `❌ Failed to toggle gains: ${e.message}` })
      }
      return new Response('ok')
    }

    // ─── Handle /shill command (admin-only) ───
    if (text.toLowerCase().startsWith('/shill')) {
      const senderUsername = (message.from?.username || '').toLowerCase()
      if (senderUsername !== 'lokeybunny') {
        await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '🔒 This command is restricted to admin only.' })
        return new Response('ok')
      }
      // Clean up old shill sessions
      await supabase.from('webhook_events').delete()
        .eq('source', 'telegram').eq('event_type', 'shill_session')
        .filter('payload->>chat_id', 'eq', String(chatId))
      // Create shill session at caption step
      await supabase.from('webhook_events').insert({
        source: 'telegram',
        event_type: 'shill_session',
        payload: { chat_id: chatId, step: 'caption', community: '$whitehouse', created: Date.now() },
      })
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '🚀 <b>Shill to X Community</b>\n\n📝 Community: <b>$whitehouse</b> (ctothispump)\n\nWhat caption do you want for this post?',
        parse_mode: 'HTML',
      })
      return new Response('ok')
    }

    // ─── Handle /shill2 command (admin-only) — posts to Shill X community ───
    if (text.toLowerCase().startsWith('/shill2')) {
      const senderUsername = (message.from?.username || '').toLowerCase()
      if (senderUsername !== 'lokeybunny') {
        await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '🔒 This command is restricted to admin only.' })
        return new Response('ok')
      }
      // Load Shill X config
      const { data: sxCfg } = await supabase.from('site_configs')
        .select('content').eq('site_id', 'smm-auto-shill').eq('section', 'shill-x-config').maybeSingle()
      const sxContent = sxCfg?.content as any
      if (!sxContent?.community_id || !sxContent?.enabled) {
        await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '❌ Shill X is not configured or disabled. Set it up in the X Shill → Shill X tab first.' })
        return new Response('ok')
      }
      // Clean up old shill_x sessions
      await supabase.from('webhook_events').delete()
        .eq('source', 'telegram').eq('event_type', 'shill_x_session')
        .filter('payload->>chat_id', 'eq', String(chatId))
      // Create shill_x session at caption step
      await supabase.from('webhook_events').insert({
        source: 'telegram',
        event_type: 'shill_x_session',
        payload: { chat_id: chatId, step: 'caption', community_id: sxContent.community_id, community_name: sxContent.community_name || 'Shill X', created: Date.now() },
      })
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: `🎯 <b>Shill X — Cross-Community Post</b>\n\n📡 Target: <b>${sxContent.community_name || sxContent.community_id}</b>\n🆔 Community: <code>${sxContent.community_id}</code>\n\n📝 What caption do you want for this post?`,
        parse_mode: 'HTML',
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
      banana2: 'banana2_session',
      higgsfield: 'higgsfield_session',
      email: 'email_session',
      assistant: 'assistant_session',
    }

    // ─── SMM special handling: show mode selection ───
    if (action === 'smm') {
      // Clean up old SMM sessions
      await supabase.from('webhook_events').delete()
        .eq('source', 'telegram').in('event_type', ['smm_session', 'smm_strategist_session'])
        .filter('payload->>chat_id', 'eq', String(chatId))

      const modeButtons = [
        [{ text: '📝 Prompt — Direct posting & scheduling', callback_data: 'smm_mode_prompt' }],
        [{ text: '🧠 Strategist — Content planning (synced with app)', callback_data: 'smm_mode_strategist' }],
      ]
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '📱 <b>SMM — Choose Mode:</b>\n\n📝 <b>Prompt</b> — Direct posting, scheduling, analytics\n🧠 <b>Strategist</b> — Cortex content planner (real-time sync with web app)',
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: modeButtons },
      })
      return new Response('ok')
    }

    // ─── Audit special handling: multi-step wizard ───
    if (action === 'audit') {
      await supabase.from('webhook_events').delete()
        .eq('source', 'telegram').eq('event_type', 'audit_session')
        .filter('payload->>chat_id', 'eq', String(chatId))
      await supabase.from('webhook_events').insert({
        source: 'telegram',
        event_type: 'audit_session',
        payload: { chat_id: chatId, step: 'website', data: {}, created: Date.now() },
      })
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '🔍 <b>Digital Audit Tool</b>\n\nI\'ll scrape a website + Instagram and generate a full PDF report with analysis and recommendations.\n\n🌐 <b>Step 1:</b> Enter the website URL\n\n<i>Example: example.com</i>\n<i>Type "skip" to skip website and go straight to Instagram.</i>',
        parse_mode: 'HTML',
      })
      return new Response('ok')
    }

    // ─── Proposal special handling: multi-step wizard ───
    if (action === 'proposal') {
      await supabase.from('webhook_events').delete()
        .eq('source', 'telegram').eq('event_type', 'proposal_session')
        .filter('payload->>chat_id', 'eq', String(chatId))
      await supabase.from('webhook_events').insert({
        source: 'telegram',
        event_type: 'proposal_session',
        payload: { chat_id: chatId, step: 'recipient', data: {}, created: Date.now() },
      })
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '📝 <b>Proposal Builder</b>\n\nLet\'s create a professional proposal.\n\n👤 <b>Who is this proposal for?</b>\n\n<i>Type a client name or email address. If they\'re in the CRM, I\'ll auto-fill their details.</i>',
        parse_mode: 'HTML',
      })
      return new Response('ok')
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
        banana2: '🍌2️⃣ Banana2 (Gemini 3)',
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
        banana2: 'Try: "A photorealistic portrait of a woman in golden hour light"',
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
      const sp = session.payload as any

      // Auto-expire sessions older than 15 minutes — stale sessions should not catch free text
      const sessionAge = Date.now() - (sp.created || 0)
      const SESSION_TTL = 15 * 60 * 1000 // 15 minutes
      if (sessionAge > SESSION_TTL) {
        await supabase.from('webhook_events').delete().eq('id', session.id)
        // Session expired, fall through to silence
        return new Response('ok')
      }

      const sessionType = session.event_type
      const history = sp.history || []

      // Check for media in the message
      const media = extractMedia(message)
      let imageUrl: string | undefined

      // ─── Shill session handler ───
      if (sessionType === 'shill_session') {
       if (sp.step === 'caption' && text) {
           // User entered caption, now ask post now or schedule
           await supabase.from('webhook_events').update({
             payload: { ...sp, step: 'timing', caption: text },
           }).eq('id', session.id)
           await tgPost(TG_TOKEN, 'sendMessage', {
             chat_id: chatId,
             text: `✅ Caption saved:\n<i>"${text}"</i>\n\n⏱ Would you like to <b>post now</b> or <b>schedule</b> this post?`,
             parse_mode: 'HTML',
             reply_markup: {
               inline_keyboard: [
                 [{ text: '🚀 Post Now', callback_data: 'shill_timing_now' }],
                 [{ text: '📅 Schedule', callback_data: 'shill_timing_schedule' }],
               ],
             },
           })
           return new Response('ok')
         }

         // Timing step: handled via callback, but if user types text instead
         if (sp.step === 'timing' && text) {
           const lower = text.toLowerCase()
           if (lower.includes('now')) {
             await supabase.from('webhook_events').update({
               payload: { ...sp, step: 'video', timing: 'now' },
             }).eq('id', session.id)
             await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '📹 Upload the video to post now.', parse_mode: 'HTML' })
           } else if (lower.includes('schedule') || lower.includes('later')) {
             await supabase.from('webhook_events').update({
               payload: { ...sp, step: 'video', timing: 'schedule' },
             }).eq('id', session.id)
             await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '📹 Upload the video to schedule.', parse_mode: 'HTML' })
           } else {
             await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '❓ Please choose "Post Now" or "Schedule".', parse_mode: 'HTML' })
           }
           return new Response('ok')
         }

        if (sp.step === 'video' && media) {
          await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '📡 Downloading video from Telegram...' })
          try {
            // Download video from Telegram
            const fileInfoRes = await fetch(`${TG_API}${TG_TOKEN}/getFile`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ file_id: media.fileId }),
            })
            const fileInfo = await fileInfoRes.json()
            const filePath = fileInfo.result?.file_path
            if (!filePath) throw new Error('Could not get file path from Telegram')

            const fileUrl = `https://api.telegram.org/file/bot${TG_TOKEN}/${filePath}`
            const fileRes = await fetch(fileUrl)
            if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.status}`)
            const fileBytes = await fileRes.arrayBuffer()

            // Upload to Supabase storage to get a public URL
            const storagePath = `shill/${Date.now()}_${media.fileName}`
            const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
            const supa = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
            const { error: uploadErr } = await supa.storage.from('content-uploads').upload(storagePath, fileBytes, {
              contentType: media.type === 'video' ? 'video/mp4' : 'application/octet-stream',
              upsert: false,
            })
            if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`)
            const { data: urlData } = supa.storage.from('content-uploads').getPublicUrl(storagePath)
            const publicUrl = urlData.publicUrl

            // ─── SCHEDULE PATH ───
            if (sp.timing === 'schedule') {
              // Fetch all existing scheduled times
              const { data: existingPosts } = await supa
                .from('shill_scheduled_posts')
                .select('scheduled_at')
                .in('status', ['scheduled', 'processing'])
                .order('scheduled_at', { ascending: true })

              const existingTimes = (existingPosts || []).map((p: any) => new Date(p.scheduled_at).getTime())
              existingTimes.sort((a: number, b: number) => a - b)

              // Helper: check if a candidate time is at least 30-75 min from all existing
              const MIN_GAP_MS = (30 + Math.floor(Math.random() * 45)) * 60 * 1000 // 30-75 min randomized
              const isFarEnough = (t: number) => existingTimes.every(e => Math.abs(t - e) >= MIN_GAP_MS)

              // ─── BURST-GAP LOGIC ───
              // Walk the full sorted timeline and figure out the burst position
              // of the NEW post. After every 3rd consecutive post, the next post
              // must be 1-3 hours after the 3rd.
              // "Consecutive" = posts within 2h of each other.
              const TWO_HOURS_MS = 2 * 60 * 60 * 1000

              // Count consecutive posts at the END of the existing timeline
              let tailBurstCount = 1
              for (let i = existingTimes.length - 1; i > 0; i--) {
                const gap = existingTimes[i] - existingTimes[i - 1]
                if (gap <= TWO_HOURS_MS) {
                  tailBurstCount++
                } else {
                  break // hit a gap, burst ended
                }
              }

              // The new post will be the (tailBurstCount % 3 + 1)th post in the cycle
              // If tailBurstCount is already a multiple of 3 (3, 6, 9...), the NEXT post
              // needs a 1-3 hour cooldown gap after the last scheduled post
              let cooldownAfter = 0
              if (existingTimes.length > 0 && tailBurstCount % 3 === 0) {
                const lastPost = existingTimes[existingTimes.length - 1]
                const cooldownHours = 1 + Math.random() * 2 // 1-3 hours random
                cooldownAfter = lastPost + cooldownHours * 60 * 60 * 1000
              }

              // ─── PST/PDT POSTING WINDOW: 5AM - 9PM ───
              // Determine current PDT/PST offset (simplified: Mar Sun2 - Nov Sun1 = PDT -7, else PST -8)
              const getPacificOffsetHours = (d: Date): number => {
                const year = d.getUTCFullYear()
                const marStart = new Date(Date.UTC(year, 2, 8)) // Mar 8 approx
                marStart.setUTCDate(8 + (7 - marStart.getUTCDay()) % 7) // 2nd Sunday
                const novEnd = new Date(Date.UTC(year, 10, 1))
                novEnd.setUTCDate(1 + (7 - novEnd.getUTCDay()) % 7) // 1st Sunday
                return (d >= marStart && d < novEnd) ? -7 : -8
              }
              const PST_WINDOW_START = 5  // 5 AM Pacific
              const PST_WINDOW_END = 21   // 9 PM Pacific

              const isInPacificWindow = (utcMs: number): boolean => {
                const d = new Date(utcMs)
                const offset = getPacificOffsetHours(d)
                const pacificHour = (d.getUTCHours() + offset + 24) % 24
                return pacificHour >= PST_WINDOW_START && pacificHour < PST_WINDOW_END
              }

              // Push a UTC timestamp forward to the next 5AM Pacific if outside window
              const snapToWindow = (utcMs: number): number => {
                if (isInPacificWindow(utcMs)) return utcMs
                const d = new Date(utcMs)
                const offset = getPacificOffsetHours(d)
                const pacificHour = (d.getUTCHours() + offset + 24) % 24
                // If past 9PM, jump to next day 5AM; if before 5AM, jump to today 5AM
                const dLocal = new Date(utcMs + offset * 3600000)
                const nextDay = pacificHour >= PST_WINDOW_END ? 1 : 0
                const target = new Date(dLocal)
                target.setUTCDate(target.getUTCDate() + nextDay)
                target.setUTCHours(PST_WINDOW_START, Math.floor(Math.random() * 15), Math.floor(Math.random() * 30), 0)
                return target.getTime() - offset * 3600000 // convert back to UTC
              }

              let scheduledAt: Date | null = null
              const now = new Date()
              // Start scheduling 30 minutes from now (never post immediately)
              let earliestMs = now.getTime() + 30 * 60 * 1000
              // Apply cooldown if active — this is the key: forces a 1-3h gap
              if (cooldownAfter > earliestMs) earliestMs = cooldownAfter
              // Snap to Pacific window
              earliestMs = snapToWindow(earliestMs)
              const earliest = new Date(earliestMs)

              // Scan forward to find a valid slot
              for (let h = 0; h < 168; h++) { // up to 7 days ahead
                const hourStart = new Date(earliest)
                hourStart.setMinutes(0, 0, 0)
                hourStart.setHours(hourStart.getHours() + h)

                // Skip hours outside the Pacific window
                if (!isInPacificWindow(hourStart.getTime())) continue

                // Try up to 15 random minutes in this hour to find a valid gap
                for (let attempt = 0; attempt < 15; attempt++) {
                  const randomMinute = 2 + Math.floor(Math.random() * 56) // 2-57
                  const randomSecond = Math.floor(Math.random() * 30)
                  const candidate = new Date(hourStart)
                  candidate.setMinutes(randomMinute, randomSecond, 0)

                  // Must be after earliest allowed time
                  if (candidate.getTime() < earliest.getTime()) continue
                  // Must be within Pacific window
                  if (!isInPacificWindow(candidate.getTime())) continue
                  // Must be 20+ min from every existing post
                  if (!isFarEnough(candidate.getTime())) continue

                  scheduledAt = candidate
                  break
                }
                if (scheduledAt) break
              }

              if (!scheduledAt) {
                await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '❌ All slots full for the next 7 days. Try posting now instead.' })
              } else {
                await supa.from('shill_scheduled_posts').insert({
                  chat_id: chatId,
                  caption: sp.caption,
                  video_url: publicUrl,
                  storage_path: storagePath,
                  scheduled_at: scheduledAt.toISOString(),
                  status: 'scheduled',
                })

                const timeStr = scheduledAt.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                await tgPost(TG_TOKEN, 'sendMessage', {
                  chat_id: chatId,
                  text: `📅 <b>Video scheduled!</b>\n\n📝 Caption: <i>"${sp.caption}"</i>\n🕐 Posting at: <b>${timeStr} PST</b>\n🎬 <a href="${publicUrl}">Preview Video</a>\n\n<i>Manage scheduled posts in the X Shill → Campaign tab.</i>`,
                  parse_mode: 'HTML',
                  disable_web_page_preview: false,
                })
              }
            } else {
              // ─── POST NOW PATH (existing logic) ───
              await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '📤 Sending video to X community...' })

              const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
              const X_COMMUNITY_ID = '2029596385180291485'
              const postRes = await fetch(`${SUPABASE_URL}/functions/v1/smm-api?action=upload-video`, {
                method: 'POST',
                headers: {
                  'apikey': ANON_KEY,
                  'Authorization': `Bearer ${ANON_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  title: sp.caption,
                  video: publicUrl,
                  'platform[]': ['x'],
                  user: 'xslaves',
                  community_id: X_COMMUNITY_ID,
                }),
              })
              const postResult = await postRes.json()

              if (!postRes.ok || postResult?.error) {
                const errMsg = postResult?.error || postResult?.message || `HTTP ${postRes.status}`
                await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `❌ Upload failed: ${errMsg}` })
              } else {
                const requestId = postResult?.request_id || postResult?.data?.request_id || ''

                let postUrl = ''
                let statusLabel = 'submitted'
                if (requestId) {
                  await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '⏳ Waiting for video to process...' })
                  for (let poll = 0; poll < 12; poll++) {
                    await new Promise(r => setTimeout(r, 5000))
                    try {
                      const statusRes = await fetch(`${SUPABASE_URL}/functions/v1/smm-api?action=upload-status&request_id=${requestId}`, {
                        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
                      })
                      const statusData = await statusRes.json()
                      const st = statusData?.status || statusData?.data?.status || ''
                      console.log(`[shill] poll #${poll + 1} status=${st}`)
                      if (st === 'completed' || st === 'success' || st === 'done') {
                        statusLabel = 'completed'
                        postUrl = statusData?.post_url || statusData?.data?.post_url ||
                                  statusData?.posts?.[0]?.post_url || statusData?.data?.posts?.[0]?.post_url || ''
                        break
                      }
                      if (st === 'failed' || st === 'error') {
                        statusLabel = 'failed'
                        break
                      }
                    } catch (pollErr: any) {
                      console.error('[shill] poll error:', pollErr.message)
                    }
                  }
                }

                if (statusLabel === 'failed') {
                  await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '❌ Video processing failed on the provider side. Try again.' })
                } else {
                  let successMsg = `✅ <b>Video posted to $whitehouse community!</b>\n\n📝 Caption: <i>"${sp.caption}"</i>\n🆔 Request: <code>${requestId}</code>`
                  if (statusLabel === 'completed' && postUrl) {
                    successMsg += `\n\n🔗 <a href="${postUrl}">View Post on X</a>`
                  } else if (statusLabel === 'submitted') {
                    successMsg += `\n\n⏳ Video is still processing. Check status in SMM dashboard.`
                  }
                  await tgPost(TG_TOKEN, 'sendMessage', {
                    chat_id: chatId,
                    text: successMsg,
                    parse_mode: 'HTML',
                    disable_web_page_preview: false,
                  })
                }
              }
            }
          } catch (e: any) {
            console.error('[shill] error:', e)
            await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `❌ Shill failed: ${e.message}` })
          }
          // Clean up session
          await supabase.from('webhook_events').delete().eq('id', session.id)
          return new Response('ok')
        }

        // If in video step but no media, remind
        if (sp.step === 'video' && !media) {
          await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '📹 Please upload a video file to continue, or type /cancel to exit.' })
          return new Response('ok')
        }

        return new Response('ok')
      }

      // ─── Shill X session handler (mirrors shill_session for cross-community) ───
      if (sessionType === 'shill_x_session') {
        if (sp.step === 'caption' && text) {
          await supabase.from('webhook_events').update({
            payload: { ...sp, step: 'timing', caption: text },
          }).eq('id', session.id)
          await tgPost(TG_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: `✅ Caption saved:\n<i>"${text}"</i>\n\n📡 Target: <b>${sp.community_name}</b>\n\n⏱ Post now or schedule?`,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🚀 Post Now', callback_data: 'shill_x_timing_now' }],
                [{ text: '📅 Schedule', callback_data: 'shill_x_timing_schedule' }],
              ],
            },
          })
          return new Response('ok')
        }

        if (sp.step === 'timing' && text) {
          const lower = text.toLowerCase()
          if (lower.includes('now')) {
            await supabase.from('webhook_events').update({
              payload: { ...sp, step: 'video', timing: 'now' },
            }).eq('id', session.id)
            await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '📹 Upload the video to post now.', parse_mode: 'HTML' })
          } else if (lower.includes('schedule') || lower.includes('later')) {
            await supabase.from('webhook_events').update({
              payload: { ...sp, step: 'video', timing: 'schedule' },
            }).eq('id', session.id)
            await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '📹 Upload the video to schedule.', parse_mode: 'HTML' })
          } else {
            await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '❓ Please choose "Post Now" or "Schedule".', parse_mode: 'HTML' })
          }
          return new Response('ok')
        }

        if (sp.step === 'video' && media) {
          await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '📡 Downloading video from Telegram...' })
          try {
            const fileInfoRes = await fetch(`${TG_API}${TG_TOKEN}/getFile`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ file_id: media.fileId }),
            })
            const fileInfo = await fileInfoRes.json()
            const filePath = fileInfo.result?.file_path
            if (!filePath) throw new Error('Could not get file path from Telegram')

            const fileUrl = `https://api.telegram.org/file/bot${TG_TOKEN}/${filePath}`
            const fileRes = await fetch(fileUrl)
            if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.status}`)
            const fileBytes = await fileRes.arrayBuffer()

            const storagePath = `shill-x/${Date.now()}_${media.fileName}`
            const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
            const supa = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
            const { error: uploadErr } = await supa.storage.from('content-uploads').upload(storagePath, fileBytes, {
              contentType: media.type === 'video' ? 'video/mp4' : 'application/octet-stream',
              upsert: false,
            })
            if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`)
            const { data: urlData } = supa.storage.from('content-uploads').getPublicUrl(storagePath)
            const publicUrl = urlData.publicUrl

            // Load rotation accounts
            const { data: rotCfg } = await supa.from('site_configs')
              .select('content')
              .eq('site_id', 'smm-auto-shill')
              .eq('section', 'shill-rotation-accounts')
              .maybeSingle()
            let rotAccounts = (rotCfg?.content as any)?.accounts || []
            let activeAccounts = rotAccounts.filter((a: any) => a.status === 'active')
            if (activeAccounts.length === 0) activeAccounts = [{ handle: 'xslaves' }]
            // Round-robin: pick account based on total shill_x posts count
            const { count: sxCount } = await supa.from('shill_scheduled_posts').select('id', { count: 'exact', head: true }).eq('community_id', sp.community_id)
            const accountIdx = (sxCount || 0) % activeAccounts.length
            const selectedAccount = activeAccounts[accountIdx].handle

            const COMMUNITY_ID = sp.community_id
            const COMMUNITY_NAME = sp.community_name || 'Shill X'

            if (sp.timing === 'schedule') {
              // Schedule with same burst-gap logic as /shill
              const { data: existingPosts } = await supa.from('shill_scheduled_posts')
                .select('scheduled_at')
                .eq('community_id', COMMUNITY_ID)
                .in('status', ['scheduled', 'processing'])
                .order('scheduled_at', { ascending: true })
              const existingTimes = (existingPosts || []).map((p: any) => new Date(p.scheduled_at).getTime())
              existingTimes.sort((a: number, b: number) => a - b)
              const MIN_GAP_MS = (30 + Math.floor(Math.random() * 45)) * 60 * 1000
              const isFarEnough = (t: number) => existingTimes.every((e: number) => Math.abs(t - e) >= MIN_GAP_MS)

              const now = new Date()
              let earliestMs = now.getTime() + 30 * 60 * 1000
              // Simple scheduling: find next available slot
              let scheduledAt: Date | null = null
              for (let h = 0; h < 168; h++) {
                const hourStart = new Date(earliestMs)
                hourStart.setMinutes(0, 0, 0)
                hourStart.setHours(hourStart.getHours() + h)
                for (let attempt = 0; attempt < 15; attempt++) {
                  const randomMinute = 2 + Math.floor(Math.random() * 56)
                  const candidate = new Date(hourStart)
                  candidate.setMinutes(randomMinute, Math.floor(Math.random() * 30), 0)
                  if (candidate.getTime() < earliestMs) continue
                  if (!isFarEnough(candidate.getTime())) continue
                  scheduledAt = candidate
                  break
                }
                if (scheduledAt) break
              }

              if (!scheduledAt) {
                await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '❌ All slots full. Try posting now instead.' })
              } else {
                await supa.from('shill_scheduled_posts').insert({
                  chat_id: chatId,
                  caption: sp.caption,
                  video_url: publicUrl,
                  storage_path: storagePath,
                  community_id: COMMUNITY_ID,
                  x_account: selectedAccount,
                  scheduled_at: scheduledAt.toISOString(),
                  status: 'scheduled',
                })
                const timeStr = scheduledAt.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                await tgPost(TG_TOKEN, 'sendMessage', {
                  chat_id: chatId,
                  text: `📅 <b>Shill X — Video scheduled!</b>\n\n📡 Community: <b>${COMMUNITY_NAME}</b>\n👤 Account: <b>@${selectedAccount}</b>\n📝 Caption: <i>"${sp.caption}"</i>\n🕐 Posting at: <b>${timeStr} PST</b>`,
                  parse_mode: 'HTML',
                })
              }
            } else {
              // POST NOW
              await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `📤 Posting to ${COMMUNITY_NAME} via @${selectedAccount}...` })
              const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
              const postRes = await fetch(`${SUPABASE_URL}/functions/v1/smm-api?action=upload-video`, {
                method: 'POST',
                headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: sp.caption,
                  video: publicUrl,
                  'platform[]': ['x'],
                  user: selectedAccount,
                  community_id: COMMUNITY_ID,
                }),
              })
              const postResult = await postRes.json()

              if (!postRes.ok || postResult?.error) {
                await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `❌ Upload failed: ${postResult?.error || postResult?.message || `HTTP ${postRes.status}`}` })
              } else {
                const requestId = postResult?.request_id || postResult?.data?.request_id || ''
                let postUrl = '', statusLabel = 'submitted'
                if (requestId) {
                  await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '⏳ Waiting for video to process...' })
                  for (let poll = 0; poll < 12; poll++) {
                    await new Promise(r => setTimeout(r, 5000))
                    try {
                      const statusRes = await fetch(`${SUPABASE_URL}/functions/v1/smm-api?action=upload-status&request_id=${requestId}`, {
                        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
                      })
                      const statusData = await statusRes.json()
                      const st = statusData?.status || statusData?.data?.status || ''
                      if (st === 'completed' || st === 'success' || st === 'done') {
                        statusLabel = 'completed'
                        postUrl = statusData?.post_url || statusData?.data?.post_url || statusData?.posts?.[0]?.post_url || ''
                        break
                      }
                      if (st === 'failed' || st === 'error') { statusLabel = 'failed'; break }
                    } catch {}
                  }
                }

                if (statusLabel === 'failed') {
                  await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '❌ Video processing failed. Try again.' })
                } else {
                  let successMsg = `✅ <b>Video posted to ${COMMUNITY_NAME}!</b>\n\n👤 Account: <b>@${selectedAccount}</b>\n📝 Caption: <i>"${sp.caption}"</i>\n🆔 Request: <code>${requestId}</code>`
                  if (statusLabel === 'completed' && postUrl) successMsg += `\n\n🔗 <a href="${postUrl}">View Post on X</a>`
                  else if (statusLabel === 'submitted') successMsg += `\n\n⏳ Video is still processing.`
                  await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: successMsg, parse_mode: 'HTML', disable_web_page_preview: false })
                }
              }
            }
          } catch (e: any) {
            console.error('[shill-x] error:', e)
            await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: `❌ Shill X failed: ${e.message}` })
          }
          await supabase.from('webhook_events').delete().eq('id', session.id)
          return new Response('ok')
        }

        if (sp.step === 'video' && !media) {
          await tgPost(TG_TOKEN, 'sendMessage', { chat_id: chatId, text: '📹 Please upload a video file to continue, or type /cancel to exit.' })
          return new Response('ok')
        }

        return new Response('ok')
      }
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
      } else if (sessionType === 'smm_strategist_session') {
        const profile = sp.profile || 'STU25'
        const platform = sp.platform || 'instagram'
        await processSMMStrategist(chatId, text, history, TG_TOKEN, SUPABASE_URL, supabase, profile, platform)
      } else if (sessionType === 'email_session') {
        await processEmailCommand(chatId, text, history, TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase)
      } else if (sessionType === 'webdev_session') {
        await processWebDevCommand(chatId, text, history, TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase)
      } else if (sessionType === 'banana_session') {
        await processBananaCommand(chatId, text, history, TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase, imageUrl)
      } else if (sessionType === 'banana2_session') {
        await processBanana2Command(chatId, text, history, TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase, imageUrl)
      } else if (sessionType === 'higgsfield_session') {
        await processHiggsFieldCommand(chatId, text, history, TG_TOKEN, SUPABASE_URL, BOT_SECRET, supabase, imageUrl, sp.gen_type, sp.model)
      } else if (sessionType === 'proposal_session') {
        await processProposalSession(chatId, text, session.id, sp, TG_TOKEN, SUPABASE_URL, supabase)
      } else if (sessionType === 'audit_session') {
        await processAuditSession(chatId, text, session.id, sp, TG_TOKEN, SUPABASE_URL, supabase)
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

    // ─── DMs: stay silent for unrecognized free text (command-only policy) ───

    return new Response('ok')

  } catch (err: any) {
    console.error('[telegram-media-listener] ERROR:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
