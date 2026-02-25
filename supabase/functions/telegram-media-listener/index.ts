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
const ALLOWED_GROUP_IDS = [-5205597217]

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

        const media = pending.payload as { fileId: string; type: string; fileName: string }

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
      const replyFromBot = replyToMsg.from?.is_bot === true
      if (replyFromBot) {
        console.log('[reply-router] No matching notification for message_id:', replyToId)
        await tgPost(TG_TOKEN, 'sendMessage', {
          chat_id: chatId,
          text: '⚠️ <b>Could not route reply.</b>\nThis notification was sent before reply support was added, or it has expired. Please use the CRM directly.',
          parse_mode: 'HTML',
        })
        return new Response('ok')
      }
    }

    // ─── Ignore ALL replies to other messages (Cortex stays quiet) ───
    if (message.reply_to_message) {
      console.log('[telegram-media-listener] ignoring reply to message:', message.reply_to_message.message_id)
      return new Response('ok')
    }

    // Only respond in DMs or allowed groups
    const isPrivate = chatType === 'private'
    const isAllowedGroup = ALLOWED_GROUP_IDS.includes(chatId)
    if (!isPrivate && !isAllowedGroup) {
      console.log('[telegram-media-listener] ignoring chat:', chatId, chatType)
      return new Response('ok')
    }

    // ─── /higs command — Higgsfield model reminder ───
    const text = (message.text as string || '').trim()
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
        payload: { fileId: media.fileId, type: media.type, fileName: media.fileName },
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

    await tgPost(TG_TOKEN, 'sendMessage', {
      chat_id: chatId,
      text: `📎 <b>${media.fileName}</b> (${media.type})${groupLabel}${caption}\n\nSave to CRM?`,
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
