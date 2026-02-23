import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // Find calendar_events with source='scheduled-email' that are due (start_time <= now)
    // and not yet sent (color field used as status marker: '#scheduled' = pending, '#sent' = done)
    const now = new Date().toISOString()
    
    const { data: dueEvents, error: fetchErr } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('source', 'scheduled-email')
      .neq('color', '#sent')
      .lte('start_time', now)
      .order('start_time', { ascending: true })
      .limit(50)

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`)

    if (!dueEvents || dueEvents.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No due emails' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[email-scheduler] Found ${dueEvents.length} due emails to send`)

    const gmailUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-api?action=send`
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    let sentCount = 0
    const errors: string[] = []

    for (const event of dueEvents) {
      try {
        // Email metadata is stored in the description as JSON
        let emailMeta: { to: string; subject: string; body: string }
        try {
          emailMeta = JSON.parse(event.description || '{}')
        } catch {
          console.error(`[email-scheduler] Invalid email meta for event ${event.id}`)
          errors.push(`Event ${event.id}: invalid email metadata`)
          continue
        }

        if (!emailMeta.to || !emailMeta.subject) {
          errors.push(`Event ${event.id}: missing to or subject`)
          continue
        }

        console.log(`[email-scheduler] Sending email to ${emailMeta.to}: ${emailMeta.subject}`)

        // Send via gmail-api
        const sendRes = await fetch(gmailUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
            'apikey': anonKey,
          },
          body: JSON.stringify({
            to: emailMeta.to,
            subject: emailMeta.subject,
            body: emailMeta.body || '',
          }),
        })

        const sendData = await sendRes.json()

        if (!sendRes.ok || sendData.error) {
          throw new Error(sendData.error || `HTTP ${sendRes.status}`)
        }

        // Mark as sent by updating color to '#sent' and updating title
        await supabase
          .from('calendar_events')
          .update({ 
            color: '#sent',
            title: `✅ ${event.title}`,
          })
          .eq('id', event.id)

        // Log activity (triggers Telegram notification via DB trigger)
        await supabase.from('activity_log').insert({
          entity_type: 'scheduled-email',
          entity_id: event.id,
          action: 'sent',
          meta: { name: `📧 ${emailMeta.subject} → ${emailMeta.to}` },
        })

        sentCount++
        console.log(`[email-scheduler] ✅ Sent email ${event.id} to ${emailMeta.to}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[email-scheduler] ❌ Failed event ${event.id}: ${msg}`)
        errors.push(`Event ${event.id}: ${msg}`)
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      sent: sentCount, 
      total_due: dueEvents.length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[email-scheduler] Fatal error:', msg)
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
