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

  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: formattedUrl, formats: ['markdown', 'screenshot', 'links', 'branding'], onlyMainContent: false, waitFor: 10000 }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Firecrawl failed: ${res.status}`)

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

  const runRes = await fetch('https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=' + token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [cleanHandle], resultsLimit: 12 }),
    signal: AbortSignal.timeout(120000),
  })

  if (!runRes.ok) throw new Error(`Apify scrape failed: ${runRes.status}`)

  const items = await runRes.json()
  const profile = items?.[0] || {}

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

// ─── Apify: scrape Facebook page ───
async function scrapeFacebook(fbUrl: string): Promise<any> {
  const token = Deno.env.get('APIFY_TOKEN')
  if (!token) throw new Error('APIFY_TOKEN not configured')

  // Extract the page slug/ID from the URL
  const cleanUrl = fbUrl.replace(/\/$/, '')

  try {
    const runRes = await fetch('https://api.apify.com/v2/acts/apify~facebook-pages-scraper/run-sync-get-dataset-items?token=' + token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startUrls: [{ url: cleanUrl }], resultsLimit: 1 }),
      signal: AbortSignal.timeout(120000),
    })

    if (!runRes.ok) {
      console.warn(`[audit] Facebook Apify scrape failed: ${runRes.status}, trying Firecrawl fallback...`)
      return await scrapeFacebookFallback(cleanUrl)
    }

    const items = await runRes.json()
    const page = items?.[0] || {}

    return {
      platform: 'facebook',
      pageName: page.title || page.name || '',
      pageUrl: cleanUrl,
      likes: page.likes || page.likesCount || 0,
      followers: page.followers || page.followersCount || 0,
      about: page.about || page.description || page.info || '',
      category: page.categories?.join(', ') || page.category || '',
      rating: page.overallStarRating || null,
      reviewCount: page.reviewsCount || 0,
      isVerified: page.verified || page.isVerified || false,
      profilePicUrl: page.profilePhoto || page.profilePicUrl || '',
      address: page.address || '',
      phone: page.phone || '',
      website: page.website || '',
      checkins: page.checkins || 0,
    }
  } catch (e) {
    console.warn('[audit] Facebook Apify error, trying fallback:', e)
    return await scrapeFacebookFallback(cleanUrl)
  }
}

// Fallback: scrape Facebook page via Firecrawl for basic info
async function scrapeFacebookFallback(fbUrl: string): Promise<any> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY')
  if (!apiKey) return { platform: 'facebook', pageName: '', pageUrl: fbUrl, likes: 0, followers: 0, about: '' }

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: fbUrl, formats: ['markdown'], onlyMainContent: false, waitFor: 5000 }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return { platform: 'facebook', pageName: '', pageUrl: fbUrl, likes: 0, followers: 0, about: '' }
    const data = await res.json()
    const md = data.data?.markdown || data.markdown || ''
    const title = data.data?.metadata?.title || ''

    // Try to extract follower/like counts from markdown text
    const followersMatch = md.match(/([\d,]+)\s*followers/i)
    const likesMatch = md.match(/([\d,]+)\s*likes/i)

    return {
      platform: 'facebook',
      pageName: title.replace(/ \| Facebook$/i, '').replace(/ - Facebook$/i, ''),
      pageUrl: fbUrl,
      likes: likesMatch ? parseInt(likesMatch[1].replace(/,/g, '')) : 0,
      followers: followersMatch ? parseInt(followersMatch[1].replace(/,/g, '')) : 0,
      about: md.slice(0, 1000),
      category: '',
      rating: null,
      reviewCount: 0,
    }
  } catch {
    return { platform: 'facebook', pageName: '', pageUrl: fbUrl, likes: 0, followers: 0, about: '' }
  }
}

async function generateAnalysis(websiteData: any, igData: any | null, fbData: any | null, websiteUrl: string, igHandle: string | null): Promise<any> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) throw new Error('LOVABLE_API_KEY not configured')

  const websiteSection = `
WEBSITE URL: ${websiteUrl}
Title: ${websiteData.metadata?.title || 'N/A'}
Description: ${websiteData.metadata?.description || 'N/A'}
Total links: ${websiteData.links?.length || 0}
Branding: ${websiteData.branding ? JSON.stringify(websiteData.branding, null, 2) : 'None'}
Content (first 5000 chars): ${(websiteData.markdown || '').slice(0, 5000)}
`

  const igSection = igData ? `
INSTAGRAM: @${igData.username}
Name: ${igData.fullName}
Bio: ${igData.biography}
Followers: ${igData.followersCount}
Following: ${igData.followsCount}
Posts: ${igData.postsCount}
Verified: ${igData.isVerified}
Business: ${igData.isBusinessAccount}
Category: ${igData.businessCategory || 'None'}
Avg likes: ${igData.recentPosts.length > 0 ? Math.round(igData.recentPosts.reduce((a: number, p: any) => a + p.likes, 0) / igData.recentPosts.length) : 0}
Avg comments: ${igData.recentPosts.length > 0 ? Math.round(igData.recentPosts.reduce((a: number, p: any) => a + p.comments, 0) / igData.recentPosts.length) : 0}
Engagement rate: ${igData.followersCount > 0 && igData.recentPosts.length > 0 ? ((igData.recentPosts.reduce((a: number, p: any) => a + p.likes + p.comments, 0) / igData.recentPosts.length / igData.followersCount) * 100).toFixed(2) : '0'}%
` : 'No Instagram data.'

  const fbSection = fbData ? `
FACEBOOK PAGE: ${fbData.pageName || fbData.pageUrl}
URL: ${fbData.pageUrl}
Likes: ${fbData.likes || 0}
Followers: ${fbData.followers || 0}
Category: ${fbData.category || 'N/A'}
Rating: ${fbData.rating ? `${fbData.rating}/5 (${fbData.reviewCount} reviews)` : 'N/A'}
Verified: ${fbData.isVerified || false}
About: ${(fbData.about || '').slice(0, 500)}
Address: ${fbData.address || 'N/A'}
Phone: ${fbData.phone || 'N/A'}
Website (from FB): ${fbData.website || 'N/A'}
Check-ins: ${fbData.checkins || 0}
` : 'No Facebook data.'

  const prompt = `Analyze this business's digital presence and return ONLY valid JSON (no markdown, no backticks). Keep language simple — a 10-year-old should understand every point. Use short sentences. Be specific and actionable.

CRITICAL RULES — READ CAREFULLY:
1. ONLY state things you can DIRECTLY SEE in the scraped data provided below. Never assume, infer, or guess information that is not explicitly present.
2. Do NOT make claims about what a logo says, what colors are used, or what images show — you cannot see images, only text content. If you want to comment on branding, say "Based on the text content..." not "The logo says..."
3. Do NOT make geographic claims unless an address is explicitly stated in the scraped text.
4. Do NOT fabricate specific details. If you're unsure about something, skip it or say "Could not verify from available data."
5. Every point in website_good, website_bad, social_good, social_bad MUST be directly supported by the data below. If you can't find 3 real issues, list fewer — NEVER make things up to fill the list.
6. For each issue found, reference WHERE in the data you found it (e.g. "The meta description is missing" or "The bio mentions X but the website doesn't").
7. Focus on what IS verifiable: page title, meta tags, link count, content structure, social stats, engagement rates, bio text, posting frequency.

${websiteSection}
${igSection}
${fbSection}

Return this exact JSON structure:
{
  "business_name": "string — extract from page title or content, do not guess",
  "tagline": "One sentence summary of what this business does based on their content",
  "overall_score": 0-100,
  "website_score": 0-100,
  "social_score": 0-100,
  "seo_score": 0-100,
  "branding_score": 0-100,
  "content_score": 0-100,
  "website_good": [{"text": "verifiable thing they do well — cite evidence", "confidence": "high|medium|low"}],
  "website_bad": [{"text": "verifiable problem — cite evidence, with fix", "confidence": "high|medium|low"}],
  "social_good": [{"text": "verifiable thing on social — cite evidence", "confidence": "high|medium|low"}],
  "social_bad": [{"text": "verifiable problem on social — cite evidence, with fix", "confidence": "high|medium|low"}],
  "quick_wins": [{"text": "thing we can fix THIS WEEK — grounded in real data", "confidence": "high|medium|low"}],
  "big_moves": ["Up to 3 strategic projects for major growth (1-4 weeks)"],
  "competitor_edge": "One paragraph on what makes them unique based on their actual content",
  "essential_package": "2-3 sentence description of quick-fix package",
  "growth_package": "2-3 sentence description of growth package",
  "premium_package": "2-3 sentence description of full-service package",
  "sources_evidence": [
    {
      "finding": "Short description of the finding or claim made in this report",
      "data_source": "website_content | meta_tags | ig_profile | ig_stats | ig_posts | fb_page | fb_stats | fb_reviews | link_analysis | branding_data",
      "exact_evidence": "The exact text, number, or data point from the scraped data that supports this finding — quote it verbatim where possible"
    }
  ]
}

Confidence levels:
- "high" = directly and clearly visible in the scraped data (e.g. exact text, meta tag present/missing, specific stat)
- "medium" = strongly implied but requires minor interpretation (e.g. engagement rate calculation, content tone analysis)
- "low" = reasonable inference based on limited data (e.g. assumption about mobile experience from content structure)

Up to 3 items per array. Each item MUST have a confidence level.

IMPORTANT for sources_evidence: Include one entry for EVERY specific claim made in website_good, website_bad, social_good, social_bad, and quick_wins. Each entry must quote the exact data that proves the claim. This is for accountability — if you cannot provide exact evidence, do not make the claim.`

  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        { role: 'system', content: 'You are a digital marketing consultant producing audit reports. Return ONLY valid JSON. No markdown. No code fences. CRITICAL: You must ONLY report facts that are directly verifiable from the scraped text data provided. You CANNOT see images, logos, or visual design elements — do not comment on them. Never fabricate, assume, or guess details. If you cannot verify something from the data, do not include it. Accuracy and honesty are more important than filling every field.' },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!res.ok) {
    console.error('[audit] AI analysis HTTP error:', res.status)
    return fallbackAnalysis()
  }

  let aiResult: any
  try {
    const rawText = await res.text()
    if (!rawText || rawText.trim().length === 0) {
      console.error('[audit] AI returned empty body')
      return fallbackAnalysis()
    }
    aiResult = JSON.parse(rawText)
  } catch (e) {
    console.error('[audit] Failed to parse AI response body:', e)
    return fallbackAnalysis()
  }

  const raw = aiResult.choices?.[0]?.message?.content || '{}'
  
  // Strip any markdown fences
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  
  try {
    return JSON.parse(cleaned)
  } catch {
    // Try recovery: find last complete JSON object
    const lastBrace = cleaned.lastIndexOf('}')
    if (lastBrace > 0) {
      try {
        return JSON.parse(cleaned.substring(0, lastBrace + 1))
      } catch { /* fall through */ }
    }
    console.error('[audit] Failed to parse AI JSON, raw:', raw.slice(0, 500))
    return fallbackAnalysis()
  }
}

function fallbackAnalysis() {
  return { business_name: 'Unknown', tagline: '', overall_score: 50, website_score: 50, social_score: 50, seo_score: 50, branding_score: 50, content_score: 50, website_good: [{ text: 'Data unavailable — scraping was blocked', confidence: 'low' }], website_bad: [{ text: 'Could not access website for analysis — try again later', confidence: 'low' }], social_good: [{ text: 'Data unavailable', confidence: 'low' }], social_bad: [{ text: 'Could not access social data', confidence: 'low' }], quick_wins: [{ text: 'Re-run audit when website is accessible', confidence: 'low' }], big_moves: ['Contact us for a manual review'], competitor_edge: 'N/A', essential_package: 'Quick-fix improvements to get your digital presence started.', growth_package: 'Comprehensive growth strategy with ongoing support.', premium_package: 'Full-service digital transformation.', sources_evidence: [] }
}

// ─────────────────────────────────────────────────────────
// VISUAL PDF GENERATOR — branded, colorful, score bars
// ─────────────────────────────────────────────────────────

class PDFBuilder {
  private objects: string[] = []
  private pages: { contentObj: number; pageObj: number }[] = []
  private nextObj = 1
  private pageWidth = 595.28
  private pageHeight = 841.89
  private currentStream = ''
  private imageObjects: Map<string, { objNum: number; width: number; height: number; isJpeg: boolean }> = new Map()
  private currentPageImageRefs: string[] = []

  // Colors (RGB 0-1)
  private colors = {
    navy: [0.071, 0.098, 0.169],      // #121B2B
    accent: [0.286, 0.502, 1.0],       // #4980FF
    green: [0.2, 0.78, 0.4],           // #33C766
    orange: [1.0, 0.6, 0.2],           // #FF9933
    red: [0.95, 0.25, 0.25],           // #F24040
    white: [1, 1, 1],
    lightGray: [0.94, 0.95, 0.96],     // #F0F1F5
    darkText: [0.15, 0.15, 0.2],       // #262633
    midText: [0.45, 0.45, 0.52],       // #737385
    gold: [1.0, 0.76, 0.03],           // #FFC208
  }

  private allocObj(): number {
    return this.nextObj++
  }

  private escText(t: string): string {
    return t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  }

  // Drawing primitives
  private rect(x: number, y: number, w: number, h: number, color: number[], fill = true) {
    this.currentStream += `${color[0]} ${color[1]} ${color[2]} ${fill ? 'rg' : 'RG'}\n`
    this.currentStream += `${x} ${y} ${w} ${h} re ${fill ? 'f' : 'S'}\n`
  }

  private roundedRect(x: number, y: number, w: number, h: number, r: number, color: number[]) {
    this.currentStream += `${color[0]} ${color[1]} ${color[2]} rg\n`
    // Approximate rounded rect with bezier
    const k = 0.5523 * r
    this.currentStream += `${x + r} ${y} m\n`
    this.currentStream += `${x + w - r} ${y} l\n`
    this.currentStream += `${x + w - r + k} ${y} ${x + w} ${y + r - k} ${x + w} ${y + r} c\n`
    this.currentStream += `${x + w} ${y + h - r} l\n`
    this.currentStream += `${x + w} ${y + h - r + k} ${x + w - r + k} ${y + h} ${x + w - r} ${y + h} c\n`
    this.currentStream += `${x + r} ${y + h} l\n`
    this.currentStream += `${x + r - k} ${y + h} ${x} ${y + h - r + k} ${x} ${y + h - r} c\n`
    this.currentStream += `${x} ${y + r} l\n`
    this.currentStream += `${x} ${y + r - k} ${x + r - k} ${y} ${x + r} ${y} c\n`
    this.currentStream += `f\n`
  }

  private text(x: number, y: number, str: string, size: number, color: number[], bold = false) {
    const fontKey = bold ? '/F2' : '/F1'
    this.currentStream += `BT\n`
    this.currentStream += `${color[0]} ${color[1]} ${color[2]} rg\n`
    this.currentStream += `${fontKey} ${size} Tf\n`
    this.currentStream += `${x} ${y} Td\n`
    this.currentStream += `(${this.escText(str)}) Tj\n`
    this.currentStream += `ET\n`
  }

  private line(x1: number, y1: number, x2: number, y2: number, color: number[], width = 1) {
    this.currentStream += `${color[0]} ${color[1]} ${color[2]} RG\n`
    this.currentStream += `${width} w\n`
    this.currentStream += `${x1} ${y1} m ${x2} ${y2} l S\n`
  }

  private circle(cx: number, cy: number, r: number, color: number[]) {
    const k = 0.5523 * r
    this.currentStream += `${color[0]} ${color[1]} ${color[2]} rg\n`
    this.currentStream += `${cx + r} ${cy} m\n`
    this.currentStream += `${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r} c\n`
    this.currentStream += `${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy} c\n`
    this.currentStream += `${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r} c\n`
    this.currentStream += `${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy} c\n`
    this.currentStream += `f\n`
  }

  private scoreBar(x: number, y: number, w: number, h: number, score: number, label: string, darkBg = false) {
    // Background bar
    this.roundedRect(x, y, w, h, 4, darkBg ? [0.15, 0.19, 0.28] : this.colors.lightGray)
    // Filled portion
    const fillW = Math.max(8, (score / 100) * w)
    const barColor = score >= 70 ? this.colors.green : score >= 40 ? this.colors.orange : this.colors.red
    this.roundedRect(x, y, fillW, h, 4, barColor)
    // Label
    const labelColor = darkBg ? this.colors.white : this.colors.darkText
    this.text(x, y + h + 6, label, 9, labelColor, true)
    // Score
    this.text(x + w - 20, y + h + 6, `${score}`, 9, barColor, true)
  }

  private scoreCircle(cx: number, cy: number, score: number, label: string) {
    const r = 32
    const color = score >= 70 ? this.colors.green : score >= 40 ? this.colors.orange : this.colors.red
    // Outer ring
    this.circle(cx, cy, r, color)
    // Inner white
    this.circle(cx, cy, r - 5, this.colors.white)
    // Score text
    this.text(cx - (score >= 100 ? 14 : score >= 10 ? 10 : 5), cy - 7, `${score}`, 20, color, true)
    // Label below
    const labelX = cx - (label.length * 2.5)
    this.text(labelX, cy - r - 16, label, 8, this.colors.midText, true)
  }

  private bulletPoint(x: number, y: number, text_str: string, color: number[], isGood: boolean, confidence?: string): number {
    const icon = isGood ? '+' : '!'
    const iconColor = isGood ? this.colors.green : this.colors.red
    // Icon circle
    this.circle(x + 5, y + 4, 5, iconColor)
    this.text(x + 2.5, y + 0.5, icon, 8, this.colors.white, true)
    
    // Confidence badge (right-aligned)
    if (confidence) {
      const badgeColor = confidence === 'high' ? this.colors.green : confidence === 'medium' ? this.colors.gold : this.colors.midText
      const badgeLabel = confidence.toUpperCase()
      const badgeW = badgeLabel.length * 5 + 12
      const badgeX = this.pageWidth - 40 - badgeW
      this.roundedRect(badgeX, y - 1, badgeW, 13, 4, badgeColor)
      this.text(badgeX + 6, y + 1, badgeLabel, 6.5, this.colors.white, true)
    }
    
    // Text - word wrap
    const maxW = confidence ? 65 : 75
    const words = text_str.split(' ')
    let currentLine = ''
    let lineY = y
    const lines: string[] = []
    for (const word of words) {
      const test = currentLine ? currentLine + ' ' + word : word
      if (test.length > maxW && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = test
      }
    }
    if (currentLine) lines.push(currentLine)
    for (const ln of lines) {
      this.text(x + 16, lineY, ln, 9, this.colors.darkText)
      lineY -= 14
    }
    return lineY - 4
  }

  private sectionHeader(y: number, title: string, icon: string): number {
    // Accent bar on left
    this.rect(40, y - 4, 4, 20, this.colors.accent)
    this.text(52, y, `${icon}  ${title}`, 14, this.colors.navy, true)
    this.line(40, y - 8, 555, y - 8, this.colors.lightGray, 1)
    return y - 28
  }

  private wordWrapText(x: number, y: number, str: string, size: number, color: number[], maxChars: number, bold = false): number {
    const words = str.split(' ')
    let currentLine = ''
    let lineY = y
    for (const word of words) {
      const test = currentLine ? currentLine + ' ' + word : word
      if (test.length > maxChars && currentLine) {
        this.text(x, lineY, currentLine, size, color, bold)
        lineY -= size + 4
        currentLine = word
      } else {
        currentLine = test
      }
    }
    if (currentLine) {
      this.text(x, lineY, currentLine, size, color, bold)
      lineY -= size + 4
    }
    return lineY
  }

  // Register an image (JPEG or PNG) for embedding
  async registerImage(name: string, imgBytes: Uint8Array, width: number, height: number) {
    const objNum = this.allocObj()
    const isJpeg = imgBytes[0] === 0xFF && imgBytes[1] === 0xD8
    
    if (isJpeg) {
      this.objects.push(
        `${objNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`
      )
      ;(this as any)[`_imgBytes_${name}`] = imgBytes
      this.imageObjects.set(name, { objNum, width, height, isJpeg: true })
      return
    }
    
    // PNG — parse IHDR and IDAT chunks
    const idatChunks: Uint8Array[] = []
    let pngWidth = width, pngHeight = height, bitDepth = 8, colorType = 2
    let offset = 8 // skip PNG signature
    while (offset + 8 <= imgBytes.length) {
      const len = (imgBytes[offset] << 24) | (imgBytes[offset+1] << 16) | (imgBytes[offset+2] << 8) | imgBytes[offset+3]
      const type = String.fromCharCode(imgBytes[offset+4], imgBytes[offset+5], imgBytes[offset+6], imgBytes[offset+7])
      if (type === 'IHDR') {
        pngWidth = (imgBytes[offset+8] << 24) | (imgBytes[offset+9] << 16) | (imgBytes[offset+10] << 8) | imgBytes[offset+11]
        pngHeight = (imgBytes[offset+12] << 24) | (imgBytes[offset+13] << 16) | (imgBytes[offset+14] << 8) | imgBytes[offset+15]
        bitDepth = imgBytes[offset+16]
        colorType = imgBytes[offset+17]
      } else if (type === 'IDAT') {
        idatChunks.push(imgBytes.slice(offset + 8, offset + 8 + len))
      } else if (type === 'IEND') break
      offset += 12 + len
    }
    
    // Concatenate IDAT chunks (zlib-compressed data)
    let totalIdatLen = 0
    for (const c of idatChunks) totalIdatLen += c.length
    const zlibData = new Uint8Array(totalIdatLen)
    let pos = 0
    for (const c of idatChunks) { zlibData.set(c, pos); pos += c.length }
    
    // Decompress zlib data to get raw filtered scanlines
    const ds = new DecompressionStream('deflate')
    // Strip 2-byte zlib header for raw deflate — actually DecompressionStream('deflate') 
    // handles raw deflate. Zlib = 2 byte header + deflate + 4 byte checksum.
    // Use 'deflate' which expects zlib-wrapped data in most runtimes
    let rawPixels: Uint8Array
    try {
      // Try with full zlib data first (DecompressionStream handles zlib wrapper)
      const blob = new Blob([zlibData])
      const decompStream = blob.stream().pipeThrough(new DecompressionStream('deflate'))
      const reader = decompStream.getReader()
      const decompChunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        decompChunks.push(value)
      }
      let decompLen = 0
      for (const c of decompChunks) decompLen += c.length
      rawPixels = new Uint8Array(decompLen)
      let dp = 0
      for (const c of decompChunks) { rawPixels.set(c, dp); dp += c.length }
    } catch (e) {
      console.error(`[audit] PNG decompression failed for ${name}:`, e)
      return
    }
    
    // Determine bytes per pixel
    const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1
    const hasAlpha = colorType === 4 || colorType === 6
    const srcBpp = channels
    const dstBpp = hasAlpha ? channels - 1 : channels // strip alpha for PDF
    const rowBytes = pngWidth * srcBpp + 1 // +1 for filter byte
    
    // Reconstruct unfiltered pixel data (apply PNG filters)
    const unfiltered = new Uint8Array(pngHeight * pngWidth * srcBpp)
    const prevRow = new Uint8Array(pngWidth * srcBpp)
    
    for (let row = 0; row < pngHeight; row++) {
      const rowStart = row * rowBytes
      const filterType = rawPixels[rowStart]
      const scanline = rawPixels.slice(rowStart + 1, rowStart + 1 + pngWidth * srcBpp)
      const decoded = new Uint8Array(pngWidth * srcBpp)
      
      for (let i = 0; i < scanline.length; i++) {
        const a = i >= srcBpp ? decoded[i - srcBpp] : 0
        const b = prevRow[i]
        const c = i >= srcBpp ? prevRow[i - srcBpp] : 0
        
        switch (filterType) {
          case 0: decoded[i] = scanline[i]; break
          case 1: decoded[i] = (scanline[i] + a) & 0xFF; break
          case 2: decoded[i] = (scanline[i] + b) & 0xFF; break
          case 3: decoded[i] = (scanline[i] + ((a + b) >> 1)) & 0xFF; break
          case 4: { // Paeth
            const p = a + b - c
            const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
            const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
            decoded[i] = (scanline[i] + pr) & 0xFF
            break
          }
          default: decoded[i] = scanline[i]
        }
      }
      
      unfiltered.set(decoded, row * pngWidth * srcBpp)
      prevRow.set(decoded)
    }
    
    // Extract RGB only (strip alpha if RGBA)
    let rgbData: Uint8Array
    if (hasAlpha && channels === 4) {
      rgbData = new Uint8Array(pngHeight * pngWidth * 3)
      for (let i = 0, j = 0; i < unfiltered.length; i += 4, j += 3) {
        rgbData[j] = unfiltered[i]
        rgbData[j + 1] = unfiltered[i + 1]
        rgbData[j + 2] = unfiltered[i + 2]
      }
    } else if (channels === 3) {
      rgbData = unfiltered
    } else {
      // Grayscale — expand to RGB
      rgbData = new Uint8Array(pngHeight * pngWidth * 3)
      const step = hasAlpha ? 2 : 1
      for (let i = 0, j = 0; i < unfiltered.length; i += step, j += 3) {
        rgbData[j] = rgbData[j + 1] = rgbData[j + 2] = unfiltered[i]
      }
    }
    
    // Compress RGB data with deflate for PDF FlateDecode
    let compressedRgb: Uint8Array
    try {
      const blob = new Blob([rgbData])
      const compStream = blob.stream().pipeThrough(new CompressionStream('deflate'))
      const reader = compStream.getReader()
      const compChunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        compChunks.push(value)
      }
      let compLen = 0
      for (const c of compChunks) compLen += c.length
      compressedRgb = new Uint8Array(compLen)
      let cp = 0
      for (const c of compChunks) { compressedRgb.set(c, cp); cp += c.length }
    } catch (e) {
      console.error(`[audit] PNG compression failed for ${name}:`, e)
      return
    }
    
    this.objects.push(
      `${objNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pngWidth} /Height ${pngHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressedRgb.length} >>\nstream\n`
    )
    ;(this as any)[`_imgBytes_${name}`] = compressedRgb
    this.imageObjects.set(name, { objNum, width: pngWidth, height: pngHeight, isJpeg: false })
    console.log(`[audit] PNG ${name} decoded: ${pngWidth}x${pngHeight} colorType=${colorType} → ${compressedRgb.length} bytes compressed RGB`)
  }

  // Place a registered image on the current page
  private placeImage(name: string, x: number, y: number, displayW: number, displayH: number) {
    if (!this.imageObjects.has(name)) return
    this.currentStream += `q\n${displayW} 0 0 ${displayH} ${x} ${y} cm\n/Img_${name} Do\nQ\n`
    if (!this.currentPageImageRefs.includes(name)) {
      this.currentPageImageRefs.push(name)
    }
  }

  build(data: any, websiteUrl: string, igHandle: string | null, fbUrl: string | null = null): Uint8Array {
    // Reserve first objects for catalog, pages, fonts
    const catalogObj = this.allocObj() // 1
    const pagesObj = this.allocObj()   // 2
    const font1Obj = this.allocObj()   // 3
    const font2Obj = this.allocObj()   // 4

    const pageRefs: number[] = []

    // ═══════════════════════════════════════════
    // PAGE 1 — COVER
    // ═══════════════════════════════════════════
    this.currentStream = ''
    
    // Full navy background
    this.rect(0, 0, this.pageWidth, this.pageHeight, this.colors.navy)
    
    // Accent stripe top
    this.rect(0, this.pageHeight - 8, this.pageWidth, 8, this.colors.accent)
    
    // Decorative circles
    this.circle(480, 720, 60, [0.1, 0.14, 0.22])
    this.circle(120, 200, 40, [0.1, 0.14, 0.22])
    this.circle(500, 150, 25, [0.1, 0.14, 0.22])
    
    // "DIGITAL AUDIT" label
    this.roundedRect(40, 680, 130, 24, 12, this.colors.accent)
    this.text(55, 685, 'DIGITAL AUDIT', 10, this.colors.white, true)
    
    // Business name — auto-size to fit
    const bizName = (data.business_name || 'Business').toUpperCase()
    const nameLen = bizName.length
    let nameSize = 32
    let maxCharsName = 22
    if (nameLen > 30) { nameSize = 20; maxCharsName = 36 }
    else if (nameLen > 22) { nameSize = 24; maxCharsName = 30 }
    const nameBottomY = this.wordWrapText(40, 640, bizName, nameSize, this.colors.white, maxCharsName, true)
    
    // Tagline
    if (data.tagline) {
      this.wordWrapText(40, nameBottomY - 4, data.tagline, 12, this.colors.midText, 70)
    }
    
    // Big overall score
    this.circle(298, 430, 75, [0.12, 0.16, 0.25])
    this.circle(298, 430, 65, this.colors.navy)
    const overallScore = data.overall_score || 50
    const scoreColor = overallScore >= 70 ? this.colors.green : overallScore >= 40 ? this.colors.orange : this.colors.red
    this.text(overallScore >= 100 ? 265 : overallScore >= 10 ? 272 : 285, 418, `${overallScore}`, 42, scoreColor, true)
    this.text(260, 390, 'OVERALL SCORE', 10, this.colors.midText, true)
    
    // Score bars on cover
    const barY = 310
    this.scoreBar(80, barY, 180, 10, data.website_score || 0, 'Website', true)
    this.scoreBar(80, barY - 36, 180, 10, data.seo_score || 0, 'SEO', true)
    this.scoreBar(330, barY, 180, 10, data.social_score || 0, 'Social Media', true)
    this.scoreBar(330, barY - 36, 180, 10, data.branding_score || 0, 'Branding', true)
    
    // Footer
    this.text(40, 50, 'Warren Guru Creative Management / STU25', 10, this.colors.midText, true)
    this.text(40, 36, new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 9, this.colors.midText)
    this.text(400, 50, websiteUrl || '', 8, this.colors.midText)
    if (igHandle) this.text(400, 36, `@${igHandle}`, 8, this.colors.accent)
    
    // Accent stripe bottom
    this.rect(0, 0, this.pageWidth, 4, this.colors.accent)
    
    this.finalizePage(pagesObj, font1Obj, font2Obj, pageRefs)
    
    // ═══════════════════════════════════════════
    // PAGE 2 — WEBSITE ANALYSIS
    // ═══════════════════════════════════════════
    this.currentStream = ''
    
    // Header bar
    this.rect(0, this.pageHeight - 50, this.pageWidth, 50, this.colors.navy)
    this.text(40, this.pageHeight - 35, 'WEBSITE ANALYSIS', 16, this.colors.white, true)
    this.scoreCircle(530, this.pageHeight - 25, data.website_score || 0, 'SCORE')
    
    let y = this.pageHeight - 90
    
    // Website screenshot
    if (this.imageObjects.has('website')) {
      this.roundedRect(40, y - 220, this.pageWidth - 80, 220, 8, [0.1, 0.14, 0.22])
      this.placeImage('website', 48, y - 212, this.pageWidth - 96, 204)
      this.text(40, y - 228, 'Current Website Screenshot', 8, this.colors.midText, true)
      y -= 250
    }
    
    // What's Working section
    y = this.sectionHeader(y, "What's Working Well", '>')
    const goods = data.website_good || ['No data']
    for (const item of goods) {
      const txt = typeof item === 'object' ? item.text : item
      const conf = typeof item === 'object' ? item.confidence : undefined
      y = this.bulletPoint(50, y, txt, this.colors.green, true, conf)
      if (y < 100) break
    }
    
    y -= 16
    
    // What Needs Work section
    y = this.sectionHeader(y, 'What Needs Work', '!')
    const bads = data.website_bad || ['No data']
    for (const item of bads) {
      const txt = typeof item === 'object' ? item.text : item
      const conf = typeof item === 'object' ? item.confidence : undefined
      y = this.bulletPoint(50, y, txt, this.colors.red, false, conf)
      if (y < 100) break
    }
    
    y -= 16
    
    // SEO & Content scores side by side
    if (y > 180) {
      y = this.sectionHeader(y, 'Performance Breakdown', '#')
      y -= 10
      this.scoreBar(50, y, 200, 12, data.seo_score || 0, 'SEO Score')
      this.scoreBar(310, y, 200, 12, data.content_score || 0, 'Content Score')
      y -= 20
      this.scoreBar(50, y, 200, 12, data.branding_score || 0, 'Branding Score')
    }
    
    // Footer
    this.pageFooter(1)
    this.finalizePage(pagesObj, font1Obj, font2Obj, pageRefs)
    
    // ═══════════════════════════════════════════
    // PAGE 3 — SOCIAL MEDIA ANALYSIS
    // ═══════════════════════════════════════════
    this.currentStream = ''
    
    this.rect(0, this.pageHeight - 50, this.pageWidth, 50, this.colors.navy)
    this.text(40, this.pageHeight - 35, 'SOCIAL MEDIA ANALYSIS', 16, this.colors.white, true)
    this.scoreCircle(530, this.pageHeight - 25, data.social_score || 0, 'SCORE')
    
    y = this.pageHeight - 90
    
    // Instagram profile picture
    if (igHandle && this.imageObjects.has('instagram')) {
      this.roundedRect(40, y - 90, 90, 90, 8, [0.1, 0.14, 0.22])
      this.placeImage('instagram', 45, y - 85, 80, 80)
      this.text(140, y - 20, `@${igHandle}`, 14, this.colors.accent, true)
      this.text(140, y - 40, data.business_name || '', 10, this.colors.darkText)
      y -= 105
    }
    
    // Social stats cards (if IG data)
    if (igHandle) {
      // Stats row
      const cardW = 110
      const cardH = 55
      const startX = 50
      y -= 10
      
      // Followers card
      this.roundedRect(startX, y - cardH, cardW, cardH, 6, this.colors.lightGray)
      this.text(startX + 10, y - 18, 'Followers', 8, this.colors.midText, true)
      this.text(startX + 10, y - 38, String(data._ig_followers || 0), 16, this.colors.navy, true)
      
      // Posts card
      this.roundedRect(startX + cardW + 15, y - cardH, cardW, cardH, 6, this.colors.lightGray)
      this.text(startX + cardW + 25, y - 18, 'Posts', 8, this.colors.midText, true)
      this.text(startX + cardW + 25, y - 38, String(data._ig_posts || 0), 16, this.colors.navy, true)
      
      // Engagement card
      this.roundedRect(startX + (cardW + 15) * 2, y - cardH, cardW, cardH, 6, this.colors.lightGray)
      this.text(startX + (cardW + 15) * 2 + 10, y - 18, 'Engagement', 8, this.colors.midText, true)
      this.text(startX + (cardW + 15) * 2 + 10, y - 38, data._ig_engagement || 'N/A', 14, this.colors.navy, true)
      
      // Score card
      this.roundedRect(startX + (cardW + 15) * 3, y - cardH, cardW, cardH, 6, this.colors.accent)
      this.text(startX + (cardW + 15) * 3 + 10, y - 18, 'Social Score', 8, this.colors.white, true)
      this.text(startX + (cardW + 15) * 3 + 10, y - 38, `${data.social_score || 0}/100`, 14, this.colors.white, true)
      
      y -= cardH + 24
    }

    // Facebook stats cards (if FB data)
    if (fbUrl && data._fb_pageName) {
      y -= 6
      this.roundedRect(40, y - 20, this.pageWidth - 80, 20, 4, this.colors.navy)
      this.text(50, y - 14, `Facebook: ${data._fb_pageName}`, 10, this.colors.white, true)
      y -= 32

      const cardW = 110
      const cardH = 55
      const startX = 50

      // Followers card
      this.roundedRect(startX, y - cardH, cardW, cardH, 6, this.colors.lightGray)
      this.text(startX + 10, y - 18, 'Followers', 8, this.colors.midText, true)
      this.text(startX + 10, y - 38, String(data._fb_followers || '0'), 16, this.colors.navy, true)

      // Likes card
      this.roundedRect(startX + cardW + 15, y - cardH, cardW, cardH, 6, this.colors.lightGray)
      this.text(startX + cardW + 25, y - 18, 'Page Likes', 8, this.colors.midText, true)
      this.text(startX + cardW + 25, y - 38, String(data._fb_likes || '0'), 16, this.colors.navy, true)

      // Rating card
      this.roundedRect(startX + (cardW + 15) * 2, y - cardH, cardW, cardH, 6, this.colors.lightGray)
      this.text(startX + (cardW + 15) * 2 + 10, y - 18, 'Rating', 8, this.colors.midText, true)
      this.text(startX + (cardW + 15) * 2 + 10, y - 38, data._fb_rating || 'N/A', 14, this.colors.navy, true)

      // Reviews card
      this.roundedRect(startX + (cardW + 15) * 3, y - cardH, cardW, cardH, 6, this.colors.lightGray)
      this.text(startX + (cardW + 15) * 3 + 10, y - 18, 'Reviews', 8, this.colors.midText, true)
      this.text(startX + (cardW + 15) * 3 + 10, y - 38, String(data._fb_reviews || '0'), 14, this.colors.navy, true)

      y -= cardH + 24
    }
    
    // Social good
    y = this.sectionHeader(y, "What's Working", '>')
    const sgood = data.social_good || ['No data']
    for (const item of sgood) {
      const txt = typeof item === 'object' ? item.text : item
      const conf = typeof item === 'object' ? item.confidence : undefined
      y = this.bulletPoint(50, y, txt, this.colors.green, true, conf)
      if (y < 100) break
    }
    
    y -= 16
    
    // Social bad
    y = this.sectionHeader(y, 'Opportunities', '!')
    const sbad = data.social_bad || ['No data']
    for (const item of sbad) {
      const txt = typeof item === 'object' ? item.text : item
      const conf = typeof item === 'object' ? item.confidence : undefined
      y = this.bulletPoint(50, y, txt, this.colors.red, false, conf)
      if (y < 100) break
    }
    
    this.pageFooter(2)
    this.finalizePage(pagesObj, font1Obj, font2Obj, pageRefs)
    
    // ═══════════════════════════════════════════
    // PAGE 4 — ACTION PLAN
    // ═══════════════════════════════════════════
    this.currentStream = ''
    
    this.rect(0, this.pageHeight - 50, this.pageWidth, 50, this.colors.navy)
    this.text(40, this.pageHeight - 35, 'YOUR ACTION PLAN', 16, this.colors.white, true)
    
    y = this.pageHeight - 90
    
    // Quick Wins
    y = this.sectionHeader(y, 'Quick Wins (This Week)', '>')
    const qwins = data.quick_wins || []
    for (let i = 0; i < qwins.length; i++) {
      const qItem = qwins[i]
      const qText = typeof qItem === 'object' ? qItem.text : qItem
      const qConf = typeof qItem === 'object' ? qItem.confidence : undefined
      // Number badge
      this.circle(58, y + 4, 8, this.colors.accent)
      this.text(55, y, `${i + 1}`, 9, this.colors.white, true)
      // Confidence badge
      if (qConf) {
        const badgeColor = qConf === 'high' ? this.colors.green : qConf === 'medium' ? this.colors.gold : this.colors.midText
        const badgeLabel = qConf.toUpperCase()
        const badgeW = badgeLabel.length * 5 + 12
        const badgeX = this.pageWidth - 40 - badgeW
        this.roundedRect(badgeX, y - 1, badgeW, 13, 4, badgeColor)
        this.text(badgeX + 6, y + 1, badgeLabel, 6.5, this.colors.white, true)
      }
      y = this.wordWrapText(74, y, qText, 9, this.colors.darkText, 65) - 6
      if (y < 250) break
    }
    
    y -= 16
    
    // Big Moves
    y = this.sectionHeader(y, 'Strategic Projects (1-4 Weeks)', '#')
    const bmoves = data.big_moves || []
    for (let i = 0; i < bmoves.length; i++) {
      this.circle(58, y + 4, 8, this.colors.gold)
      this.text(55, y, `${i + 1}`, 9, this.colors.white, true)
      y = this.wordWrapText(74, y, bmoves[i], 9, this.colors.darkText, 72) - 6
      if (y < 140) break
    }
    
    y -= 16
    
    // Competitive edge box
    if (data.competitor_edge && y > 140) {
      this.roundedRect(40, y - 60, this.pageWidth - 80, 70, 8, this.colors.lightGray)
      this.text(55, y - 4, 'YOUR COMPETITIVE EDGE', 10, this.colors.accent, true)
      this.wordWrapText(55, y - 22, data.competitor_edge, 9, this.colors.darkText, 75)
    }
    
    this.pageFooter(3)
    this.finalizePage(pagesObj, font1Obj, font2Obj, pageRefs)
    
    // ═══════════════════════════════════════════
    // PAGE 5 — PACKAGES / CTA
    // ═══════════════════════════════════════════
    this.currentStream = ''
    
    // Full accent header
    this.rect(0, this.pageHeight - 80, this.pageWidth, 80, this.colors.accent)
    this.text(40, this.pageHeight - 40, 'HOW WE CAN HELP', 22, this.colors.white, true)
    this.text(40, this.pageHeight - 60, 'Tailored packages based on your audit results', 11, this.colors.white)
    
    y = this.pageHeight - 120
    
    // Package cards
    const pkgW = (this.pageWidth - 100) / 3
    const pkgH = 220
    const pkgY = y - pkgH
    
    // Essential
    this.roundedRect(40, pkgY, pkgW, pkgH, 8, this.colors.lightGray)
    this.roundedRect(40, pkgY + pkgH - 40, pkgW, 40, 8, this.colors.lightGray) // overlap fix
    this.rect(40, pkgY + pkgH - 8, pkgW, 8, this.colors.green) // top accent
    this.text(55, pkgY + pkgH - 24, 'ESSENTIAL', 12, this.colors.green, true)
    this.text(55, pkgY + pkgH - 42, 'Quick Fixes', 9, this.colors.midText)
    this.wordWrapText(55, pkgY + pkgH - 65, data.essential_package || 'Immediate improvements to boost your online presence.', 8, this.colors.darkText, 26)
    this.text(55, pkgY + 16, '$250/mo', 16, this.colors.green, true)
    
    // Growth
    const gx = 40 + pkgW + 10
    this.roundedRect(gx, pkgY, pkgW, pkgH, 8, this.colors.navy)
    this.rect(gx, pkgY + pkgH - 8, pkgW, 8, this.colors.accent)
    this.text(gx + 15, pkgY + pkgH - 24, 'GROWTH', 12, this.colors.accent, true)
    this.text(gx + 15, pkgY + pkgH - 42, 'Full Overhaul', 9, this.colors.midText)
    this.wordWrapText(gx + 15, pkgY + pkgH - 65, data.growth_package || 'Comprehensive digital presence transformation.', 8, this.colors.white, 26)
    this.text(gx + 15, pkgY + 16, '$500/mo', 16, this.colors.accent, true)
    // "POPULAR" badge
    this.roundedRect(gx + pkgW - 60, pkgY + pkgH + 4, 55, 18, 9, this.colors.gold)
    this.text(gx + pkgW - 52, pkgY + pkgH + 8, 'POPULAR', 8, this.colors.white, true)
    
    // Premium
    const px = gx + pkgW + 10
    this.roundedRect(px, pkgY, pkgW, pkgH, 8, this.colors.lightGray)
    this.rect(px, pkgY + pkgH - 8, pkgW, 8, this.colors.gold)
    this.text(px + 15, pkgY + pkgH - 24, 'PREMIUM', 12, this.colors.gold, true)
    this.text(px + 15, pkgY + pkgH - 42, 'Full Service', 9, this.colors.midText)
    this.wordWrapText(px + 15, pkgY + pkgH - 65, data.premium_package || 'Complete management of your digital presence.', 8, this.colors.darkText, 26)
    this.text(px + 15, pkgY + 16, '$1,000/mo', 16, this.colors.gold, true)
    
    // CTA section
    const ctaY = pkgY - 60
    this.roundedRect(40, ctaY, this.pageWidth - 80, 50, 8, this.colors.accent)
    this.text(60, ctaY + 28, 'Ready to grow? Let\'s talk.', 14, this.colors.white, true)
    this.text(60, ctaY + 10, 'Reply to this message or visit Warren.Guru / STU25.com to get started.', 10, this.colors.white)
    
    // Footer branding
    this.text(40, 50, 'Warren Guru Creative Management / STU25', 10, this.colors.midText, true)
    this.text(40, 36, 'This report was generated automatically using AI-powered analysis.', 8, this.colors.midText)
    this.rect(0, 0, this.pageWidth, 4, this.colors.accent)
    
    this.finalizePage(pagesObj, font1Obj, font2Obj, pageRefs)
    
    // ═══════════════════════════════════════════
    // PAGE 6 — BEFORE & AFTER SHOWCASE
    // ═══════════════════════════════════════════
    this.currentStream = ''
    
    // Navy background
    this.rect(0, 0, this.pageWidth, this.pageHeight, this.colors.navy)
    this.rect(0, this.pageHeight - 8, this.pageWidth, 8, this.colors.accent)
    
    // Header
    this.text(40, this.pageHeight - 50, 'WHAT THE FINISHED PRODUCT LOOKS LIKE', 16, this.colors.white, true)
    this.text(40, this.pageHeight - 70, 'Real results from real clients — here\'s what we deliver.', 10, this.colors.midText)
    
    // Divider
    this.line(40, this.pageHeight - 80, 555, this.pageHeight - 80, this.colors.accent, 2)
    
    y = this.pageHeight - 110
    
    // ── BEFORE column header ──
    const colW = 240
    const leftX = 40
    const rightX = 320
    
    // BEFORE label
    this.roundedRect(leftX, y, 80, 22, 6, this.colors.red)
    this.text(leftX + 14, y + 6, 'BEFORE', 10, this.colors.white, true)
    
    // AFTER label
    this.roundedRect(rightX, y, 70, 22, 6, this.colors.green)
    this.text(rightX + 14, y + 6, 'AFTER', 10, this.colors.white, true)
    
    y -= 30
    
    // ── Example 1: Warren Guru ──
    this.text(leftX, y, 'CASE STUDY: WARREN GURU', 11, this.colors.gold, true)
    y -= 18
    
    // Before card
    this.roundedRect(leftX, y - 130, colW, 130, 8, [0.1, 0.14, 0.22])
    this.text(leftX + 12, y - 16, 'Outdated single-page site', 10, this.colors.red, true)
    this.text(leftX + 12, y - 34, '- No clear call-to-action', 9, this.colors.midText)
    this.text(leftX + 12, y - 50, '- Generic template design', 9, this.colors.midText)
    this.text(leftX + 12, y - 66, '- No portfolio or social proof', 9, this.colors.midText)
    this.text(leftX + 12, y - 82, '- Poor mobile experience', 9, this.colors.midText)
    this.text(leftX + 12, y - 98, '- No booking system', 9, this.colors.midText)
    this.text(leftX + 12, y - 116, 'Score: 35/100', 10, this.colors.red, true)
    
    // After card
    this.roundedRect(rightX, y - 130, colW, 130, 8, [0.1, 0.14, 0.22])
    this.text(rightX + 12, y - 16, 'Modern branded experience', 10, this.colors.green, true)
    this.text(rightX + 12, y - 34, '+ Video-first landing page', 9, this.colors.midText)
    this.text(rightX + 12, y - 50, '+ Custom branding & animations', 9, this.colors.midText)
    this.text(rightX + 12, y - 66, '+ Full portfolio showcase', 9, this.colors.midText)
    this.text(rightX + 12, y - 82, '+ Mobile-optimized design', 9, this.colors.midText)
    this.text(rightX + 12, y - 98, '+ Integrated booking & CRM', 9, this.colors.midText)
    this.text(rightX + 12, y - 116, 'Score: 94/100', 10, this.colors.green, true)
    
    // Arrow between
    this.text(270, y - 65, '>>>', 18, this.colors.accent, true)
    
    y -= 165
    
    // ── Example 2: STU25 ──
    this.text(leftX, y, 'CASE STUDY: STU25 CREATIVE', 11, this.colors.gold, true)
    y -= 18
    
    // Before card
    this.roundedRect(leftX, y - 130, colW, 130, 8, [0.1, 0.14, 0.22])
    this.text(leftX + 12, y - 16, 'No web presence at all', 10, this.colors.red, true)
    this.text(leftX + 12, y - 34, '- Instagram-only business', 9, this.colors.midText)
    this.text(leftX + 12, y - 50, '- No website or landing page', 9, this.colors.midText)
    this.text(leftX + 12, y - 66, '- Inconsistent brand identity', 9, this.colors.midText)
    this.text(leftX + 12, y - 82, '- No automated workflows', 9, this.colors.midText)
    this.text(leftX + 12, y - 98, '- Manual client management', 9, this.colors.midText)
    this.text(leftX + 12, y - 116, 'Score: 20/100', 10, this.colors.red, true)
    
    // After card
    this.roundedRect(rightX, y - 130, colW, 130, 8, [0.1, 0.14, 0.22])
    this.text(rightX + 12, y - 16, 'Full digital ecosystem', 10, this.colors.green, true)
    this.text(rightX + 12, y - 34, '+ 3D interactive brand site', 9, this.colors.midText)
    this.text(rightX + 12, y - 50, '+ Client portal & uploads', 9, this.colors.midText)
    this.text(rightX + 12, y - 66, '+ Cohesive brand identity', 9, this.colors.midText)
    this.text(rightX + 12, y - 82, '+ Automated CRM & invoicing', 9, this.colors.midText)
    this.text(rightX + 12, y - 98, '+ Social media management', 9, this.colors.midText)
    this.text(rightX + 12, y - 116, 'Score: 97/100', 10, this.colors.green, true)
    
    // Arrow between
    this.text(270, y - 65, '>>>', 18, this.colors.accent, true)
    
    y -= 165
    
    // Bottom CTA
    this.roundedRect(40, y - 50, this.pageWidth - 80, 50, 8, this.colors.accent)
    this.text(60, y - 18, 'Your business could be the next success story.', 13, this.colors.white, true)
    this.text(60, y - 36, 'Warren.Guru / STU25.com  |  Let\'s build something incredible together.', 10, this.colors.white)
    
    // Footer
    this.text(40, 50, 'Warren Guru Creative Management / STU25', 8, this.colors.midText, true)
    this.rect(0, 0, this.pageWidth, 3, this.colors.accent)
    
    this.finalizePage(pagesObj, font1Obj, font2Obj, pageRefs)
    
    // ═══════════════════════════════════════════
    // PAGE 7 — SOURCES & EVIDENCE
    // ═══════════════════════════════════════════
    this.currentStream = ''
    
    this.rect(0, this.pageHeight - 50, this.pageWidth, 50, this.colors.navy)
    this.text(40, this.pageHeight - 35, 'SOURCES & EVIDENCE', 16, this.colors.white, true)
    
    y = this.pageHeight - 80
    
    this.text(40, y, 'Every finding in this report is backed by data we collected. Here is the proof:', 9, this.colors.midText)
    y -= 20
    
    // Data sources summary
    y = this.sectionHeader(y, 'Data Collected', '#')
    const sources: string[] = []
    if (websiteUrl && websiteUrl !== 'N/A') sources.push(`Website scraped: ${websiteUrl}`)
    if (igHandle) sources.push(`Instagram profile: @${igHandle}`)
    sources.push(`Report generated: ${new Date().toISOString().split('T')[0]}`)
    for (const s of sources) {
      this.text(55, y, s, 9, this.colors.darkText)
      y -= 14
    }
    
    y -= 10
    
    // Evidence items
    y = this.sectionHeader(y, 'Evidence for Each Finding', '>')
    
    const evidence = data.sources_evidence || []
    let evidencePageNum = 6
    
    for (let i = 0; i < evidence.length; i++) {
      const ev = evidence[i]
      if (!ev?.finding) continue
      
      // Check if we need a new page
      if (y < 120) {
        this.pageFooter(evidencePageNum)
        this.finalizePage(pagesObj, font1Obj, font2Obj, pageRefs)
        evidencePageNum++
        
        this.currentStream = ''
        this.rect(0, this.pageHeight - 50, this.pageWidth, 50, this.colors.navy)
        this.text(40, this.pageHeight - 35, 'SOURCES & EVIDENCE (CONTINUED)', 16, this.colors.white, true)
        y = this.pageHeight - 80
      }
      
      // Finding label
      const sourceLabel = (ev.data_source || 'unknown').toUpperCase().replace(/_/g, ' ')
      this.roundedRect(50, y - 2, sourceLabel.length * 5.5 + 16, 14, 4, this.colors.accent)
      this.text(58, y, sourceLabel, 7, this.colors.white, true)
      y -= 18
      
      // Finding text
      y = this.wordWrapText(55, y, `Finding: ${ev.finding}`, 9, this.colors.darkText, 78, true)
      
      // Evidence quote
      if (ev.exact_evidence) {
        const evidenceText = `"${ev.exact_evidence}"`
        this.roundedRect(50, y - 4, this.pageWidth - 100, 2, 1, this.colors.lightGray)
        y -= 4
        y = this.wordWrapText(60, y, evidenceText, 8, this.colors.midText, 75)
      }
      
      y -= 10
      this.line(50, y + 4, 545, y + 4, this.colors.lightGray, 0.5)
      y -= 6
    }
    
    if (evidence.length === 0) {
      this.text(55, y, 'No structured evidence was generated for this report.', 9, this.colors.midText)
      y -= 14
      this.text(55, y, 'The AI analysis is based on scraped website content and Instagram profile data.', 9, this.colors.midText)
    }
    
    this.pageFooter(evidencePageNum)
    this.finalizePage(pagesObj, font1Obj, font2Obj, pageRefs)

    // ═══════════════════════════════════════════
    // ASSEMBLE PDF
    // ═══════════════════════════════════════════
    
    const allObjects: { num: number; content: string; binaryData?: Uint8Array }[] = []
    
    // Catalog
    allObjects.push({ num: catalogObj, content: `${catalogObj} 0 obj\n<< /Type /Catalog /Pages ${pagesObj} 0 R >>\nendobj` })
    
    // Pages
    allObjects.push({ num: pagesObj, content: `${pagesObj} 0 obj\n<< /Type /Pages /Kids [${pageRefs.map(r => `${r} 0 R`).join(' ')}] /Count ${pageRefs.length} >>\nendobj` })
    
    // Fonts
    allObjects.push({ num: font1Obj, content: `${font1Obj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj` })
    allObjects.push({ num: font2Obj, content: `${font2Obj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj` })
    
    // Add image XObjects
    for (const [name, imgInfo] of this.imageObjects) {
      const imgBytes = (this as any)[`_imgBytes_${name}`] as Uint8Array
      if (imgBytes) {
        const filter = imgInfo.isJpeg ? '/DCTDecode' : '/FlateDecode'
        allObjects.push({
          num: imgInfo.objNum,
          content: `${imgInfo.objNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgInfo.width} /Height ${imgInfo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter} /Length ${imgBytes.length} >>\nstream\n`,
          binaryData: imgBytes,
        })
      }
    }
    
    // Add page objects (skip image XObjects — already added above)
    const imageObjNums = new Set([...this.imageObjects.values()].map(i => i.objNum))
    for (const obj of this.objects) {
      const numMatch = obj.match(/^(\d+) 0 obj/)
      if (numMatch) {
        const objNum = parseInt(numMatch[1])
        if (imageObjNums.has(objNum)) continue // skip duplicate image headers
        allObjects.push({ num: objNum, content: obj })
      }
    }
    
    // Sort by object number
    allObjects.sort((a, b) => a.num - b.num)
    
    // Build PDF as binary (to support image streams)
    const chunks: Uint8Array[] = []
    const encoder = new TextEncoder()
    const offsetMap = new Map<number, number>()
    let currentOffset = 0
    
    const headerBytes = encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
    chunks.push(headerBytes)
    currentOffset += headerBytes.length
    
    for (const obj of allObjects) {
      offsetMap.set(obj.num, currentOffset)
      const textPart = encoder.encode(obj.content)
      chunks.push(textPart)
      currentOffset += textPart.length
      
      if (obj.binaryData) {
        chunks.push(obj.binaryData)
        currentOffset += obj.binaryData.length
        const endStream = encoder.encode('\nendstream\nendobj\n')
        chunks.push(endStream)
        currentOffset += endStream.length
      } else {
        const newline = encoder.encode('\n')
        chunks.push(newline)
        currentOffset += newline.length
      }
    }
    
    const maxObjNum = allObjects[allObjects.length - 1]?.num || 0
    const xrefOffset = currentOffset
    
    let xref = 'xref\n'
    xref += `0 ${maxObjNum + 1}\n`
    xref += '0000000000 65535 f \n'
    for (let i = 1; i <= maxObjNum; i++) {
      const off = offsetMap.get(i)
      if (off !== undefined) {
        xref += `${String(off).padStart(10, '0')} 00000 n \n`
      } else {
        xref += '0000000000 00000 f \n'
      }
    }
    xref += 'trailer\n'
    xref += `<< /Size ${maxObjNum + 1} /Root ${catalogObj} 0 R >>\n`
    xref += 'startxref\n'
    xref += `${xrefOffset}\n`
    xref += '%%EOF'
    
    chunks.push(encoder.encode(xref))
    
    // Merge all chunks
    let totalLen = 0
    for (const c of chunks) totalLen += c.length
    const result = new Uint8Array(totalLen)
    let pos = 0
    for (const c of chunks) { result.set(c, pos); pos += c.length }
    
    return result
  }
  
  private finalizePage(pagesObj: number, font1Obj: number, font2Obj: number, pageRefs: number[]) {
    const streamBytes = new TextEncoder().encode(this.currentStream)
    const contentObj = this.allocObj()
    const pageObj = this.allocObj()
    
    // Build image XObject references for this page
    let imgResources = ''
    if (this.currentPageImageRefs.length > 0) {
      const imgEntries = this.currentPageImageRefs
        .map(name => {
          const img = this.imageObjects.get(name)
          return img ? `/Img_${name} ${img.objNum} 0 R` : ''
        })
        .filter(Boolean)
        .join(' ')
      imgResources = ` /XObject << ${imgEntries} >>`
    }
    
    this.objects.push(`${contentObj} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${this.currentStream}endstream\nendobj`)
    this.objects.push(`${pageObj} 0 obj\n<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] /Contents ${contentObj} 0 R /Resources << /Font << /F1 ${font1Obj} 0 R /F2 ${font2Obj} 0 R >>${imgResources} >> >>\nendobj`)
    
    pageRefs.push(pageObj)
    this.currentStream = ''
    this.currentPageImageRefs = []
  }
  
  private pageFooter(pageNum: number) {
    this.line(40, 65, 555, 65, this.colors.lightGray, 0.5)
    this.text(40, 50, 'Warren Guru Creative Management / STU25', 8, this.colors.midText, true)
    this.text(510, 50, `Page ${pageNum + 1}`, 8, this.colors.midText)
    this.rect(0, 0, this.pageWidth, 3, this.colors.accent)
  }
}

// ─── Main handler ───
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const body = await req.json()
    const { website_url, ig_handle, fb_url, customer_id, customer_name } = body

    if (!website_url && !ig_handle && !fb_url) {
      return new Response(JSON.stringify({ error: 'Provide at least a website_url, ig_handle, or fb_url' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Scrape in parallel
    const [websiteResult, igResult, fbResult] = await Promise.allSettled([
      website_url ? scrapeWebsite(website_url) : Promise.resolve(null),
      ig_handle ? scrapeInstagram(ig_handle) : Promise.resolve(null),
      fb_url ? scrapeFacebook(fb_url) : Promise.resolve(null),
    ])

    const websiteData = websiteResult.status === 'fulfilled' ? websiteResult.value : null
    const igData = igResult.status === 'fulfilled' ? igResult.value : null
    const fbData = fbResult.status === 'fulfilled' ? fbResult.value : null

    if (!websiteData && !igData && !fbData) {
      console.warn('[audit] All scrapes failed — generating CRM-only audit')
    }

    console.log('[audit] Scrape complete. Website:', !!websiteData, 'IG:', !!igData, 'FB:', !!fbData)

    // Generate structured AI analysis
    const analysis = await generateAnalysis(
      websiteData || { markdown: '', metadata: {}, links: [], branding: null },
      igData,
      fbData,
      website_url || 'N/A',
      ig_handle || null,
    )

    // Inject raw IG stats into analysis for PDF
    if (igData) {
      analysis._ig_followers = igData.followersCount?.toLocaleString() || '0'
      analysis._ig_posts = igData.postsCount?.toLocaleString() || '0'
      analysis._ig_engagement = igData.followersCount > 0 && igData.recentPosts?.length > 0
        ? ((igData.recentPosts.reduce((a: number, p: any) => a + p.likes + p.comments, 0) / igData.recentPosts.length / igData.followersCount) * 100).toFixed(2) + '%'
        : 'N/A'
    }

    // Inject raw FB stats into analysis for PDF
    if (fbData) {
      analysis._fb_pageName = fbData.pageName || ''
      analysis._fb_followers = (fbData.followers || 0).toLocaleString()
      analysis._fb_likes = (fbData.likes || 0).toLocaleString()
      analysis._fb_rating = fbData.rating ? `${fbData.rating}/5` : 'N/A'
      analysis._fb_reviews = (fbData.reviewCount || 0).toLocaleString()
      analysis._fb_url = fbData.pageUrl || fb_url || ''
    }

    console.log('[audit] AI analysis complete')

    // Fetch images for PDF embedding
    const builder = new PDFBuilder()
    
    // Website screenshot from Firecrawl
    const screenshotSource = websiteData?.screenshot
    // If main scrape didn't include a screenshot, try a dedicated screenshot-only scrape
    let screenshotToProcess = screenshotSource
    if (!screenshotToProcess && website_url) {
      try {
        console.log('[audit] No screenshot from main scrape, trying dedicated screenshot scrape...')
        const ssApiKey = Deno.env.get('FIRECRAWL_API_KEY')
        if (ssApiKey) {
          const ssRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${ssApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: website_url, formats: ['screenshot'], waitFor: 10000 }),
            signal: AbortSignal.timeout(30000),
          })
          if (ssRes.ok) {
            const ssData = await ssRes.json()
            screenshotToProcess = ssData.data?.screenshot || ssData.screenshot || null
            if (screenshotToProcess) console.log('[audit] Got screenshot from dedicated scrape')
          }
        }
      } catch (e) {
        console.error('[audit] Dedicated screenshot scrape failed:', e)
      }
    }

    if (screenshotToProcess) {
      try {
        console.log('[audit] Processing website screenshot...')
        let screenshotBytes: Uint8Array | null = null
        const ss = screenshotToProcess
        
        if (ss.startsWith('data:image/')) {
          const b64 = ss.split(',')[1]
          const raw = atob(b64)
          screenshotBytes = new Uint8Array(raw.length)
          for (let i = 0; i < raw.length; i++) screenshotBytes[i] = raw.charCodeAt(i)
        } else if (ss.startsWith('http')) {
          const imgRes = await fetch(ss, { signal: AbortSignal.timeout(15000) })
          if (imgRes.ok) screenshotBytes = new Uint8Array(await imgRes.arrayBuffer())
        }
        
        if (screenshotBytes && screenshotBytes.length > 0) {
          const isJpeg = screenshotBytes[0] === 0xFF && screenshotBytes[1] === 0xD8
          const isPng = screenshotBytes[0] === 0x89 && screenshotBytes[1] === 0x50
          if (isJpeg || isPng) {
            await builder.registerImage('website', screenshotBytes, 1280, 800)
            console.log(`[audit] Website screenshot registered (${isJpeg ? 'JPEG' : 'PNG'})`)
          } else {
            console.log('[audit] Website screenshot format not recognized, skipping')
          }
        }
      } catch (e) {
        console.error('[audit] Screenshot processing error:', e)
      }
    }
    
    // Instagram profile picture
    if (igData?.profilePicUrl) {
      try {
        console.log('[audit] Fetching IG profile pic...')
        const igPicRes = await fetch(igData.profilePicUrl)
        if (igPicRes.ok) {
          const igPicBytes = new Uint8Array(await igPicRes.arrayBuffer())
          const isJpeg = igPicBytes[0] === 0xFF && igPicBytes[1] === 0xD8
          const isPng = igPicBytes[0] === 0x89 && igPicBytes[1] === 0x50
          if (isJpeg || isPng) {
            await builder.registerImage('instagram', igPicBytes, 320, 320)
            console.log(`[audit] IG profile pic registered (${isJpeg ? 'JPEG' : 'PNG'})`)
          } else {
            console.log('[audit] IG profile pic format not recognized, skipping')
          }
        }
      } catch (e) {
        console.error('[audit] IG pic fetch error:', e)
      }
    }

    // Generate visual PDF
    const pdfBytes = builder.build(analysis, website_url || 'N/A', ig_handle || null, fb_url || null)

    // Upload PDF
    const fileName = `audit-${(ig_handle || website_url || 'report').replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.pdf`
    const { error: uploadErr } = await supabase.storage
      .from('content-uploads')
      .upload(`audits/${fileName}`, pdfBytes, { contentType: 'application/pdf' })

    if (uploadErr) console.error('[audit] Upload error:', uploadErr)

    const { data: publicUrl } = supabase.storage
      .from('content-uploads')
      .getPublicUrl(`audits/${fileName}`)

    // Build a readable text report from the structured data
    const reportText = [
      `# Digital Audit: ${analysis.business_name || 'Unknown'}`,
      `Overall Score: ${analysis.overall_score}/100`,
      '',
      '## Website', ...(analysis.website_good || []).map((g: string) => `+ ${g}`), ...(analysis.website_bad || []).map((b: string) => `- ${b}`),
      '',
      '## Social', ...(analysis.social_good || []).map((g: string) => `+ ${g}`), ...(analysis.social_bad || []).map((b: string) => `- ${b}`),
      '',
      '## Quick Wins', ...(analysis.quick_wins || []).map((q: string, i: number) => `${i + 1}. ${q}`),
    ].join('\n')

    // Store as content asset (category: 'other' so it shows in Content library)
    await supabase.from('content_assets').insert({
      title: `Audit: ${customer_name || ig_handle || website_url || 'Unknown'}`,
      type: 'document',
      status: 'published',
      url: publicUrl?.publicUrl || '',
      source: 'audit-report',
      category: 'other',
      customer_id: customer_id || null,
      body: reportText.slice(0, 5000),
      tags: ['audit', website_url || '', ig_handle || ''].filter(Boolean),
    })

    // Mark the customer as analyzed if customer_id provided
    if (customer_id) {
      const { data: cust } = await supabase.from('customers').select('meta').eq('id', customer_id).single()
      const existingMeta = (cust?.meta && typeof cust.meta === 'object') ? cust.meta : {}
      await supabase.from('customers').update({
        meta: { ...existingMeta, analyzed: true, audit_pdf_url: publicUrl?.publicUrl || '', audit_date: new Date().toISOString() },
      }).eq('id', customer_id)
    }

    return new Response(JSON.stringify({
      success: true,
      report_text: reportText,
      pdf_url: publicUrl?.publicUrl || '',
      website_scraped: !!websiteData,
      ig_scraped: !!igData,
      fb_scraped: !!fbData,
      scores: {
        overall: analysis.overall_score,
        website: analysis.website_score,
        social: analysis.social_score,
        seo: analysis.seo_score,
        branding: analysis.branding_score,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[audit-report] error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Audit failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
