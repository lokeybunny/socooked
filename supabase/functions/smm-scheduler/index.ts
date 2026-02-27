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

  // Telegram
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/telegram-notify`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        record: {
          id: crypto.randomUUID(),
          entity_type: 'smm',
          entity_id: null,
          action: 'failed',
          actor_id: null,
          meta: { name: `🚨 SMM FAILURE: ${problem}`, detail, profile: profile || 'unknown', timestamp: pstTime },
          created_at: new Date().toISOString(),
        },
      }),
    });
  } catch (e) { console.error('[smm-scheduler] telegram failure notify error:', e); }

  // Email via gmail-api
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/gmail-api`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'send',
        to: 'warren@stu25.com',
        subject: `STU25DEBUG: ${problem}`,
        body: `SMM Scheduler Failure Alert\n\nAction: ${action}\nProfile: ${profile || 'unknown'}\nTime (PST): ${pstTime}\n\nError:\n${detail}`,
      }),
    });
  } catch (e) { console.error('[smm-scheduler] email failure notify error:', e); }
}

// All available smm-api actions with descriptions for the AI
const ACTIONS_MANIFEST = `
You are an SMM Scheduler AI. You translate natural language into Upload-Post API calls OR content schedule plans.
Current UTC time: {{NOW}}

CONTENT SCHEDULE MODE:
If the user asks to "create a schedule", "plan content", "generate a content plan", or similar — return a JSON object with type "content_plan":
{
  "type": "content_plan",
  "platform": "instagram|facebook|tiktok|x",
  "plan_name": "Week of [date]",
  "brand_context": {
    "niche": "detected niche of the brand",
    "voice": "brand voice description",
    "audience": "target audience",
    "keywords": ["keyword1", "keyword2"],
    "hashtag_sets": { "primary": ["tag1","tag2"], "trending": ["tag3"] }
  },
  "schedule_items": [
    {
      "id": "unique-id",
      "date": "YYYY-MM-DD",
      "time": "HH:mm",
      "type": "image|video|text|carousel",
      "caption": "Full caption text",
      "hashtags": ["tag1", "tag2"],
      "media_prompt": "Detailed visual description for AI image/video generation",
      "status": "planned"
    }
  ]
}

BRAND STRATEGY RULES:
- Think like an expert social media manager for the brand's niche
- Mix content types: educational, entertaining, promotional, behind-the-scenes
- Use platform-specific best practices (Reels for IG, short-form for TikTok, threads for X)
- Include optimal posting times for the platform
- Generate 7-14 posts per week minimum
- Write media_prompt as detailed visual descriptions for AI image generation (describe scene, lighting, mood, composition)
- Vary hashtag sets between posts, mix popular + niche tags
- Instagram/TikTok content should be visually focused
- X content can be text-heavy with occasional images
- Facebook can mix formats

AVAILABLE ACTIONS (call via smm-api edge function):
1. upload-video — Post a video. Body: { user, title, description?, video (url), "platform[]": ["facebook","instagram",...], scheduled_date? (ISO 8601 UTC), add_to_queue? (bool), first_comment?, timezone? }
2. upload-photos — Post photos. Body: { user, title, description?, "platform[]": [...], scheduled_date?, add_to_queue?, first_comment? }
3. upload-text — Post text only. ONLY supports: facebook, x, linkedin. Instagram/tiktok/youtube/pinterest do NOT support text-only posts. Body: { user, title, description?, "platform[]": [...], scheduled_date?, add_to_queue?, first_comment? }
4. upload-document — Post a document. Body: { user, title, description?, document (url), "platform[]": [...], scheduled_date? }
5. list-scheduled — List all scheduled posts. No body needed.
6. cancel-scheduled — Cancel a scheduled post. Params: job_id
7. edit-scheduled — Edit a scheduled post. Params: job_id. Body: { scheduled_date?, title?, caption? }
8. upload-status — Check upload status. Params: request_id? or job_id?
9. upload-history — View post history. Params: user?, page?, limit?
10. queue-settings — Get queue settings. Params: profile (username)
11. update-queue-settings — Update queue settings. Body: { profile, timezone, slots: [{day:0-6, time:"HH:mm"}] }
12. queue-preview — Preview upcoming queue slots. Params: profile
13. queue-next-slot — Get next available queue slot. Params: profile
14. analytics — Get analytics. Params: profile_username, platforms? (comma-separated)
15. ig-conversations — List IG DM conversations. Params: user
16. ig-dm-send — Send IG DM. Body: { platform:"instagram", user, recipient_id, message }
17. ig-comments — Get comments on IG post. Params: user, post_id
18. ig-comment-reply — Reply to IG comment. Body: { platform:"instagram", user, comment_id, message }
19. ig-media — List IG media. Params: user

RULES:
- The "user" field is the profile username (e.g. "STU25").
- Platform names for API: facebook, instagram, x, linkedin, tiktok, youtube, pinterest (NOT "twitter" — use "x")
- IMPORTANT: The body key for platforms MUST be "platform[]" (with brackets), e.g. { "platform[]": ["instagram", "x"] }
- Instagram, TikTok, YouTube, and Pinterest require media (video or photos) — they do NOT support text-only posts.
- For scheduling, convert any relative times to ISO 8601 UTC. User is in PST (UTC-8).
- Return a JSON array of steps. Each step: { "action": "...", "params": {...}, "body": {...}, "description": "human-readable" }
- If the request is unclear, return: { "clarify": "question to ask" }
- Never fabricate data. If you need info (like a job_id), say so.
- For multi-platform posts, use a single call with platform[] array.
- If user tries to post text to Instagram, tell them Instagram requires an image or video.
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
      temperature: 0.1,
      max_tokens: 8000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI error: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function executeSMMAction(action: string, params?: Record<string, string>, body?: any): Promise<any> {
  const searchParams = new URLSearchParams({ action });
  if (params) Object.entries(params).forEach(([k, v]) => { if (v) searchParams.set(k, v); });

  const url = `${SMM_API_URL}?${searchParams}`;

  // Normalize body: ensure "platform" arrays become "platform[]"
  if (body && typeof body === 'object') {
    if (body.platform && !body['platform[]']) {
      body['platform[]'] = Array.isArray(body.platform) ? body.platform : [body.platform];
      delete body.platform;
    }
    // Also add title from description if missing (text posts need it)
    if (!body.title && body.description) {
      body.title = body.description;
    }
  }

  const fetchOpts: RequestInit = {
    method: body ? 'POST' : 'GET',
    headers: {
      'Authorization': `Bearer ${ANON_KEY}`,
      'apikey': ANON_KEY,
      'Content-Type': 'application/json',
    },
  };
  if (body) fetchOpts.body = JSON.stringify(body);

  const res = await fetch(url, fetchOpts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, profile, history } = await req.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date().toISOString();
    const systemPrompt = ACTIONS_MANIFEST.replace('{{NOW}}', now);

    // Build context with history
    const contextParts = [];
    if (profile) contextParts.push(`Active profile: ${profile}`);
    if (history?.length) {
      contextParts.push('Recent conversation:\n' + history.map((h: any) => `${h.role}: ${h.text}`).join('\n'));
    }
    const fullPrompt = contextParts.length
      ? `${prompt}\n\nContext:\n${contextParts.join('\n')}`
      : prompt;

    // Step 1: AI parses the intent
    const aiResponse = await callAI(systemPrompt, fullPrompt);
    console.log('[smm-scheduler] AI response:', aiResponse);

    // Extract JSON from the response
    const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/) || aiResponse.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({
        type: 'message',
        message: aiResponse,
        actions: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let cleanedJson = jsonMatch[1].trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleanedJson);
    } catch (_e) {
      console.warn('[smm-scheduler] Initial JSON parse failed, attempting repair…');
      // Strip control characters
      cleanedJson = cleanedJson.replace(/[\x00-\x1F\x7F]/g, '');
      // Fix trailing commas
      cleanedJson = cleanedJson.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

      // Try to close truncated JSON — find outermost bracket type
      const firstChar = cleanedJson.trim()[0];
      if (firstChar === '{' || firstChar === '[') {
        const openBracket = firstChar;
        const closeBracket = openBracket === '{' ? '}' : ']';
        let depth = 0;
        let lastValidPos = -1;
        let inString = false;
        let escaped = false;
        for (let i = 0; i < cleanedJson.length; i++) {
          const c = cleanedJson[i];
          if (escaped) { escaped = false; continue; }
          if (c === '\\') { escaped = true; continue; }
          if (c === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (c === '{' || c === '[') depth++;
          if (c === '}' || c === ']') { depth--; if (depth === 0) { lastValidPos = i; break; } }
        }

        if (lastValidPos > 0) {
          cleanedJson = cleanedJson.substring(0, lastValidPos + 1);
        } else {
          // Truncated — try to close it by removing trailing incomplete element
          // Remove last incomplete array element or object property
          cleanedJson = cleanedJson.replace(/,\s*\{[^}]*$/s, '');
          cleanedJson = cleanedJson.replace(/,\s*"[^"]*$/s, '');
          // Close all remaining open brackets
          let opens = 0; let closes = 0;
          for (const c of cleanedJson) {
            if (!inString) {
              if (c === '{' || c === '[') opens++;
              if (c === '}' || c === ']') closes++;
            }
          }
          for (let i = 0; i < opens - closes; i++) {
            // Try to guess bracket type from context
            cleanedJson += (cleanedJson.lastIndexOf('[') > cleanedJson.lastIndexOf('{') ? ']' : '}');
          }
          // Fix trailing commas again after surgery
          cleanedJson = cleanedJson.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        }
      }

      try {
        parsed = JSON.parse(cleanedJson);
      } catch (repairError: any) {
        console.error('[smm-scheduler] JSON repair failed:', repairError.message);
        return new Response(JSON.stringify({
          type: 'message',
          message: 'The AI generated a response that was too long and got truncated. Please try a simpler request (e.g. fewer days or a single platform).',
          actions: [],
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // If AI needs clarification
    if (parsed.clarify) {
      return new Response(JSON.stringify({
        type: 'clarify',
        message: parsed.clarify,
        actions: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── Content Plan Mode ───
    if (parsed.type === 'content_plan') {
      // Save plan to smm_content_plans table
      const planPayload = {
        profile_username: profile || 'STU25',
        platform: parsed.platform || 'instagram',
        plan_name: parsed.plan_name || `Content Plan ${new Date().toLocaleDateString()}`,
        status: 'active',
        brand_context: parsed.brand_context || {},
        schedule_items: (parsed.schedule_items || []).map((item: any, idx: number) => ({
          ...item,
          id: item.id || crypto.randomUUID(),
          status: item.status || 'planned',
        })),
      };

      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/smm_content_plans`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(planPayload),
      });
      const insertData = await insertRes.json();

      // Also save brand prompts from the media_prompt fields
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
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(brandPrompts),
        });
      }

      await logActivity('smm', 'content_plan_created', {
        name: `📅 Content plan: ${planPayload.plan_name}`,
        profile: planPayload.profile_username,
        platform: planPayload.platform,
        items_count: planPayload.schedule_items.length,
      });

      return new Response(JSON.stringify({
        type: 'content_plan',
        message: `Created content plan "${planPayload.plan_name}" with ${planPayload.schedule_items.length} posts`,
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
        results.push({
          action: step.action,
          description: step.description || step.action,
          success: true,
          data: result,
        });
        await logActivity('smm', step.action, {
          name: `SMM: ${step.description || step.action}`,
          profile: profile || step.body?.user || 'unknown',
          platforms: step.body?.['platform[]'] || step.body?.platform || [],
        });
      } catch (e: any) {
        results.push({
          action: step.action,
          description: step.description || step.action,
          success: false,
          error: e.message,
        });
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
