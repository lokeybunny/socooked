import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret',
}

const API_VERSION = 'v1'

// ─── Rate Limiter (in-memory, per-IP, 5 req/s) ──────────────
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(ip)
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 1000 })
    return true
  }
  bucket.count++
  return bucket.count <= 5
}

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data, api_version: API_VERSION }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fail(error: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error, api_version: API_VERSION }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  amount?: number
}

interface InvoicePayload {
  customer_id?: string
  customer_email?: string
  line_items: LineItem[]
  currency?: string
  due_date?: string
  notes?: string
  tax_rate?: number
  auto_send?: boolean | string
  status?: 'draft' | 'sent' | 'paid' | 'void'
}

function formatCurrency(amount: number, currency = 'USD'): string {
  const normalizedAmount = Number(amount || 0)
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(normalizedAmount)
  } catch {
    return `$${normalizedAmount.toFixed(2)} ${currency}`
  }
}

async function notifyTelegramInvoiceSent(
  supabaseUrl: string,
  serviceKey: string,
  invNum: string,
  customerName: string,
  customerEmail: string,
  amount: number,
  currency = 'USD',
) {
  try {
    const formatted = formatCurrency(amount, currency)
    await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        entity_type: 'invoice',
        action: 'created',
        meta: {
          name: `${invNum} — ${formatted} sent to ${customerName} (${customerEmail})`,
          title: `📨 Invoice PDF ${invNum} emailed to ${customerEmail}`,
        },
        created_at: new Date().toISOString(),
      }),
    })
  } catch (e) {
    console.error('[invoice-api] telegram notify error:', e)
  }
}

function sanitizeFilename(value: string): string {
  const clean = value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return clean || 'invoice'
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return ['']

  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxCharsPerLine) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
  }

  if (current) lines.push(current)
  return lines
}

function encodeBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

function buildInvoiceAttachmentEmailHtml(inv: any, customerName: string): string {
  const invNum = inv.invoice_number || 'Invoice'
  const isPaid = inv.status === 'paid'
  const dueDateStr = inv.due_date
    ? new Date(inv.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null
  const paidAtStr = inv.paid_at
    ? new Date(inv.paid_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  const paidBanner = isPaid
    ? `<div style="background:#059669;color:#ffffff;text-align:center;padding:10px 16px;font-size:16px;font-weight:bold;letter-spacing:1px;">✓ PAID IN FULL</div>`
    : ''

  const paidNote = isPaid
    ? `<p style="margin:10px 0 0;font-size:14px;color:#059669;font-weight:600;">This invoice has been paid in full${paidAtStr ? ` on ${paidAtStr}` : ''}. No further action is required.</p>`
    : `<p style="margin:14px 0 0;line-height:1.6;color:#6b7280;font-size:13px;">Please review the attached PDF for itemized details and payment terms.</p>`

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1f2937;">
      <div style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="background:#111827;padding:18px 22px;color:#ffffff;">
          <h2 style="margin:0;font-size:20px;letter-spacing:0.3px;">Invoice ${invNum}</h2>
          <p style="margin:6px 0 0;opacity:0.9;">STU25 Billing</p>
        </div>
        ${paidBanner}
        <div style="padding:20px 22px;">
          <p style="margin:0 0 10px;font-size:15px;">Hi ${customerName},</p>
          <p style="margin:0 0 14px;line-height:1.6;color:#4b5563;">
            ${isPaid ? 'Your paid invoice receipt is attached as a professionally formatted PDF for your records.' : 'Your invoice is attached as a professionally formatted PDF.'}
          </p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;">
            <p style="margin:0;font-size:14px;color:#374151;"><strong>Total:</strong> ${formatCurrency(Number(inv.amount || 0), inv.currency || 'USD')}</p>
            ${isPaid ? `<p style="margin:6px 0 0;font-size:14px;color:#059669;font-weight:600;">Status: PAID IN FULL</p>` : ''}
            ${dueDateStr && !isPaid ? `<p style="margin:6px 0 0;font-size:14px;color:#374151;"><strong>Due:</strong> ${dueDateStr}</p>` : ''}
          </div>
          ${paidNote}
        </div>
      </div>
    </div>
  `
}

async function buildInvoicePdfBase64(inv: any, customerName: string): Promise<string> {
  const { PDFDocument, StandardFonts, rgb } = await import('https://esm.sh/pdf-lib@1.17.1')

  const lineItems: LineItem[] = Array.isArray(inv.line_items) ? inv.line_items : []
  const subtotalVal = Number(inv.subtotal || inv.amount || 0)
  const taxRate = Number(inv.tax_rate || 0)
  const taxAmt = subtotalVal * taxRate / 100
  const totalVal = Number(inv.amount || 0)
  const currency = inv.currency || 'USD'
  const invNum = inv.invoice_number || 'Invoice'
  const dueDateStr = inv.due_date
    ? new Date(inv.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Due on receipt'
  const notes = String(inv.notes || '').trim()

  const pdfDoc = await PDFDocument.create()
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const pageSize: [number, number] = [612, 792]
  const left = 48
  const right = 564
  const width = right - left

  let page = pdfDoc.addPage(pageSize)

  const drawTableHeader = (targetPage: any, y: number): number => {
    targetPage.drawRectangle({ x: left, y: y - 16, width, height: 20, color: rgb(0.95, 0.97, 1) })
    targetPage.drawText('Item', { x: left + 8, y: y - 11, size: 9, font: bold, color: rgb(0.15, 0.23, 0.40) })
    targetPage.drawText('Qty', { x: left + 330, y: y - 11, size: 9, font: bold, color: rgb(0.15, 0.23, 0.40) })
    targetPage.drawText('Unit', { x: left + 390, y: y - 11, size: 9, font: bold, color: rgb(0.15, 0.23, 0.40) })
    targetPage.drawText('Total', { x: left + 470, y: y - 11, size: 9, font: bold, color: rgb(0.15, 0.23, 0.40) })
    return y - 24
  }

  const drawHeader = (targetPage: any): number => {
    targetPage.drawRectangle({ x: left, y: 700, width, height: 72, color: rgb(0.07, 0.12, 0.23) })
    targetPage.drawText('STU25', { x: left + 18, y: 744, size: 18, font: bold, color: rgb(1, 1, 1) })
    targetPage.drawText('Professional Services Invoice', { x: left + 18, y: 724, size: 11, font: regular, color: rgb(0.84, 0.89, 1) })

    targetPage.drawText(String(invNum), { x: left + 360, y: 744, size: 14, font: bold, color: rgb(1, 1, 1) })
    targetPage.drawText(`Issued: ${new Date(inv.created_at || Date.now()).toLocaleDateString('en-US')}`, { x: left + 360, y: 728, size: 9, font: regular, color: rgb(0.84, 0.89, 1) })
    targetPage.drawText(`Due: ${dueDateStr}`, { x: left + 360, y: 714, size: 9, font: regular, color: rgb(0.84, 0.89, 1) })

    targetPage.drawText('Bill To', { x: left, y: 676, size: 10, font: bold, color: rgb(0.11, 0.17, 0.30) })
    targetPage.drawText(String(customerName || 'Customer'), { x: left, y: 660, size: 12, font: regular, color: rgb(0.16, 0.20, 0.28) })
    targetPage.drawText((inv.customers?.email || '').toString(), { x: left, y: 646, size: 9, font: regular, color: rgb(0.43, 0.47, 0.55) })

    return 622
  }

  let y = drawHeader(page)
  y = drawTableHeader(page, y)

  for (const li of lineItems) {
    if (y < 130) {
      page = pdfDoc.addPage(pageSize)
      page.drawText(`${invNum} (continued)`, { x: left, y: 748, size: 11, font: bold, color: rgb(0.11, 0.17, 0.30) })
      y = drawTableHeader(page, 722)
    }

    const qty = Number(li.quantity || 0)
    const unit = Number(li.unit_price || 0)
    const total = qty * unit
    const descriptionRaw = String(li.description || 'Item').replace(/\s+/g, ' ').trim()
    const description = descriptionRaw.length > 58 ? `${descriptionRaw.slice(0, 55)}...` : descriptionRaw

    page.drawText(description, { x: left + 8, y, size: 9.5, font: regular, color: rgb(0.18, 0.22, 0.29) })
    page.drawText(String(qty), { x: left + 330, y, size: 9.5, font: regular, color: rgb(0.18, 0.22, 0.29) })
    page.drawText(formatCurrency(unit, currency), { x: left + 390, y, size: 9.5, font: regular, color: rgb(0.18, 0.22, 0.29) })
    page.drawText(formatCurrency(total, currency), { x: left + 470, y, size: 9.5, font: regular, color: rgb(0.18, 0.22, 0.29) })

    page.drawLine({
      start: { x: left, y: y - 5 },
      end: { x: right, y: y - 5 },
      thickness: 0.4,
      color: rgb(0.90, 0.92, 0.95),
    })

    y -= 20
  }

  let totalsY = Math.max(y - 6, 158)
  if (totalsY < 158) totalsY = 158

  const isPaid = inv.status === 'paid'

  page.drawRectangle({
    x: left + 320,
    y: totalsY - 66,
    width: 196,
    height: 72,
    color: rgb(0.98, 0.99, 1),
    borderColor: rgb(0.88, 0.91, 0.96),
    borderWidth: 1,
  })

  page.drawText(`Subtotal: ${formatCurrency(subtotalVal, currency)}`, { x: left + 332, y: totalsY - 14, size: 9.5, font: regular, color: rgb(0.20, 0.24, 0.31) })
  page.drawText(`Tax (${taxRate}%): ${formatCurrency(taxAmt, currency)}`, { x: left + 332, y: totalsY - 30, size: 9.5, font: regular, color: rgb(0.20, 0.24, 0.31) })
  page.drawText(`Total: ${formatCurrency(totalVal, currency)}`, { x: left + 332, y: totalsY - 50, size: 11.5, font: bold, color: rgb(0.08, 0.14, 0.27) })

  // ─── PAID IN FULL stamp ───
  if (isPaid) {
    // Large diagonal stamp
    page.drawText('PAID IN FULL', {
      x: left + 60,
      y: totalsY - 20,
      size: 38,
      font: bold,
      color: rgb(0.02, 0.59, 0.40),
      opacity: 0.18,
      rotate: { type: 'degrees' as const, angle: 25 },
    })

    // Solid status box next to totals
    page.drawRectangle({
      x: left,
      y: totalsY - 66,
      width: 150,
      height: 28,
      color: rgb(0.02, 0.59, 0.40),
      borderColor: rgb(0.02, 0.50, 0.35),
      borderWidth: 1,
    })
    page.drawText('PAID IN FULL', {
      x: left + 12,
      y: totalsY - 57,
      size: 12,
      font: bold,
      color: rgb(1, 1, 1),
    })

    const paidAtStr = inv.paid_at
      ? `Paid: ${new Date(inv.paid_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
      : ''
    if (paidAtStr) {
      page.drawText(paidAtStr, {
        x: left,
        y: totalsY - 82,
        size: 9,
        font: regular,
        color: rgb(0.02, 0.50, 0.35),
      })
    }
  }

  if (notes) {
    let noteY = totalsY - 96
    let notePage = page

    if (noteY < 86) {
      notePage = pdfDoc.addPage(pageSize)
      noteY = 744
    }

    notePage.drawText('Notes', { x: left, y: noteY, size: 10, font: bold, color: rgb(0.12, 0.17, 0.28) })
    const noteLines = wrapText(notes, 95).slice(0, 8)

    let lineY = noteY - 14
    for (const line of noteLines) {
      notePage.drawText(line, { x: left, y: lineY, size: 9, font: regular, color: rgb(0.35, 0.39, 0.47) })
      lineY -= 12
    }
  }

  const pdfBytes = await pdfDoc.save()
  return encodeBase64(pdfBytes)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Rate limit check
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || 'unknown'
  if (!checkRateLimit(clientIp)) {
    return fail('Rate limit exceeded. Max 5 requests per second.', 429)
  }

  try {
    // Auth: accept BOT_SECRET or standard JWT
    const botSecret = req.headers.get('x-bot-secret')
    const authHeader = req.headers.get('authorization')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    let authorized = false

    if (botSecret) {
      const expectedSecret = Deno.env.get('BOT_SECRET')
      if (!expectedSecret) return fail('BOT_SECRET not configured', 500)
      if (botSecret !== expectedSecret) return fail('Invalid bot secret', 401)
      authorized = true
    } else if (authHeader?.startsWith('Bearer ')) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      })
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error } = await userClient.auth.getUser(token)
      if (!error && user) authorized = true
    }

    if (!authorized) return fail('Unauthorized', 401)

    const url = new URL(req.url)
    const path = url.pathname.split('/').pop()

    // Audit log for bot calls
    if (botSecret) {
      try {
        const bodyClone = req.method === 'POST' || req.method === 'PATCH' ? await req.clone().json() : {}
        await supabase.from('webhook_events').insert({
          source: 'spacebot',
          event_type: `invoice-api/${path || req.method}`,
          payload: bodyClone,
          processed: true,
        })
      } catch (_) { /* non-blocking */ }
    }

    // POST /invoice-api?action=send-invoice — generate professional PDF and email attachment via gmail-api
    // (must be checked BEFORE the create handler below)
    if (req.method === 'POST' && url.searchParams.get('action') === 'send-invoice') {
      const { invoice_id } = await req.json()
      if (!invoice_id) return fail('invoice_id required')

      // Fetch invoice + customer
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .select('*, customers(full_name, email)')
        .eq('id', invoice_id)
        .single()

      if (invErr || !inv) return fail(invErr?.message || 'Invoice not found', 404)

      const customerEmail = (inv as any).customers?.email
      if (!customerEmail) return fail('Customer has no email address')

      const customerName = (inv as any).customers?.full_name || 'Customer'
      const invNum = inv.invoice_number || 'Invoice'
      const totalVal = Number(inv.amount)

      const pdfBase64 = await buildInvoicePdfBase64(inv, customerName)
      const emailBody = buildInvoiceAttachmentEmailHtml(inv, customerName)
      const attachmentFilename = `${sanitizeFilename(String(invNum))}.pdf`

      const isPaidInvoice = inv.status === 'paid'
      const emailSubject = isPaidInvoice
        ? `Invoice ${invNum} — PAID IN FULL — Receipt from STU25`
        : `Invoice ${invNum} from STU25`

      // Send via gmail-api
      const gmailUrl = `${supabaseUrl}/functions/v1/gmail-api?action=send`
      const gmailRes = await fetch(gmailUrl, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: customerEmail,
          subject: emailSubject,
          body: emailBody,
          attachments: [
            {
              filename: attachmentFilename,
              mimeType: 'application/pdf',
              data: pdfBase64,
            },
          ],
        }),
      })
      const gmailData = await gmailRes.json()
      if (!gmailRes.ok) return fail(gmailData.error || 'Failed to send email', gmailRes.status)

      // Mark invoice as sent (only if not already paid)
      if (inv.status !== 'paid') {
        await supabase.from('invoices').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        }).eq('id', invoice_id)
      } else {
        // Just update sent_at for record keeping
        await supabase.from('invoices').update({
          sent_at: new Date().toISOString(),
        }).eq('id', invoice_id)
      }

      // Notify Telegram
      await notifyTelegramInvoiceSent(supabaseUrl, serviceKey, invNum, customerName, customerEmail, totalVal, inv.currency)

      return ok({
        message: `Invoice ${invNum} emailed to ${customerEmail} with PDF attachment`,
        gmail_id: gmailData.id,
        invoice_number: invNum,
        customer_email: customerEmail,
        amount: totalVal,
      }, 200)
    }

    // POST /invoice-api - Create invoice
    if (req.method === 'POST' && (!path || path === 'invoice-api')) {
      const body: InvoicePayload = await req.json()
      const shouldAutoSend = body.auto_send === true || body.auto_send === 'true'

      // Resolve customer
      let customerId = body.customer_id
      if (!customerId && body.customer_email) {
        const { data: cust } = await supabase
          .from('customers')
          .select('id')
          .eq('email', body.customer_email)
          .limit(1)
          .single()
        if (cust) customerId = cust.id
      }

      if (!customerId) return fail('Customer not found. Provide customer_id or customer_email.')
      if (!body.line_items || body.line_items.length === 0) return fail('line_items required')

      const normalizedLineItems: LineItem[] = body.line_items.map((li: any) => {
        const quantityRaw = Number(li?.quantity ?? 1)
        const unitPriceRaw = Number(li?.unit_price ?? li?.amount ?? 0)
        return {
          description: String(li?.description || 'Item'),
          quantity: Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1,
          unit_price: Number.isFinite(unitPriceRaw) ? unitPriceRaw : 0,
        }
      })

      const requestedTaxRate = Number(body.tax_rate ?? 0)
      const taxRate = Number.isFinite(requestedTaxRate) ? requestedTaxRate : 0
      const subtotal = normalizedLineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0)
      const total = subtotal + (subtotal * taxRate / 100)

      const requestedStatus = typeof body.status === 'string' ? body.status.toLowerCase() : null
      const normalizedStatus = requestedStatus && ['draft', 'sent', 'paid', 'void'].includes(requestedStatus)
        ? requestedStatus
        : null
      const invoiceStatus = normalizedStatus ?? (shouldAutoSend ? 'sent' : 'draft')

      // ─── Duplicate guard: same customer + same amount within 2 minutes ───
      // Short window prevents accidental double-clicks but allows repeated AI Assistant tests
      const skipDupeCheck = body.skip_dupe_check === true
      if (!skipDupeCheck) {
        const windowAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()

        const { data: dupes } = await supabase
          .from('invoices')
          .select('id, invoice_number, status')
          .eq('customer_id', customerId)
          .eq('amount', total)
          .gte('created_at', windowAgo)
          .limit(1)

        if (dupes && dupes.length > 0) {
          const d = dupes[0]
          return fail(`Duplicate invoice blocked. Invoice ${d.invoice_number || d.id} (${d.status}) for this customer with the same amount was created within the last 2 minutes. If intentional, wait a moment.`, 409)
        }
      }

      // ─── Secondary guard: same customer + same due_date + same amount (any time) ───
      if (body.due_date) {
        const { data: exactDupes } = await supabase
          .from('invoices')
          .select('id, invoice_number, status')
          .eq('customer_id', customerId)
          .eq('amount', total)
          .eq('due_date', body.due_date)
          .in('status', ['draft', 'sent'])
          .limit(1)

        if (exactDupes && exactDupes.length > 0) {
          const d = exactDupes[0]
          return fail(`Duplicate invoice blocked. Invoice ${d.invoice_number || d.id} (${d.status}) already exists for this customer with the same amount and due date.`, 409)
        }
      }

      const insertData: Record<string, unknown> = {
        customer_id: customerId,
        line_items: normalizedLineItems,
        subtotal,
        amount: total,
        tax_rate: taxRate,
        currency: body.currency || 'USD',
        due_date: body.due_date || null,
        notes: body.notes || null,
        status: invoiceStatus,
        provider: 'manual',
      }

      if (invoiceStatus === 'sent' || shouldAutoSend) {
        insertData.sent_at = new Date().toISOString()
      }
      if (invoiceStatus === 'paid') {
        insertData.paid_at = new Date().toISOString()
      }

      const { data: invoice, error } = await supabase
        .from('invoices')
        .insert([insertData])
        .select('*, customers(full_name, email)')
        .single()

      if (error) return fail(error.message, 500)

      // If auto_send, generate invoice PDF and send as attachment via gmail-api
      if (shouldAutoSend && invoice) {
        const customerEmail = (invoice as any).customers?.email
        const customerName = (invoice as any).customers?.full_name || 'Customer'
        const invNum = (invoice as any).invoice_number || 'Invoice'

        if (!customerEmail) {
          return fail(`Invoice ${invNum} was created but customer has no email address for delivery.`, 422)
        }

        try {
          const pdfBase64 = await buildInvoicePdfBase64(invoice, customerName)
          const emailBody = buildInvoiceAttachmentEmailHtml(invoice, customerName)
          const attachmentFilename = `${sanitizeFilename(String(invNum))}.pdf`
          const emailSubject = invoice.status === 'paid'
            ? `Invoice ${invNum} — PAID IN FULL — Receipt from STU25`
            : `Invoice ${invNum} from STU25`

          const gmailUrl = `${supabaseUrl}/functions/v1/gmail-api?action=send`
          const gmailRes = await fetch(gmailUrl, {
            method: 'POST',
            headers: {
              'apikey': serviceKey,
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: customerEmail,
              subject: emailSubject,
              body: emailBody,
              attachments: [
                {
                  filename: attachmentFilename,
                  mimeType: 'application/pdf',
                  data: pdfBase64,
                },
              ],
            }),
          })

          const gmailData = await gmailRes.json()
          if (!gmailRes.ok) {
            return fail(`Invoice ${invNum} was created but email sending failed: ${gmailData.error || 'Unknown error'}`, gmailRes.status)
          }

          console.log(`[invoice-api] Auto-sent invoice PDF ${invNum} to ${customerEmail}`)
          await notifyTelegramInvoiceSent(supabaseUrl, serviceKey, invNum, customerName, customerEmail, Number(invoice.amount), invoice.currency)
        } catch (emailErr) {
          const message = emailErr instanceof Error ? emailErr.message : 'Unknown email error'
          return fail(`Invoice was created but email sending failed: ${message}`, 500)
        }
      }

      return ok({ invoice }, 201)
    }

    // GET /invoice-api?customer_id=xxx - List invoices
    if (req.method === 'GET') {
      const customerId = url.searchParams.get('customer_id')
      let query = supabase.from('invoices').select('*, customers(full_name, email)').order('created_at', { ascending: false })
      if (customerId) query = query.eq('customer_id', customerId)
      query = query.limit(50)

      const { data, error } = await query
      if (error) return fail(error.message, 500)
      return ok({ invoices: data })
    }

    // PATCH /invoice-api?id=xxx - Update status
    if (req.method === 'PATCH') {
      const invoiceId = url.searchParams.get('id')
      if (!invoiceId) return fail('id required')

      const body = await req.json()
      const updates: Record<string, unknown> = {}
      if (body.status) {
        updates.status = body.status
        if (body.status === 'sent') updates.sent_at = new Date().toISOString()
        if (body.status === 'paid') updates.paid_at = new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('invoices')
        .update(updates)
        .eq('id', invoiceId)
        .select()
        .single()

      if (error) return fail(error.message, 500)
      return ok({ invoice: data })
    }

    // (send-invoice handler moved above create handler to fix routing priority)

    return fail('Method not allowed', 405)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return fail(message, 500)
  }
})
