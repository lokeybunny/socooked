import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = url.pathname.split('/').pop()

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''))
  if (claimsErr || !claims?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const body = await req.json()

    if (path === 'analyze-thread') {
      const transcript = (body.transcript || '').toLowerCase()
      const hasName = transcript.includes('name')
      const hasEmail = transcript.includes('email') || transcript.includes('@')
      const hasPhone = transcript.includes('phone') || transcript.includes('call')
      const missing: string[] = []
      if (!hasName) missing.push('full_name')
      if (!hasEmail) missing.push('email')
      if (!hasPhone) missing.push('phone')

      const status = missing.length === 0 ? 'ready_for_docs' : 'collecting_info'
      const summary = missing.length === 0
        ? 'All required information collected. Ready to generate documents.'
        : `Still collecting info. Missing: ${missing.join(', ')}`

      return new Response(JSON.stringify({ status, missing_fields: missing, summary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (path === 'generate-resume') {
      // Mock PDF generation — return a placeholder base64 PDF
      const resumeJson = {
        name: 'Client Name',
        email: 'client@example.com',
        summary: 'Professional summary generated from conversation.',
        experience: [{ title: 'Position', company: 'Company', duration: '2020-2024' }],
        skills: ['Skill 1', 'Skill 2', 'Skill 3'],
        style: body.resume_style || 'modern',
      }

      return new Response(JSON.stringify({
        pdf_base64: 'MOCK_PDF_BASE64_RESUME_PLACEHOLDER',
        resume_json: resumeJson,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (path === 'generate-contract') {
      const contractJson = {
        parties: { provider: 'SOCooked CM', client: 'Client Name' },
        terms: body.terms || { price: 400, deposit: 200, revisions_policy: '2 free revisions' },
        template: body.contract_template || 'resume_service_v1',
        clauses: [
          'Services will be delivered within 7 business days.',
          'Payment is due upon signing.',
          'Two (2) free revisions included.',
        ],
      }

      return new Response(JSON.stringify({
        pdf_base64: 'MOCK_PDF_BASE64_CONTRACT_PLACEHOLDER',
        contract_json: contractJson,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (path === 'generate-email') {
      const name = body.customer_name || 'Valued Customer'
      const portalLink = body.portal_link || '#'

      return new Response(JSON.stringify({
        subject: `Your documents are ready — ${name}`,
        body_html: `<p>Hi ${name},</p><p>Your resume and contract are ready for review. Please click the link below to sign your contract:</p><p><a href="${portalLink}">${portalLink}</a></p><p>Best regards,<br/>SOCooked CM Team</p>`,
        body_text: `Hi ${name}, your documents are ready. Sign your contract here: ${portalLink}`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown endpoint' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
