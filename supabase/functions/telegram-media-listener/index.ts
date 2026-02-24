/**
 * Telegram Media Listener
 * 
 * Receives Telegram webhook updates, detects media (photos, videos, documents),
 * and asks the user "Save to CRM?" with inline keyboard buttons.
 * On "Yes" callback, stores the file via POST /clawd-bot/content using file_id.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TG_API = 'https://api.telegram.org/bot'

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

function extractMedia(message: Record<string, unknown>): { fileId: string; type: string; fileName: string } | null {
  if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
    const largest = message.photo[message.photo.length - 1] as Record<string, unknown>
    return { fileId: largest.file_id as string, type: 'image', fileName: `photo_${Date.now()}.jpg` }
  }
  if (message.video) {
    const v = message.video as Record<string, unknown>
    return { fileId: v.file_id as string, type: 'video', fileName: (v.file_name as string) || `video_${Date.now()}.mp4` }
  }
  if (message.document) {
    const d = message.document as Record<string, unknown>
    const mime = (d.mime_type as string) || ''
    let docType = 'doc'
    if (mime.startsWith('image/')) docType = 'image'
    else if (mime.startsWith('video/')) docType = 'video'
    return { fileId: d.file_id as string, type: docType, fileName: (d.file_name as string) || `file_${Date.now()}` }
  }
  if (message.audio || message.voice) {
    const a = (message.audio || message.voice) as Record<string, unknown>
    return { fileId: a.file_id as string, type: 'audio', fileName: (a.file_name as string) || `audio_${Date.now()}.ogg` }
  }
  return null
}

// In-memory map to store file_id for callback (since callback_data has 64-byte limit)
const pendingMedia = new Map<string, { fileId: string; type: string; fileName: string }>()

Deno.serve(async (req) => {
  console.log('[telegram-media-listener] request received:', req.method)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const BOT_SECRET = Deno.env.get('BOT_SECRET')
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')

  if (!TG_TOKEN || !BOT_SECRET || !SUPABASE_URL) {
    console.error('[telegram-media-listener] Missing env vars:', { TG_TOKEN: !!TG_TOKEN, BOT_SECRET: !!BOT_SECRET, SUPABASE_URL: !!SUPABASE_URL })
    return new Response(JSON.stringify({ error: 'Missing config' }), { status: 500, headers: corsHeaders })
  }

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
        const key = data.replace('crm_save:', '')
        const cached = pendingMedia.get(key)

        if (!cached) {
          await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Session expired. Please re-send the file.' })
          return new Response('ok')
        }

        pendingMedia.delete(key)

        await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Saving to CRM...' })

        console.log('[save] storing file_id:', cached.fileId, 'type:', cached.type)

        const storeRes = await fetch(`${SUPABASE_URL}/functions/v1/clawd-bot/content`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-bot-secret': BOT_SECRET,
          },
          body: JSON.stringify({
            title: cached.fileName,
            type: cached.type,
            status: 'published',
            source: 'telegram',
            category: 'telegram',
            file_id: cached.fileId,
            folder: 'STU25sTG',
          }),
        })

        const storeText = await storeRes.text()
        console.log('[save] result:', storeRes.status, storeText.slice(0, 300))

        let success = false
        try {
          const storeResult = JSON.parse(storeText)
          success = storeRes.ok && storeResult.success
        } catch { /* ignore parse error */ }

        if (chatId && messageId) {
          const msg = success
            ? `✅ <b>Saved to CRM!</b>\n📁 ${cached.fileName}`
            : `❌ <b>Failed to save.</b> Check logs for details.`
          await tgPost(TG_TOKEN, 'editMessageText', { chat_id: chatId, message_id: messageId, text: msg, parse_mode: 'HTML' })
        }

        return new Response('ok')
      }

      await tgPost(TG_TOKEN, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Unknown action' })
      return new Response('ok')
    }

    // ─── Handle incoming messages with media ───
    const message = update.message
    if (!message) {
      console.log('[telegram-media-listener] no message in update, ignoring')
      return new Response('ok')
    }

    const chatId = message.chat?.id
    if (!chatId) return new Response('ok')

    const media = extractMedia(message)
    if (!media) {
      console.log('[telegram-media-listener] no media detected, ignoring')
      return new Response('ok')
    }

    console.log('[telegram-media-listener] media detected:', media.type, media.fileName, 'file_id:', media.fileId.slice(0, 20) + '...')

    // Check for .webp — reject early
    if (media.type === 'image' && media.fileName.toLowerCase().endsWith('.webp')) {
      await tgPost(TG_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '⚠️ <b>.webp images are not supported.</b>\nPlease re-send as JPG or PNG.',
        parse_mode: 'HTML',
      })
      return new Response('ok')
    }

    // Store in memory with a short key for callback_data (64-byte limit)
    const key = String(message.message_id)
    pendingMedia.set(key, media)

    // Auto-cleanup after 10 minutes
    setTimeout(() => pendingMedia.delete(key), 10 * 60 * 1000)

    const caption = message.caption ? `\n💬 <i>${message.caption}</i>` : ''

    await tgPost(TG_TOKEN, 'sendMessage', {
      chat_id: chatId,
      text: `📎 <b>${media.fileName}</b> (${media.type})${caption}\n\nSave to CRM?`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Yes, save', callback_data: `crm_save:${key}` },
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
