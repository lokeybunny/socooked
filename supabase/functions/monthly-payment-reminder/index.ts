/**
 * Monthly Payment Reminder
 * 
 * Runs daily via pg_cron. For each customer with status='monthly':
 * - Checks if a payment reminder was sent in the last 27 days
 * - If not, sends a professional reminder email via gmail-api
 * - Logs the communication
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildReminderHTML(customerName: string): string {
  const firstName = customerName.split(' ')[0]
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <p>Hi ${firstName},</p>

  <p>I hope you're doing well! This is a friendly reminder that your monthly website maintenance payment of <strong>$250.00</strong> is coming due.</p>

  <p>Your monthly plan includes:</p>
  <ul>
    <li>Unlimited website additions and changes</li>
    <li>Ongoing maintenance &amp; updates</li>
    <li>Priority support</li>
  </ul>

  <p>Please let me know if you have any questions or need to discuss your account. I'm always happy to help!</p>

  <p>Thank you for your continued trust in our services.</p>

  <br/>
  <p>Best regards,</p>
  <p><strong>Warren A Thompson</strong><br/>
  STU25 — Web &amp; Social Media Services<br/>
  <a href="mailto:warren@stu25.com">warren@stu25.com</a></p>
</div>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // 1. Get all monthly customers with email
    const { data: monthlyCustomers, error: custErr } = await supabase
      .from('customers')
      .select('id, full_name, email')
      .eq('status', 'monthly')
      .not('email', 'is', null)

    if (custErr) throw new Error(`Customer fetch error: ${custErr.message}`)
    if (!monthlyCustomers || monthlyCustomers.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No monthly customers found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[monthly-reminder] Found ${monthlyCustomers.length} monthly customers`)

    // 2. Check recent reminders (last 27 days) for each customer
    const twentySevenDaysAgo = new Date(Date.now() - 27 * 24 * 60 * 60 * 1000).toISOString()

    const { data: recentReminders } = await supabase
      .from('communications')
      .select('customer_id')
      .eq('type', 'email')
      .eq('direction', 'outbound')
      .eq('provider', 'monthly-payment-reminder')
      .gte('created_at', twentySevenDaysAgo)

    const recentlyRemindedIds = new Set(
      (recentReminders || []).map((r: any) => r.customer_id)
    )

    // 3. Filter to customers needing a reminder
    const needsReminder = monthlyCustomers.filter(
      (c: any) => c.email && !recentlyRemindedIds.has(c.id)
    )

    if (needsReminder.length === 0) {
      console.log('[monthly-reminder] All monthly customers already reminded within 27 days')
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'All customers recently reminded' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[monthly-reminder] Sending reminders to ${needsReminder.length} customers`)

    const gmailUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-api?action=send`
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    let sentCount = 0
    const errors: string[] = []

    for (const customer of needsReminder) {
      try {
        const subject = `Payment Reminder — $250 Monthly Website Maintenance`
        const bodyHtml = buildReminderHTML(customer.full_name)

        const sendRes = await fetch(gmailUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            to: customer.email,
            subject,
            body: bodyHtml,
          }),
        })

        const sendData = await sendRes.json()

        if (!sendRes.ok || sendData.error) {
          throw new Error(sendData.error || `HTTP ${sendRes.status}`)
        }

        // Log communication
        await supabase.from('communications').insert({
          type: 'email',
          direction: 'outbound',
          to_address: customer.email,
          subject,
          body: bodyHtml,
          status: 'sent',
          provider: 'monthly-payment-reminder',
          customer_id: customer.id,
          metadata: { source: 'monthly-payment-reminder', amount: 250 },
        })

        // Log activity
        await supabase.from('activity_log').insert({
          entity_type: 'email',
          entity_id: customer.id,
          action: 'payment-reminder-sent',
          meta: { name: `💰 Payment reminder → ${customer.full_name} (${customer.email})` },
        })

        sentCount++
        console.log(`[monthly-reminder] ✅ Sent to ${customer.full_name} <${customer.email}>`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[monthly-reminder] ❌ Failed for ${customer.full_name}: ${msg}`)
        errors.push(`${customer.full_name}: ${msg}`)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      sent: sentCount,
      total_monthly: monthlyCustomers.length,
      skipped_recent: recentlyRemindedIds.size,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[monthly-reminder] Fatal error:', msg)
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
