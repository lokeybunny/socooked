/**
 * Invoice Due Reminder
 * 
 * Runs daily via pg_cron. Sends reminder emails 3 days before invoice due_date
 * for unpaid invoices via Gmail API. Logs each reminder in communications.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildReminderHTML(customerName: string, invoiceNumber: string, amount: number, dueDate: string): string {
  const firstName = customerName.split(' ')[0]
  const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  const formattedDate = new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <h2 style="color: #0f172a;">Upcoming Invoice Reminder</h2>
  
  <p>Hi ${firstName},</p>
  
  <p>This is a friendly reminder that your invoice <strong>${invoiceNumber}</strong> for <strong>${formattedAmount}</strong> is due on <strong>${formattedDate}</strong> — that's in 3 days.</p>
  
  <p>If you've already arranged payment, please disregard this message. Otherwise, please ensure payment is submitted before the due date to avoid any interruption in services.</p>
  
  <p>If you have any questions about this invoice or need to discuss payment options, don't hesitate to reach out.</p>
  
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
    // Calculate the date 3 days from now (YYYY-MM-DD)
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    const targetDate = threeDaysFromNow.toISOString().split('T')[0]

    console.log(`[invoice-reminder] Checking for invoices due on ${targetDate}`)

    // Find unpaid invoices due in exactly 3 days
    const { data: invoices, error: invErr } = await supabase
      .from('invoices')
      .select('id, invoice_number, amount, due_date, customer_id, payment_url')
      .eq('due_date', targetDate)
      .in('status', ['sent', 'draft', 'pending'])

    if (invErr) throw new Error(`Invoice fetch error: ${invErr.message}`)
    if (!invoices || invoices.length === 0) {
      console.log('[invoice-reminder] No invoices due in 3 days')
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No invoices due in 3 days' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[invoice-reminder] Found ${invoices.length} invoices due on ${targetDate}`)

    // Get customer details for these invoices
    const customerIds = [...new Set(invoices.map(i => i.customer_id))]
    const { data: customers } = await supabase
      .from('customers')
      .select('id, full_name, email')
      .in('id', customerIds)

    const customerMap = new Map((customers || []).map(c => [c.id, c]))

    // Check which invoices already got a reminder (avoid duplicates)
    const invoiceIds = invoices.map(i => i.id)
    const { data: existingReminders } = await supabase
      .from('communications')
      .select('metadata')
      .eq('provider', 'invoice-due-reminder')
      .in('metadata->>invoice_id', invoiceIds)

    const alreadyRemindedIds = new Set(
      (existingReminders || []).map((r: any) => r.metadata?.invoice_id).filter(Boolean)
    )

    const gmailUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-api?action=send`
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    let sentCount = 0
    const errors: string[] = []

    for (const invoice of invoices) {
      if (alreadyRemindedIds.has(invoice.id)) {
        console.log(`[invoice-reminder] Already reminded for ${invoice.invoice_number}, skipping`)
        continue
      }

      const customer = customerMap.get(invoice.customer_id)
      if (!customer || !customer.email) {
        console.log(`[invoice-reminder] No email for customer ${invoice.customer_id}, skipping`)
        continue
      }

      try {
        const subject = `Reminder: Invoice ${invoice.invoice_number || invoice.id.slice(0, 8)} Due in 3 Days`
        const bodyHtml = buildReminderHTML(
          customer.full_name,
          invoice.invoice_number || `#${invoice.id.slice(0, 8)}`,
          invoice.amount,
          invoice.due_date,
        )

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
          provider: 'invoice-due-reminder',
          customer_id: customer.id,
          metadata: {
            source: 'invoice-due-reminder',
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            amount: invoice.amount,
            due_date: invoice.due_date,
          },
        })

        // Log activity
        await supabase.from('activity_log').insert({
          entity_type: 'invoice',
          entity_id: invoice.id,
          action: 'due-reminder-sent',
          meta: {
            name: `📋 Invoice reminder → ${customer.full_name} (${invoice.invoice_number || invoice.id.slice(0, 8)}) due ${invoice.due_date}`,
          },
        })

        sentCount++
        console.log(`[invoice-reminder] ✅ Sent to ${customer.full_name} <${customer.email}> for ${invoice.invoice_number}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[invoice-reminder] ❌ Failed for ${customer.full_name}: ${msg}`)
        errors.push(`${customer.full_name}: ${msg}`)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      sent: sentCount,
      total_due: invoices.length,
      skipped_already_reminded: alreadyRemindedIds.size,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[invoice-reminder] Fatal error:', msg)
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
