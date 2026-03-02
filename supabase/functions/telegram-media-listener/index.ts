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

// Channel ID for X Feed forwarding (PebbleHost bot posts here)
const X_FEED_CHANNEL_ID = -1003740017231

// Channel ID for Market Cap Alerts
const MCAP_ALERT_CHANNEL_ID = -1003767278197

// Channel ID for Meta Narrative tracking
const META_CHANNEL_ID = -1003804658600

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
    [{ text: '❌ Cancel' }, { text: '⬅️ Back' }],
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

function resolvePersistentAction(input: string): 'invoice' | 'smm' | 'customer' | 'calendar' | 'calendly' | 'meeting' | 'custom' | 'start' | 'cancel' | 'more' | 'back' | 'webdev' | 'banana' | 'banana2' | 'higgsfield' | 'email' | 'assistant' | null {
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
            const tokenSymbol = symbolMatch ? symbolMatch[1] : null
            
            // Check for j7tracker
            const isJ7Tracker = cpText.toLowerCase().includes('j7tracker')
            
            // URLs
            const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi
            const urls = (cpText.match(urlRegex) || []) as string[]
            const sourceUrl = urls[0] || ''
            
            if (ca) {
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
              }
            }
          }
        } catch (e: any) {
          console.error('[mcap] channel parse error:', e)
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
    const ALL_SESSIONS = ['assistant_session', 'invoice_session', 'smm_session', 'smm_strategist_session', 'customer_session', 'calendar_session', 'meeting_session', 'calendly_session', 'custom_session', 'webdev_session', 'banana_session', 'banana2_session', 'higgsfield_session', 'xpost_session', 'email_session']
    const ALL_REPLY_SESSIONS = ['assistant_session', 'invoice_session', 'smm_session', 'smm_strategist_session', 'customer_session', 'calendar_session', 'meeting_session', 'calendly_session', 'custom_session', 'webdev_session', 'banana_session', 'banana2_session', 'higgsfield_session', 'email_session']

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

      // Check for media in the message (for banana/higgsfield)
      const media = extractMedia(message)
      let imageUrl: string | undefined

      if (media && (sessionType === 'banana_session' || sessionType === 'banana2_session' || sessionType === 'higgsfield_session')) {
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
