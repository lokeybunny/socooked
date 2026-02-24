import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Telegram Media Listener
 * 
 * Receives Telegram webhook updates, detects media (photos, videos, documents),
 * and asks the user "Save to CRM?" with inline keyboard buttons.
 * On "Yes" callback, stores the file via POST /clawd-bot/content using file_id.
 */

const TG_API = 'https://api.telegram.org/bot'

async function sendMessage(token: string, chatId: number | string, text: string, replyMarkup?: object) {
  const payload: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' }
  if (replyMarkup) payload.reply_markup = replyMarkup
  await fetch(`${TG_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

async function answerCallback(token: string, callbackId: string, text: string) {
  await fetch(`${TG_API}${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  })
}

async function editMessage(token: string, chatId: number | string, messageId: number, text: string) {
  await fetch(`${TG_API}${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' }),
  })
}

function extractMedia(message: Record<string, unknown>): { fileId: string; type: string; fileName: string } | null {
  // Photos — use highest resolution (last element)
  if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
    const largest = message.photo[message.photo.length - 1] as Record<string, unknown>
    return { fileId: largest.file_id as string, type: 'image', fileName: `photo_${Date.now()}.jpg` }
  }

  // Video
  if (message.video) {
    const v = message.video as Record<string, unknown>
    return { fileId: v.file_id as string, type: 'video', fileName: (v.file_name as string) || `video_${Date.now()}.mp4` }
  }

  // Document (PDF, etc.)
  if (message.document) {
    const d = message.document as Record<string, unknown>
    const mime = (d.mime_type as string) || ''
    let docType = 'doc'
    if (mime.startsWith('image/')) docType = 'image'
    else if (mime.startsWith('video/')) docType = 'video'
    else if (mime === 'application/pdf') docType = 'doc'
    return { fileId: d.file_id as string, type: docType, fileName: (d.file_name as string) || `file_${Date.now()}` }
  }

  // Audio / Voice
  if (message.audio || message.voice) {
    const a = (message.audio || message.voice) as Record<string, unknown>
    return { fileId: a.file_id as string, type: 'audio', fileName: (a.file_name as string) || `audio_${Date.now()}.ogg` }
  }

  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const BOT_SECRET = Deno.env.get('BOT_SECRET')
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')

  if (!TG_TOKEN || !BOT_SECRET || !SUPABASE_URL) {
    return new Response(JSON.stringify({ error: 'Missing config' }), { status: 500, headers: corsHeaders })
  }

  try {
    const update = await req.json()

    // ─── Handle callback queries (user pressed Yes/No) ───
    if (update.callback_query) {
      const cb = update.callback_query
      const data = cb.data as string // format: "crm_save:<file_id>:<type>:<fileName>" or "crm_skip"
      const chatId = cb.message?.chat?.id
      const messageId = cb.message?.message_id

      if (data === 'crm_skip') {
        await answerCallback(TG_TOKEN, cb.id, 'Skipped')
        if (chatId && messageId) {
          await editMessage(TG_TOKEN, chatId, messageId, '⏭ Skipped — not saved to CRM.')
        }
        return new Response('ok')
      }

      if (data.startsWith('crm_save:')) {
        const parts = data.split(':')
        const fileId = parts[1]
        const fileType = parts[2]
        const fileName = parts.slice(3).join(':') // fileName may contain colons

        await answerCallback(TG_TOKEN, cb.id, 'Saving to CRM...')

        // Call clawd-bot/content to store the file
        const storeRes = await fetch(`${SUPABASE_URL}/functions/v1/clawd-bot/content`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-bot-secret': BOT_SECRET,
          },
          body: JSON.stringify({
            title: fileName,
            type: fileType,
            status: 'published',
            source: 'telegram',
            category: 'telegram',
            file_id: fileId,
            folder: 'STU25sTG',
          }),
        })

        const storeResult = await storeRes.json()

        if (storeRes.ok && storeResult.success) {
          if (chatId && messageId) {
            await editMessage(TG_TOKEN, chatId, messageId, `✅ <b>Saved to CRM!</b>\n📁 ${fileName}`)
          }
        } else {
          const errMsg = storeResult.error || 'Unknown error'
          if (chatId && messageId) {
            await editMessage(TG_TOKEN, chatId, messageId, `❌ <b>Failed to save:</b> ${errMsg}`)
          }
        }

        return new Response('ok')
      }

      // Unknown callback
      await answerCallback(TG_TOKEN, cb.id, 'Unknown action')
      return new Response('ok')
    }

    // ─── Handle incoming messages with media ───
    const message = update.message
    if (!message) return new Response('ok')

    const chatId = message.chat?.id
    if (!chatId) return new Response('ok')

    const media = extractMedia(message)
    if (!media) return new Response('ok') // Not a media message, ignore

    // Check for .webp — reject early
    if (media.type === 'image' && media.fileName.toLowerCase().endsWith('.webp')) {
      await sendMessage(TG_TOKEN, chatId,
        '⚠️ <b>.webp images are not supported.</b>\nPlease re-send as JPG or PNG.')
      return new Response('ok')
    }

    // Truncate callback data to 64 bytes (Telegram limit)
    // Format: crm_save:<fileId>:<type>:<fileName>
    const callbackData = `crm_save:${media.fileId}:${media.type}:${media.fileName}`
    const safeCallback = callbackData.length > 64
      ? `crm_save:${media.fileId}:${media.type}:file`
      : callbackData

    const caption = message.caption ? `\n💬 <i>${message.caption}</i>` : ''

    await sendMessage(
      TG_TOKEN,
      chatId,
      `📎 <b>${media.fileName}</b> (${media.type})${caption}\n\nSave to CRM?`,
      {
        inline_keyboard: [
          [
            { text: '✅ Yes, save', callback_data: safeCallback },
            { text: '❌ No, skip', callback_data: 'crm_skip' },
          ],
        ],
      }
    )

    return new Response('ok')
  } catch (err) {
    console.error('[telegram-media-listener]', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
