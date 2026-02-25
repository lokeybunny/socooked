import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SMM_API_URL = Deno.env.get('SUPABASE_URL')! + '/functions/v1/smm-api';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// All available smm-api actions with descriptions for the AI
const ACTIONS_MANIFEST = `
You are an SMM Scheduler AI. You translate natural language into Upload-Post API calls.
Current UTC time: {{NOW}}

AVAILABLE ACTIONS (call via smm-api edge function):
1. upload-video — Post a video. Body: { user, title, description?, video (url), platform[] (facebook|instagram|x|linkedin|tiktok|youtube|pinterest), scheduled_date? (ISO 8601 UTC), add_to_queue? (bool), first_comment?, timezone? }
2. upload-photos — Post photos. Body: { user, title, description?, platform[], scheduled_date?, add_to_queue?, first_comment? }
3. upload-text — Post text only. Body: { user, title, description?, platform[], scheduled_date?, add_to_queue?, first_comment? }
4. upload-document — Post a document. Body: { user, title, description?, document (url), platform[], scheduled_date? }
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
- For scheduling, convert any relative times to ISO 8601 UTC. User is in PST (UTC-8).
- Return a JSON array of steps. Each step: { "action": "...", "params": {...}, "body": {...}, "description": "human-readable" }
- If the request is unclear, return: { "clarify": "question to ask" }
- Never fabricate data. If you need info (like a job_id), say so.
- For multi-platform posts, use a single call with platform[] array.
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
      max_tokens: 2000,
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

    const parsed = JSON.parse(jsonMatch[1]);

    // If AI needs clarification
    if (parsed.clarify) {
      return new Response(JSON.stringify({
        type: 'clarify',
        message: parsed.clarify,
        actions: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Step 2: Execute each action
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
      } catch (e: any) {
        results.push({
          action: step.action,
          description: step.description || step.action,
          success: false,
          error: e.message,
        });
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
