import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SMM_API_URL = SUPABASE_URL + '/functions/v1/smm-api';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function logActivity(entityType: string, action: string, meta: Record<string, any>) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ entity_type: entityType, action, meta }),
    });
  } catch (e) { console.error('[smm-scheduler] activity log error:', e); }
}

async function notifySchedulerFailure(action: string, error: string, profile?: string) {
  const pstTime = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const problem = `Scheduler action "${action}" failed`;
  const detail = error.substring(0, 500);

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/telegram-notify`, {
      method: 'POST',
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        record: {
          id: crypto.randomUUID(), entity_type: 'smm', entity_id: null, action: 'failed', actor_id: null,
          meta: { name: `🚨 SMM FAILURE: ${problem}`, detail, profile: profile || 'unknown', timestamp: pstTime },
          created_at: new Date().toISOString(),
        },
      }),
    });
  } catch (e) { console.error('[smm-scheduler] telegram failure notify error:', e); }

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/gmail-api`, {
      method: 'POST',
      headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send', to: 'warren@stu25.com', subject: `STU25DEBUG: ${problem}`,
        body: `SMM Scheduler Failure Alert\n\nAction: ${action}\nProfile: ${profile || 'unknown'}\nTime (PST): ${pstTime}\n\nError:\n${detail}`,
      }),
    });
  } catch (e) { console.error('[smm-scheduler] email failure notify error:', e); }
}

// ─── MASSIVE SMM EXPERT PROMPT ───
const ACTIONS_MANIFEST = `
You are Cortex — an elite Social Media Manager AI with deep expertise in content strategy, platform algorithms, audience growth, and brand storytelling.
Current UTC time: {{NOW}}
User timezone: PST (UTC-8)

═══════════════════════════════════════════
PHASE 1: DISCOVERY & QUALIFICATION
═══════════════════════════════════════════

BEFORE creating ANY content plan, you MUST ask the user clarifying questions using the "clarify" response type.
Act as a professional social media strategist conducting a brand intake.

MANDATORY QUESTIONS TO ASK (return as clarify):
If the user hasn't provided this information, you MUST ask before proceeding:

1. BRAND IDENTITY:
   - "What is your brand/business name and what do you do? (e.g., 'STU25 — creative agency specializing in web design & branding')"
   - "What industry/niche are you in?"

2. TARGET AUDIENCE:
   - "Who is your ideal customer? (age range, interests, pain points)"
   - "What action do you want followers to take? (visit website, DM, buy product, book call)"

3. CONTENT PREFERENCES:
   - "What content style resonates with your brand? (educational, entertaining, behind-the-scenes, luxury/aspirational, raw/authentic, corporate/professional)"
   - "Do you have any brand colors, fonts, or visual guidelines I should follow?"
   - "Any competitors or accounts whose style you admire?"

4. GOALS & KPIs:
   - "What's your primary goal? (grow followers, drive sales, build authority, increase engagement, generate leads)"
   - "How many posts per week do you want? (I recommend 7-14 for aggressive growth)"

5. EXISTING ASSETS:
   - "Do you have any existing photos, videos, or brand assets I should work with?"
   - "Any upcoming events, launches, or promotions to include?"

FORMAT for asking questions:
{ "clarify": "Your professional question here. Be conversational but strategic." }

You may ask multiple rounds of questions. Once you have enough context, proceed to content planning.

If the user says "just do it" or provides enough context upfront, skip to planning but use smart defaults.

═══════════════════════════════════════════
PHASE 2: CONTENT PLAN GENERATION
═══════════════════════════════════════════

Once you have enough brand context, return a content plan JSON. CRITICAL: Keep responses compact — maximum 7 schedule items per response to avoid truncation. If the user wants more, they can ask for "week 2" etc.

RESPONSE FORMAT:
{
  "type": "content_plan",
  "platform": "instagram|facebook|tiktok|x",
  "plan_name": "Short plan name",
  "brand_context": {
    "niche": "detected niche",
    "voice": "brand voice (max 20 words)",
    "audience": "target audience (max 20 words)",
    "keywords": ["kw1", "kw2", "kw3"],
    "hashtag_sets": { "primary": ["tag1","tag2"], "trending": ["tag3"] }
  },
  "schedule_items": [
    {
      "id": "unique-short-id",
      "date": "YYYY-MM-DD",
      "time": "HH:mm",
      "type": "image|video|text|carousel",
      "caption": "Caption text (keep under 200 chars)",
      "hashtags": ["tag1", "tag2"],
      "media_prompt": "Visual description for AI generation (scene, lighting, mood, composition — max 100 words)",
      "status": "draft"
    }
  ]
}

CRITICAL RULES:
- Maximum 7 items per schedule_items array (prevents JSON truncation)
- Keep captions concise — under 200 characters
- Keep media_prompt under 100 words — be specific but brief
- Keep hashtags to 5-7 per post max
- All items start with status "draft" — user must approve before going live
- Use design-intent language for media_prompt (describe the scene, NOT "generate an image of…")

MEDIA GENERATION STRATEGY:
- Items with type "image" → will be generated by Nano Banana (Google Gemini image model)
- Items with type "video" → will be generated by Higgsfield AI (video generation)
- Items with type "text" → no media needed (X/Facebook only)
- Items with type "carousel" → multiple images generated by Nano Banana
- Media is NOT generated immediately — it's queued for generation 48 hours before the scheduled date to save on API credits
- Until generated, items show as "template" placeholders in the preview

CONTENT MIX (per 7 posts):
- 2 educational/value posts (tips, how-to, stats)
- 2 engagement posts (questions, polls, hot takes)
- 1 promotional post (product/service showcase)
- 1 behind-the-scenes/personal post
- 1 trending/timely post (current events, memes, trends)

PLATFORM-SPECIFIC RULES:
- Instagram: Reels > static posts. Carousel for education. Stories for engagement. No text-only.
- TikTok: All content should be video. Trending sounds. Hook in first 3 seconds.
- X: Text-heavy OK. Threads for long-form. Images optional. Hot takes perform well.
- Facebook: Mix of formats. Longer captions OK. Groups/community focus.

POSTING TIMES (PST, convert to UTC for dates):
- Instagram: 10am, 2pm, 6pm PST
- TikTok: 9am, 12pm, 7pm PST
- X: 8am, 12pm, 5pm PST
- Facebook: 9am, 1pm, 4pm PST

═══════════════════════════════════════════
PHASE 3: DIRECT API ACTIONS
═══════════════════════════════════════════

For direct posting/scheduling actions (not content planning), return an array of steps:

AVAILABLE ACTIONS:
1. upload-video — Body: { user, title, video (url), "platform[]": [...], scheduled_date? (ISO UTC), first_comment? }
2. upload-photos — Body: { user, title, "platform[]": [...], scheduled_date?, first_comment? }
3. upload-text — ONLY: facebook, x, linkedin. Body: { user, title, "platform[]": [...], scheduled_date? }
4. list-scheduled — No body needed.
5. cancel-scheduled — Params: job_id
6. edit-scheduled — Params: job_id. Body: { scheduled_date?, title?, caption? }
7. upload-status — Params: request_id? or job_id?
8. upload-history — Params: user?, page?, limit?
9. analytics — Params: profile_username, platforms?

FORMAT: [{ "action": "...", "params": {...}, "body": {...}, "description": "human-readable" }]

RULES:
- "user" = profile username (e.g. "STU25")
- Platform key MUST be "platform[]" (with brackets)
- Instagram/TikTok/YouTube/Pinterest require media — no text-only
- Convert times to ISO 8601 UTC. User is PST (UTC-8)
- If unclear: { "clarify": "question" }
`;

async function callAI(prompt: string, userMessage: string): Promise<string> {
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI error: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function repairJson(raw: string): any {
  // Strip markdown fences
  let cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();

  // Find JSON boundaries
  const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!jsonMatch) throw new Error('No JSON found in response');
  cleaned = jsonMatch[1];

  // First attempt
  try { return JSON.parse(cleaned); } catch (_e) { /* continue */ }

  // Strip control chars, fix trailing commas
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

  // Try again
  try { return JSON.parse(cleaned); } catch (_e) { /* continue */ }

  // Truncation repair — remove last incomplete item, close brackets
  cleaned = cleaned.replace(/,\s*\{[^}]*$/s, '');
  cleaned = cleaned.replace(/,\s*"[^"]*$/s, '');
  cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

  // Count and close open brackets
  let opens = 0, closes = 0;
  let inStr = false, esc = false;
  for (const c of cleaned) {
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{' || c === '[') opens++;
    if (c === '}' || c === ']') closes++;
  }
  // Build closing sequence based on order of opens
  const openStack: string[] = [];
  inStr = false; esc = false;
  for (const c of cleaned) {
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') openStack.push('}');
    if (c === '[') openStack.push(']');
    if (c === '}' || c === ']') openStack.pop();
  }
  cleaned += openStack.reverse().join('');
  cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

  return JSON.parse(cleaned);
}

async function executeSMMAction(action: string, params?: Record<string, string>, body?: any): Promise<any> {
  const searchParams = new URLSearchParams({ action });
  if (params) Object.entries(params).forEach(([k, v]) => { if (v) searchParams.set(k, v); });
  const url = `${SMM_API_URL}?${searchParams}`;

  if (body && typeof body === 'object') {
    if (body.platform && !body['platform[]']) {
      body['platform[]'] = Array.isArray(body.platform) ? body.platform : [body.platform];
      delete body.platform;
    }
    if (!body.title && body.description) body.title = body.description;
  }

  const fetchOpts: RequestInit = {
    method: body ? 'POST' : 'GET',
    headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
  };
  if (body) fetchOpts.body = JSON.stringify(body);

  const res = await fetch(url, fetchOpts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, profile, history, action: directAction } = await req.json();

    // ─── Direct action: push-live ───
    if (directAction === 'push-live') {
      const { plan_id } = await req.json().catch(() => ({}));
      // Handled by the client — just update status
      if (plan_id) {
        await fetch(`${SUPABASE_URL}/rest/v1/smm_content_plans?id=eq.${plan_id}`, {
          method: 'PATCH',
          headers: {
            'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ status: 'live' }),
        });
        await logActivity('smm', 'schedule_pushed_live', { name: '🔴 Schedule pushed to LIVE', plan_id, profile });
      }
      return new Response(JSON.stringify({ type: 'success', message: 'Schedule pushed to LIVE' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date().toISOString();
    const systemPrompt = ACTIONS_MANIFEST.replace('{{NOW}}', now);

    // Build context with conversation history
    const contextParts: string[] = [];
    if (profile) contextParts.push(`Active profile: ${profile}`);
    if (history?.length) {
      contextParts.push('Conversation so far:\n' + history.map((h: any) => `${h.role}: ${h.text}`).join('\n'));
    }
    const fullPrompt = contextParts.length ? `${prompt}\n\nContext:\n${contextParts.join('\n')}` : prompt;

    // Call AI
    const aiResponse = await callAI(systemPrompt, fullPrompt);
    console.log('[smm-scheduler] AI response length:', aiResponse.length);

    // Try to extract JSON
    let parsed: any;
    try {
      parsed = repairJson(aiResponse);
    } catch (_e) {
      // No JSON found — treat as plain text message or clarification
      return new Response(JSON.stringify({
        type: 'message',
        message: aiResponse,
        actions: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Clarification
    if (parsed.clarify) {
      return new Response(JSON.stringify({
        type: 'clarify',
        message: parsed.clarify,
        actions: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── Content Plan Mode ───
    if (parsed.type === 'content_plan') {
      const planPayload = {
        profile_username: profile || 'STU25',
        platform: parsed.platform || 'instagram',
        plan_name: parsed.plan_name || `Content Plan ${new Date().toLocaleDateString()}`,
        status: 'draft', // Always starts as draft — user must push to live
        brand_context: parsed.brand_context || {},
        schedule_items: (parsed.schedule_items || []).map((item: any) => ({
          ...item,
          id: item.id || crypto.randomUUID(),
          status: 'draft', // All items start as draft
          media_url: null, // No media generated yet — will be generated 48hrs before
        })),
      };

      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/smm_content_plans`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json', 'Prefer': 'return=representation',
        },
        body: JSON.stringify(planPayload),
      });
      const insertData = await insertRes.json();

      // Save brand prompts
      const brandPrompts = (parsed.schedule_items || [])
        .filter((item: any) => item.media_prompt)
        .map((item: any) => ({
          profile_username: profile || 'STU25',
          category: item.type === 'video' ? 'video_concept' : 'visual',
          niche: parsed.brand_context?.niche || null,
          prompt_text: item.media_prompt,
          example_output: item.caption,
        }));

      if (brandPrompts.length) {
        await fetch(`${SUPABASE_URL}/rest/v1/smm_brand_prompts`, {
          method: 'POST',
          headers: {
            'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal',
          },
          body: JSON.stringify(brandPrompts),
        });
      }

      await logActivity('smm', 'content_plan_created', {
        name: `📅 Content plan: ${planPayload.plan_name}`,
        profile: planPayload.profile_username,
        platform: planPayload.platform,
        items_count: planPayload.schedule_items.length,
        status: 'draft',
      });

      return new Response(JSON.stringify({
        type: 'content_plan',
        message: `Created draft plan "${planPayload.plan_name}" with ${planPayload.schedule_items.length} posts. Review the schedule and hit "Schedule to LIVE" when ready. Media will be generated 48 hours before each post date.`,
        plan: insertData,
        actions: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── Standard Action Mode ───
    const steps = Array.isArray(parsed) ? parsed : [parsed];
    const results: any[] = [];

    for (const step of steps) {
      try {
        const result = await executeSMMAction(step.action, step.params, step.body);
        results.push({ action: step.action, description: step.description || step.action, success: true, data: result });
        await logActivity('smm', step.action, {
          name: `SMM: ${step.description || step.action}`,
          profile: profile || step.body?.user || 'unknown',
          platforms: step.body?.['platform[]'] || step.body?.platform || [],
        });
      } catch (e: any) {
        results.push({ action: step.action, description: step.description || step.action, success: false, error: e.message });
        await notifySchedulerFailure(step.action, e.message, profile || step.body?.user);
      }
    }

    return new Response(JSON.stringify({
      type: 'executed',
      message: `Executed ${results.length} action(s)`,
      actions: results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[smm-scheduler] error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
