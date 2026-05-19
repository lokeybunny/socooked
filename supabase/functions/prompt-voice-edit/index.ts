import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const elKey = Deno.env.get('ELEVENLABS_API_KEY');
    const loKey = Deno.env.get('LOVABLE_API_KEY');
    if (!elKey) throw new Error('ELEVENLABS_API_KEY not configured');
    if (!loKey) throw new Error('LOVABLE_API_KEY not configured');

    const form = await req.formData();
    const audio = form.get('audio');
    const currentPrompt = String(form.get('currentPrompt') ?? '').trim();
    if (!(audio instanceof File) && !(audio instanceof Blob)) {
      return new Response(JSON.stringify({ error: 'audio file is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1) Transcribe via ElevenLabs scribe_v2
    const elForm = new FormData();
    elForm.append('file', audio, 'edit.webm');
    elForm.append('model_id', 'scribe_v2');
    elForm.append('language_code', 'eng');

    const sttResp = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': elKey },
      body: elForm,
    });
    if (!sttResp.ok) {
      const t = await sttResp.text();
      console.error('STT error', sttResp.status, t);
      return new Response(JSON.stringify({ error: 'Transcription failed', detail: t }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const sttJson = await sttResp.json();
    const transcript: string = (sttJson?.text ?? '').trim();
    if (!transcript) {
      return new Response(JSON.stringify({ error: 'Empty transcript — try speaking longer or louder.' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Merge transcript into prompt via Lovable AI
    const system = `You are a cinematic video prompt editor. The user has an existing video generation PROMPT and just spoke instructions to refine, extend, or modify it.

Rules:
- Preserve the existing prompt's intent, subjects, locations, and any explicit notes/constraints unless the user clearly overrides them.
- Apply the spoken edits: add detail, change camera/lighting/mood, add or remove elements, etc.
- Output ONLY the new prompt text — no preface, no quotes, no markdown, no commentary.
- Keep it concise but cinematic. One paragraph unless multiple shots are described.
- Never invent unrelated content. If the transcript is ambiguous, prefer minimal changes.`;

    const user = `EXISTING PROMPT:\n${currentPrompt || '(empty)'}\n\nSPOKEN EDIT INSTRUCTIONS:\n${transcript}\n\nReturn the updated prompt only.`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${loKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error('AI error', aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please retry shortly.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Add funds to your Lovable workspace.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'AI gateway error', detail: t }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const aiJson = await aiResp.json();
    const newPrompt: string = (aiJson?.choices?.[0]?.message?.content ?? '').trim();
    if (!newPrompt) {
      return new Response(JSON.stringify({ error: 'AI returned empty prompt', transcript }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ transcript, newPrompt }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('prompt-voice-edit error', e);
    return new Response(JSON.stringify({ error: (e as Error).message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
