/**
 * Email Command — AI-powered NLP Email Composer
 * 
 * Takes natural language prompts like "Send Bryan an email telling him how great he is"
 * and autonomously:
 * 1. Resolves recipient from CRM (search by name)
 * 2. Uses AI to craft a professional, personalized email
 * 3. Sends via gmail-api
 * 4. Logs the action
 * 
 * This is a CLAWDbot-style autonomous workflow — prompt in, email out.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Auth: bot secret or service role
  const botSecret = req.headers.get('x-bot-secret')
  const expectedSecret = Deno.env.get('BOT_SECRET')
  const authHeader = req.headers.get('Authorization')
  const isBot = !!(botSecret && expectedSecret && botSecret === expectedSecret)
  const isService = !!authHeader?.startsWith('Bearer ')

  if (!isBot && !isService) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { prompt, history } = await req.json()
    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ type: 'clarify', message: 'What email would you like me to send? Try: "Send Bryan an email about the project update"' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('[email-command] Processing prompt:', prompt.slice(0, 200))

    // ─── Step 1: AI Analysis — extract intent, recipient, and craft email ───
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured')

    // Build CRM context — fetch recent customers for name resolution
    const { data: customers } = await supabase
      .from('customers')
      .select('id, full_name, email, company, status, category')
      .order('updated_at', { ascending: false })
      .limit(100)

    const customerList = (customers || [])
      .filter((c: any) => c.email)
      .map((c: any) => `- ${c.full_name} <${c.email}>${c.company ? ` (${c.company})` : ''} [${c.status}]`)
      .join('\n')

    // Build conversation context from history
    const historyContext = (history || [])
      .map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`)
      .join('\n')

    const systemPrompt = `You are CLAWDbot's Email Intelligence Engine — an autonomous email composition AI for STU25 (a social media marketing & web services agency based in Burbank, CA). The sender is Warren from STU25 (warren@stu25.com).

Your job is to analyze the user's natural language prompt and produce a ready-to-send email. You must:

1. IDENTIFY the recipient — match names against the CRM customer list below. If ambiguous, ask for clarification.
2. COMPOSE a professional, personalized email based on the user's intent. Don't be generic — capture the spirit and emotion of what the user wants to say.
3. Keep the tone warm, professional, and authentic. Warren is a creative professional who values relationships.

CRM CUSTOMERS:
${customerList || '(No customers in CRM)'}

CONVERSATION HISTORY:
${historyContext || '(No prior context)'}

RULES:
- If you can clearly identify the recipient and intent, return a SEND action
- If the recipient name doesn't match any customer OR has no email, return a CLARIFY action asking for the email
- If the prompt is vague about what to say, still compose something good based on the intent
- Subject lines should be natural, not corporate-sounding
- Email body should be HTML formatted with proper paragraphs
- Always sign off as Warren / STU25 team
- If the user says "reply" or references a previous email, note this in your response

You MUST respond with a valid JSON object (no markdown, no code fences) in one of these formats:

SEND format:
{"type":"send","to":"email@example.com","customer_name":"Full Name","customer_id":"uuid-or-null","subject":"Email subject","body_html":"<p>HTML email body</p>","body_text":"Plain text version","summary":"One-line summary of what this email does"}

CLARIFY format:
{"type":"clarify","message":"Your clarifying question here"}`

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error('[email-command] AI gateway error:', aiRes.status, errText)
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ type: 'clarify', message: '⏳ Rate limited — try again in a moment.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`AI gateway error: ${aiRes.status}`)
    }

    const aiData = await aiRes.json()
    const rawContent = aiData.choices?.[0]?.message?.content || ''
    console.log('[email-command] AI raw response:', rawContent.slice(0, 500))

    // Parse AI response — strip markdown fences if present
    let parsed: any
    try {
      const cleaned = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch (e) {
      console.error('[email-command] Failed to parse AI response:', e)
      return new Response(JSON.stringify({
        type: 'clarify',
        message: 'I had trouble understanding that. Could you rephrase? Example: "Send Bryan a thank you email for the project"',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── Step 2: Handle CLARIFY ───
    if (parsed.type === 'clarify') {
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── Step 3: Handle SEND — execute the email ───
    if (parsed.type === 'send') {
      const { to, subject, body_html, body_text, customer_name, customer_id, summary } = parsed

      if (!to || !subject) {
        return new Response(JSON.stringify({
          type: 'clarify',
          message: 'I need at least a recipient email and subject to send. Who should I email?',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Send via gmail-api
      const gmailUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-api?action=send`
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

      const sendRes = await fetch(gmailUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          to,
          subject,
          body: body_html || body_text || '',
        }),
      })

      const sendData = await sendRes.json()

      if (!sendRes.ok || sendData.error) {
        const errMsg = sendData.error || `Gmail API error: ${sendRes.status}`
        console.error('[email-command] Send failed:', errMsg)
        return new Response(JSON.stringify({
          type: 'executed',
          actions: [{
            description: `Send email to ${customer_name || to}`,
            success: false,
            error: errMsg,
          }],
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Log activity
      await supabase.from('activity_log').insert({
        entity_type: 'email',
        entity_id: customer_id || null,
        action: 'sent',
        meta: { name: `📧 ${subject} → ${to}` },
      })

      // Log communication
      await supabase.from('communications').insert({
        type: 'email',
        direction: 'outbound',
        to_address: to,
        subject,
        body: body_text || body_html || '',
        status: 'sent',
        provider: 'email-command',
        customer_id: customer_id || null,
        metadata: { source: 'email-command', summary },
      })

      console.log('[email-command] ✅ Email sent to', to, '—', subject)

      return new Response(JSON.stringify({
        type: 'executed',
        actions: [{
          description: `Email sent to ${customer_name || to}`,
          success: true,
          data: {
            to,
            subject,
            customer_name: customer_name || null,
            customer_id: customer_id || null,
            email_sent: true,
            summary: summary || `Email about "${subject}" sent to ${to}`,
          },
        }],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Unknown type from AI
    return new Response(JSON.stringify({
      type: 'message',
      message: rawContent.slice(0, 1000),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[email-command] Fatal error:', msg)
    return new Response(JSON.stringify({ type: 'clarify', message: `❌ Error: ${msg}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
