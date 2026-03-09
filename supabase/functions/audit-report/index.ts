import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// ─── Firecrawl: scrape website ───
async function scrapeWebsite(url: string): Promise<any> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY')
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY not configured')

  let formattedUrl = url.trim()
  if (!formattedUrl.startsWith('http')) formattedUrl = `https://${formattedUrl}`

  console.log('[audit] Scraping website:', formattedUrl)

  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: formattedUrl,
      formats: ['markdown', 'screenshot', 'links', 'branding'],
      onlyMainContent: false,
      waitFor: 3000,
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('[audit] Firecrawl error:', data)
    throw new Error(data.error || `Firecrawl failed: ${res.status}`)
  }

  return {
    markdown: data.data?.markdown || data.markdown || '',
    screenshot: data.data?.screenshot || data.screenshot || null,
    links: data.data?.links || data.links || [],
    branding: data.data?.branding || data.branding || null,
    metadata: data.data?.metadata || data.metadata || {},
  }
}

// ─── Apify: scrape Instagram profile ───
async function scrapeInstagram(handle: string): Promise<any> {
  const token = Deno.env.get('APIFY_TOKEN')
  if (!token) throw new Error('APIFY_TOKEN not configured')

  const cleanHandle = handle.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')
  console.log('[audit] Scraping Instagram:', cleanHandle)

  // Use Apify Instagram Profile Scraper
  const runRes = await fetch('https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=' + token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernames: [cleanHandle],
      resultsLimit: 12,
    }),
    signal: AbortSignal.timeout(120000),
  })

  if (!runRes.ok) {
    const errText = await runRes.text()
    console.error('[audit] Apify error:', errText)
    throw new Error(`Apify scrape failed: ${runRes.status}`)
  }

  const items = await runRes.json()
  const profile = items?.[0] || {}

  // Extract key metrics
  return {
    username: profile.username || cleanHandle,
    fullName: profile.fullName || '',
    biography: profile.biography || '',
    followersCount: profile.followersCount || 0,
    followsCount: profile.followsCount || 0,
    postsCount: profile.postsCount || 0,
    isVerified: profile.verified || false,
    isBusinessAccount: profile.isBusinessAccount || false,
    businessCategory: profile.businessCategoryName || '',
    profilePicUrl: profile.profilePicUrlHD || profile.profilePicUrl || '',
    externalUrl: profile.externalUrl || '',
    recentPosts: (profile.latestPosts || []).slice(0, 12).map((p: any) => ({
      caption: (p.caption || '').slice(0, 200),
      likes: p.likesCount || 0,
      comments: p.commentsCount || 0,
      timestamp: p.timestamp,
      type: p.type || 'image',
      hashtags: (p.hashtags || []).slice(0, 10),
    })),
  }
}

// ─── Gemini: analyze and generate report ───
async function generateAnalysis(websiteData: any, igData: any | null, websiteUrl: string, igHandle: string | null): Promise<string> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) throw new Error('LOVABLE_API_KEY not configured')

  const websiteSection = `
## WEBSITE DATA
URL: ${websiteUrl}
Title: ${websiteData.metadata?.title || 'N/A'}
Description: ${websiteData.metadata?.description || 'N/A'}
Total links found: ${websiteData.links?.length || 0}
Has screenshot: ${websiteData.screenshot ? 'Yes' : 'No'}

### Branding
${websiteData.branding ? JSON.stringify(websiteData.branding, null, 2) : 'No branding data extracted'}

### Content (first 3000 chars)
${(websiteData.markdown || '').slice(0, 3000)}
`

  const igSection = igData ? `
## INSTAGRAM DATA
Handle: @${igData.username}
Full Name: ${igData.fullName}
Bio: ${igData.biography}
Followers: ${igData.followersCount.toLocaleString()}
Following: ${igData.followsCount.toLocaleString()}
Posts: ${igData.postsCount.toLocaleString()}
Verified: ${igData.isVerified}
Business Account: ${igData.isBusinessAccount}
Business Category: ${igData.businessCategory || 'None'}
External URL: ${igData.externalUrl || 'None'}
Profile Pic: ${igData.profilePicUrl ? 'Present' : 'Missing'}

### Recent Posts (last 12)
${igData.recentPosts.map((p: any, i: number) => {
  const engagement = p.likes + p.comments
  return `${i + 1}. ${p.type} | ❤️ ${p.likes} | 💬 ${p.comments} | Hashtags: ${p.hashtags.length} | "${(p.caption || '').slice(0, 80)}..."`
}).join('\n')}

### Engagement Analysis
Average likes: ${igData.recentPosts.length > 0 ? Math.round(igData.recentPosts.reduce((a: number, p: any) => a + p.likes, 0) / igData.recentPosts.length) : 0}
Average comments: ${igData.recentPosts.length > 0 ? Math.round(igData.recentPosts.reduce((a: number, p: any) => a + p.comments, 0) / igData.recentPosts.length) : 0}
Engagement rate: ${igData.followersCount > 0 && igData.recentPosts.length > 0 ? ((igData.recentPosts.reduce((a: number, p: any) => a + p.likes + p.comments, 0) / igData.recentPosts.length / igData.followersCount) * 100).toFixed(2) : '0'}%
` : '## INSTAGRAM DATA\nNo Instagram handle provided.'

  const prompt = `You are a professional digital marketing consultant creating an audit report for a prospective client. Analyze the following data and produce a comprehensive, actionable report.

${websiteSection}

${igSection}

Generate a DETAILED audit report in the following format. Use clear sections, bullet points, and specific recommendations. Be honest but constructive — frame weaknesses as opportunities.

# 📊 DIGITAL PRESENCE AUDIT REPORT
**Client:** [business name from data]
**Date:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

## 🌐 WEBSITE ANALYSIS

### Current State
- Overall impression (design, branding, user experience)
- Content quality and messaging
- Navigation and structure
- Mobile responsiveness indicators
- SEO indicators (title, meta description, headings)
- Call-to-action effectiveness
- Page load / technical indicators

### Issues Found
- List specific problems with priority (🔴 Critical, 🟡 Medium, 🟢 Minor)

### Recommendations
- Specific, actionable improvements we can implement

${igData ? `
## 📱 INSTAGRAM ANALYSIS

### Current State
- Profile completeness and optimization
- Content strategy assessment
- Posting frequency and consistency
- Engagement rate analysis (compare to industry avg ~1-3%)
- Hashtag strategy
- Bio optimization
- Link in bio usage
- Content mix (photos, reels, carousels)

### Issues Found
- List specific problems with priority

### Recommendations
- Specific improvements for growth
` : ''}

## 🎯 COMPETITIVE ADVANTAGES
- What they're doing well (acknowledge strengths)

## 📈 GROWTH OPPORTUNITIES
- Top 5 quick wins (implementable in < 1 week)
- Top 5 strategic improvements (1-4 week projects)

## 💼 PROPOSED SERVICES
Based on the audit, recommend specific service packages:
1. **Essential Package** — Quick fixes and immediate improvements
2. **Growth Package** — Comprehensive digital overhaul
3. **Premium Package** — Full-service management

## 📊 PROJECTED IMPACT
- Expected improvements with specific metrics where possible

Keep the tone professional, data-driven, and consultative. This report should demonstrate expertise and convince the prospect to work with us.`

  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You are a senior digital marketing consultant who creates detailed, actionable audit reports. Be specific, data-driven, and professional.' },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('[audit] Gemini error:', errText)
    throw new Error(`AI analysis failed: ${res.status}`)
  }

  const aiResult = await res.json()
  return aiResult.choices?.[0]?.message?.content || 'Analysis failed to generate.'
}

// ─── PDF Generation (text-based PDF 1.4) ───
function generatePDF(report: string, websiteUrl: string, igHandle: string | null): Uint8Array {
  // Simple PDF 1.4 generator
  const lines = report.split('\n')
  const pageWidth = 595.28  // A4
  const pageHeight = 841.89
  const margin = 50
  const lineHeight = 14
  const maxCharsPerLine = 85

  // Word-wrap + format lines
  const formattedLines: { text: string; bold: boolean; heading: boolean; size: number }[] = []

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      formattedLines.push({ text: '', bold: false, heading: false, size: 10 })
      continue
    }

    let text = trimmed
    let bold = false
    let heading = false
    let size = 10

    // Headings
    if (text.startsWith('# ')) { text = text.slice(2); bold = true; heading = true; size = 18 }
    else if (text.startsWith('## ')) { text = text.slice(3); bold = true; heading = true; size = 14 }
    else if (text.startsWith('### ')) { text = text.slice(4); bold = true; heading = true; size = 12 }

    // Bold markers
    if (text.startsWith('**') && text.endsWith('**')) {
      text = text.slice(2, -2); bold = true
    }
    // Strip remaining markdown
    text = text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '')

    // Bullets
    if (text.startsWith('- ')) text = '• ' + text.slice(2)

    // Word wrap
    const maxChars = heading ? 60 : maxCharsPerLine
    while (text.length > maxChars) {
      let breakAt = text.lastIndexOf(' ', maxChars)
      if (breakAt <= 0) breakAt = maxChars
      formattedLines.push({ text: text.slice(0, breakAt), bold, heading, size })
      text = text.slice(breakAt).trim()
    }
    formattedLines.push({ text, bold, heading, size })
  }

  // Calculate pages
  const usableHeight = pageHeight - margin * 2
  const linesPerPage = Math.floor(usableHeight / lineHeight)
  const totalPages = Math.ceil(formattedLines.length / linesPerPage)

  // Build PDF objects
  const objects: string[] = []
  const pageRefs: number[] = []

  // Obj 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj')

  // Obj 2: Pages (placeholder - we'll fill refs later)
  objects.push('') // placeholder

  // Obj 3: Font Helvetica
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj')

  // Obj 4: Font Helvetica-Bold
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj')

  let nextObj = 5

  // Generate pages
  for (let page = 0; page < totalPages; page++) {
    const startLine = page * linesPerPage
    const endLine = Math.min(startLine + linesPerPage, formattedLines.length)

    let stream = 'BT\n'
    let y = pageHeight - margin

    for (let i = startLine; i < endLine; i++) {
      const line = formattedLines[i]
      if (!line.text) { y -= lineHeight; continue }

      const fontRef = line.bold ? '4' : '3'
      const escapedText = line.text
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')

      stream += `/F${line.bold ? 2 : 1} ${line.size} Tf\n`
      stream += `${margin} ${y} Td\n`
      stream += `(${escapedText}) Tj\n`
      stream += `${-margin} ${-y} Td\n`
      y -= line.heading ? lineHeight * 1.5 : lineHeight
    }

    // Footer
    stream += `/F1 8 Tf\n`
    stream += `${margin} 30 Td\n`
    stream += `(Page ${page + 1} of ${totalPages} | SOCooked Creative Management | ${new Date().toLocaleDateString()}) Tj\n`
    stream += `${-margin} -30 Td\n`

    stream += 'ET\n'

    const streamBytes = new TextEncoder().encode(stream)

    // Content stream object
    const contentObjNum = nextObj++
    objects.push(`${contentObjNum} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}endstream\nendobj`)

    // Page object
    const pageObjNum = nextObj++
    objects.push(`${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>\nendobj`)
    pageRefs.push(pageObjNum)
  }

  // Fill Pages object (obj 2)
  objects[1] = `2 0 obj\n<< /Type /Pages /Kids [${pageRefs.map(r => `${r} 0 R`).join(' ')}] /Count ${pageRefs.length} >>\nendobj`

  // Build final PDF
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []

  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length)
    pdf += objects[i] + '\n'
  }

  const xrefOffset = pdf.length
  pdf += 'xref\n'
  pdf += `0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`
  }
  pdf += 'trailer\n'
  pdf += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
  pdf += 'startxref\n'
  pdf += `${xrefOffset}\n`
  pdf += '%%EOF'

  return new TextEncoder().encode(pdf)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const body = await req.json()
    const { website_url, ig_handle, chat_id } = body

    if (!website_url && !ig_handle) {
      return new Response(JSON.stringify({ error: 'Provide at least a website_url or ig_handle' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Scrape in parallel
    const [websiteResult, igResult] = await Promise.allSettled([
      website_url ? scrapeWebsite(website_url) : Promise.resolve(null),
      ig_handle ? scrapeInstagram(ig_handle) : Promise.resolve(null),
    ])

    const websiteData = websiteResult.status === 'fulfilled' ? websiteResult.value : null
    const igData = igResult.status === 'fulfilled' ? igResult.value : null

    if (!websiteData && !igData) {
      const errors = [
        websiteResult.status === 'rejected' ? `Website: ${websiteResult.reason}` : '',
        igResult.status === 'rejected' ? `IG: ${igResult.reason}` : '',
      ].filter(Boolean).join('; ')
      throw new Error(`Both scrapes failed: ${errors}`)
    }

    console.log('[audit] Scrape complete. Website:', !!websiteData, 'IG:', !!igData)

    // Generate AI analysis
    const report = await generateAnalysis(
      websiteData || { markdown: '', metadata: {}, links: [], branding: null },
      igData,
      website_url || 'N/A',
      ig_handle || null,
    )

    console.log('[audit] AI analysis complete, length:', report.length)

    // Generate PDF
    const pdfBytes = generatePDF(report, website_url || 'N/A', ig_handle || null)

    // Upload PDF to storage
    const fileName = `audit-${(ig_handle || website_url || 'report').replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.pdf`
    const { error: uploadErr } = await supabase.storage
      .from('content-uploads')
      .upload(`audits/${fileName}`, pdfBytes, { contentType: 'application/pdf' })

    if (uploadErr) console.error('[audit] Upload error:', uploadErr)

    const { data: publicUrl } = supabase.storage
      .from('content-uploads')
      .getPublicUrl(`audits/${fileName}`)

    // Store as content asset
    await supabase.from('content_assets').insert({
      title: `Audit: ${ig_handle || website_url || 'Unknown'}`,
      type: 'document',
      status: 'published',
      url: publicUrl?.publicUrl || '',
      source: 'audit-report',
      category: 'audit',
      body: report.slice(0, 5000),
      tags: ['audit', website_url || '', ig_handle || ''].filter(Boolean),
    })

    return new Response(JSON.stringify({
      success: true,
      report_text: report,
      pdf_url: publicUrl?.publicUrl || '',
      pdf_base64: btoa(String.fromCharCode(...pdfBytes)),
      website_scraped: !!websiteData,
      ig_scraped: !!igData,
      ig_data: igData ? {
        followers: igData.followersCount,
        posts: igData.postsCount,
        engagement_rate: igData.followersCount > 0 && igData.recentPosts?.length > 0
          ? ((igData.recentPosts.reduce((a: number, p: any) => a + p.likes + p.comments, 0) / igData.recentPosts.length / igData.followersCount) * 100).toFixed(2) + '%'
          : 'N/A',
      } : null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[audit-report] error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Audit failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
