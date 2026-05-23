// Story Prompt Composer — cinematic AI prompt + image + storyboard + voice engine.
// Actions (POST JSON or multipart):
//  - enhance:    { prompt, director?, style?, settings? } -> { structured, master }
//  - transcribe: multipart audio + current/director -> { transcript, master, structured }
//  - image:      { prompt, provider: 'lovable'|'atlascloud', size?, quality? } -> { imageUrl }
//  - storyboard: { prompt, shots?, director? } -> { shots: [...] }
//  - seedance:   { prompt, model: 'seedance-2'|'seedance-2-fast', aspect?, image_url? } -> { job } (proxied to studio-orchestrator)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const LO = () => Deno.env.get('LOVABLE_API_KEY') || '';
const EL = () => Deno.env.get('ELEVENLABS_API_KEY') || '';
const ATLAS = () => Deno.env.get('ATLASCLOUD_API_KEY') || '';
const SB_URL = () => Deno.env.get('SUPABASE_URL') || '';
const SB_SR = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Atlas serves images with Content-Disposition: attachment + x-oss-force-download,
// which makes <img> tags fail to render. Re-host to our public bucket and return that URL.
async function rehostImage(srcUrl: string): Promise<string> {
  try {
    if (!srcUrl || srcUrl.startsWith('data:')) return srcUrl;
    const sbUrl = SB_URL();
    const sr = SB_SR();
    if (!sbUrl || !sr) return srcUrl;
    const r = await fetch(srcUrl);
    if (!r.ok) return srcUrl;
    const ct = r.headers.get('content-type') || 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const bytes = new Uint8Array(await r.arrayBuffer());
    const path = `composer/${crypto.randomUUID()}.${ext}`;
    const up = await fetch(`${sbUrl}/storage/v1/object/studio-outputs/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sr}`,
        apikey: sr,
        'Content-Type': ct,
        'x-upsert': 'true',
        'cache-control': 'public, max-age=31536000, immutable',
      },
      body: bytes,
    });
    if (!up.ok) {
      console.error('rehostImage upload failed', up.status, await up.text().catch(() => ''));
      return srcUrl;
    }
    return `${sbUrl}/storage/v1/object/public/studio-outputs/${path}`;
  } catch (e) {
    console.error('rehostImage error', (e as Error).message);
    return srcUrl;
  }
}

const DIRECTORS: Record<string, string> = {
  'Cloverfield': 'handheld POV chaos, jittery realism, shaky cam, found-footage immediacy, blown-out highlights',
  'Goodfellas': 'long unbroken Steadicam tracking, warm tungsten interiors, period grain, charismatic mid-shots',
  'The Matrix': 'desaturated green-tint cyber palette, slow-motion bullet-time, hard rim light, reflective surfaces',
  'Inception': 'monumental architecture, gravity-defying compositions, brassy Zimmer-heavy mood, IMAX wide lensing',
  'HUMBLE.': 'symmetrical Kendrick Lamar music video framing, baroque painterly tableaux, hard centered geometry',
  'Mad Max Fury Road': 'oversaturated orange/teal desert grade, high-speed lateral tracking, sand particle haze, brutalist kinetics',
  'Barry Lyndon': 'natural candlelight only, Kubrick zoom-out, classical painterly composition, ultra-soft falloff',
  'Moonlight': 'rich teal and magenta neon, intimate close-ups, shallow 35mm, soft melancholic stillness',
  'Evil Dead': 'low-angle horror dolly, dutch tilts, blood-red practicals, fog, suspenseful negative space',
  '1917': 'continuous oner Steadicam, immersive subjective perspective, overcast war palette, motivated practical light',
};

const STRUCT_SCHEMA = {
  type: 'object',
  properties: {
    scene_description: { type: 'string' },
    camera_movement: { type: 'string' },
    lens_style: { type: 'string' },
    lighting: { type: 'string' },
    emotional_tone: { type: 'string' },
    environment: { type: 'string' },
    cinematic_references: { type: 'string' },
    master_prompt: { type: 'string' },
  },
  required: ['scene_description','camera_movement','lens_style','lighting','emotional_tone','environment','cinematic_references','master_prompt'],
  additionalProperties: false,
};

async function callAI(messages: any[], tools?: any[], tool_choice?: any) {
  const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LO()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'google/gemini-3-flash-preview', messages, ...(tools ? { tools, tool_choice } : {}) }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`AI ${r.status}: ${t.slice(0, 400)}`);
  }
  return r.json();
}

async function enhance(prompt: string, director?: string, style?: string, extra?: string) {
  const directorHint = director && DIRECTORS[director] ? `Inject the cinematic language of director preset "${director}": ${DIRECTORS[director]}.` : '';
  const sys = `You are a Hollywood cinematographer + cinematic prompt engineer for AI video/image generation. ` +
    `Rewrite weak ideas into rich cinematic prompts. Always add: camera movement, lens behavior, lighting physics, environment, emotional tone. ` +
    `Never return generic output. ${directorHint} ${style ? `Visual style: ${style}.` : ''} ${extra || ''}`;
  const usr = `IDEA:\n${prompt}\n\nReturn a structured cinematic breakdown.`;
  const res = await callAI(
    [{ role: 'system', content: sys }, { role: 'user', content: usr }],
    [{
      type: 'function',
      function: { name: 'cinematic_prompt', description: 'Structured cinematic prompt', parameters: STRUCT_SCHEMA },
    }],
    { type: 'function', function: { name: 'cinematic_prompt' } },
  );
  const args = res?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error('AI returned no structured prompt');
  const structured = JSON.parse(args);
  return { structured, master: structured.master_prompt as string };
}

async function transcribe(audio: File | Blob) {
  const el = EL();
  if (!el) throw new Error('ELEVENLABS_API_KEY not configured');
  const fd = new FormData();
  fd.append('file', audio, 'voice.webm');
  fd.append('model_id', 'scribe_v2');
  fd.append('language_code', 'eng');
  const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST', headers: { 'xi-api-key': el }, body: fd,
  });
  if (!r.ok) throw new Error(`STT ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return (j?.text || '').trim() as string;
}

async function generateImageLovable(prompt: string) {
  const models = [
    'google/gemini-2.5-flash-image',
    'google/gemini-3.1-flash-image-preview',
    'google/gemini-3-pro-image-preview',
  ];
  let lastErr = '';
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${LO()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: `Generate a single cinematic image. ${prompt}` }],
            modalities: ['image', 'text'],
          }),
        });
        if (!r.ok) {
          lastErr = `${model} ${r.status}: ${(await r.text()).slice(0, 200)}`;
          if (r.status === 429 || r.status === 402) throw new Error(lastErr);
          continue;
        }
        const j = await r.json();
        const url = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (url) return url as string;
        lastErr = `${model}: no image in response (got text: ${String(j?.choices?.[0]?.message?.content || '').slice(0, 120)})`;
      } catch (e) {
        lastErr = (e as Error).message;
        if (lastErr.includes('429') || lastErr.includes('402')) throw e;
      }
    }
  }
  throw new Error(`Image gen failed after retries — ${lastErr}`);
}


async function generateImageAtlas(prompt: string, size = '1536x1024', quality = 'high') {
  const key = ATLAS();
  if (!key) throw new Error('ATLASCLOUD_API_KEY not configured');
  const sub = await fetch('https://api.atlascloud.ai/api/v1/model/generateImage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-image-2/text-to-image',
      prompt, size, quality,
      output_format: 'jpeg',
      enable_sync_mode: false,
      enable_base64_output: false,
      moderation: 'low',
    }),
  });
  if (!sub.ok) throw new Error(`Atlas submit ${sub.status}: ${(await sub.text()).slice(0, 300)}`);
  const subJ = await sub.json();
  const id = subJ?.data?.id;
  if (!id) throw new Error('Atlas: no prediction id');
  // gpt-image-2 on complex poster prompts can take 2-4 minutes. Poll up to ~240s.
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, i < 10 ? 2000 : 3000));
    const poll = await fetch(`https://api.atlascloud.ai/api/v1/model/prediction/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!poll.ok) continue;
    const pj = await poll.json();
    const status = pj?.data?.status;
    if (status === 'completed' || status === 'succeeded') {
      const out = pj?.data?.outputs?.[0];
      if (!out) throw new Error('Atlas: empty output');
      return out as string;
    }
    if (status === 'failed') throw new Error(pj?.data?.error || 'Atlas generation failed');
  }
  throw new Error('Atlas: poll timeout (job still running after 240s — try again or simplify the prompt)');
}

async function buildStoryboard(prompt: string, shots = 6, director?: string) {
  const directorHint = director && DIRECTORS[director] ? ` Use cinematic language of "${director}": ${DIRECTORS[director]}.` : '';
  const schema = {
    type: 'object',
    properties: {
      shots: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            number: { type: 'integer' },
            title: { type: 'string' },
            shot_type: { type: 'string' },
            camera_move: { type: 'string' },
            lens: { type: 'string' },
            lighting: { type: 'string' },
            description: { type: 'string' },
            seedance_prompt: { type: 'string' },
          },
          required: ['number','title','shot_type','camera_move','lens','lighting','description','seedance_prompt'],
        },
      },
    },
    required: ['shots'],
  };
  const sys = `You are a storyboard artist + cinematographer. Break down the scene into ${shots} sequential cinematic shots with continuity.${directorHint}` +
    ` Each "seedance_prompt" must be a complete, self-contained cinematic video generation prompt with camera move, lens, lighting, emotion, and motion.`;
  const res = await callAI(
    [{ role: 'system', content: sys }, { role: 'user', content: `SCENE:\n${prompt}\n\nReturn ${shots} shots.` }],
    [{ type: 'function', function: { name: 'storyboard', description: 'Cinematic shot list', parameters: schema } }],
    { type: 'function', function: { name: 'storyboard' } },
  );
  const args = res?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error('AI returned no storyboard');
  return JSON.parse(args).shots;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!LO()) throw new Error('LOVABLE_API_KEY not configured');
    const url = new URL(req.url);
    const action = url.pathname.split('/').filter(Boolean).pop() || '';
    const ct = req.headers.get('content-type') || '';

    // ---- voice transcribe + enhance ----
    if (action === 'transcribe' || ct.includes('multipart/form-data')) {
      const fd = await req.formData();
      const audio = fd.get('audio');
      const director = String(fd.get('director') || '') || undefined;
      const current = String(fd.get('current') || '');
      if (!(audio instanceof File) && !(audio instanceof Blob)) return json({ error: 'audio required' }, 400);
      const transcript = await transcribe(audio);
      if (!transcript) return json({ error: 'Empty transcript' }, 422);
      const blended = current ? `${current}\n\nSPOKEN ADDITION:\n${transcript}` : transcript;
      const out = await enhance(blended, director);
      return json({ transcript, ...out });
    }

    // ---- JSON actions ----
    const body = await req.json().catch(() => ({}));

    if (action === 'enhance') {
      const { prompt, director, style, extra } = body;
      if (!prompt) return json({ error: 'prompt required' }, 400);
      const out = await enhance(String(prompt), director, style, extra);
      return json(out);
    }

    if (action === 'image') {
      const { prompt, provider = 'lovable', size, quality } = body;
      if (!prompt) return json({ error: 'prompt required' }, 400);
      const imageUrl = provider === 'atlascloud'
        ? await generateImageAtlas(String(prompt), size, quality)
        : await generateImageLovable(String(prompt));
      const hosted = await rehostImage(imageUrl);
      return json({ imageUrl: hosted, provider });
    }

    // ---- Async Atlas (for long poster jobs that exceed edge function wall-clock) ----
    if (action === 'image-start') {
      const { prompt, size = '1536x1024', quality = 'high' } = body;
      if (!prompt) return json({ error: 'prompt required' }, 400);
      const key = ATLAS();
      if (!key) return json({ error: 'ATLASCLOUD_API_KEY not configured' }, 500);
      const sub = await fetch('https://api.atlascloud.ai/api/v1/model/generateImage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-image-2/text-to-image',
          prompt: String(prompt), size, quality,
          output_format: 'jpeg', enable_sync_mode: false, enable_base64_output: false, moderation: 'low',
        }),
      });
      if (!sub.ok) return json({ error: `Atlas submit ${sub.status}: ${(await sub.text()).slice(0, 300)}` }, 500);
      const subJ = await sub.json();
      const id = subJ?.data?.id;
      if (!id) return json({ error: 'Atlas: no prediction id' }, 500);
      return json({ jobId: id });
    }

    if (action === 'image-status') {
      const { jobId } = body;
      if (!jobId) return json({ error: 'jobId required' }, 400);
      const key = ATLAS();
      if (!key) return json({ error: 'ATLASCLOUD_API_KEY not configured' }, 500);
      const poll = await fetch(`https://api.atlascloud.ai/api/v1/model/prediction/${jobId}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!poll.ok) return json({ status: 'processing' });
      const pj = await poll.json();
      const status = pj?.data?.status;
      if (status === 'completed' || status === 'succeeded') {
        const out = pj?.data?.outputs?.[0];
        const hosted = out ? await rehostImage(out) : null;
        return json({ status: 'completed', imageUrl: hosted });
      }
      if (status === 'failed') return json({ status: 'failed', error: pj?.data?.error || 'failed' });
      return json({ status: 'processing' });
    }

    // ---- on-demand rehost + header probe for client-side fallback ----
    if (action === 'image-rehost') {
      const { url } = body;
      if (!url || typeof url !== 'string') return json({ error: 'url required' }, 400);
      // Probe original headers for the debug overlay
      const probeHeaders: Record<string, string> = {};
      let probeStatus = 0;
      let probeOk = false;
      try {
        const probe = await fetch(url, { method: 'GET' });
        probeStatus = probe.status;
        probeOk = probe.ok;
        probe.headers.forEach((v, k) => { probeHeaders[k] = v; });
        // Drain body to free socket
        try { await probe.arrayBuffer(); } catch { /* ignore */ }
      } catch (e) {
        return json({
          error: `probe failed: ${(e as Error).message}`,
          originalUrl: url,
          probeStatus: 0,
          probeHeaders: {},
        }, 200);
      }
      const hosted = await rehostImage(url);
      const rehosted = hosted !== url;
      return json({
        imageUrl: hosted,
        originalUrl: url,
        rehosted,
        probeStatus,
        probeOk,
        probeHeaders,
      });
    }



    if (action === 'storyboard') {
      const { prompt, shots = 6, director } = body;
      if (!prompt) return json({ error: 'prompt required' }, 400);
      const out = await buildStoryboard(String(prompt), Math.min(Math.max(Number(shots) || 6, 2), 12), director);
      return json({ shots: out });
    }

    if (action === 'seedance') {
      const { prompt, model = 'seedance-2-fast', aspect = '16:9', image_url } = body;
      if (!prompt) return json({ error: 'prompt required' }, 400);
      const authHeader = req.headers.get('Authorization') || '';
      if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

      const hasImage = Boolean(image_url);
      // Seedance 2 Pro i2v rejects photoreal humans. Auto-downgrade all i2v jobs to Fast.
      let seedanceModel = hasImage
        ? 'bytedance/seedance-2.0-fast/image-to-video'
        : (model === 'seedance-2'
            ? 'bytedance/seedance-2.0/text-to-video'
            : 'bytedance/seedance-2.0-fast/text-to-video');
      const task_type = hasImage ? 'i2v' : 't2v';

      const submit = async (m: string) => {
        const r = await fetch(`${SB_URL()}/functions/v1/studio-orchestrator`, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_type,
            prompt,
            input_image_url: image_url || null,
            settings_json: {
              provider: 'seedance',
              seedance_model: m,
              seedance_resolution: '720p',
              aspect_ratio: aspect,
              seedance_ratio: aspect,
            },
          }),
        });
        const jj = await r.json().catch(() => ({}));
        return { status: r.status, body: jj };
      };

      let { status, body: j } = await submit(seedanceModel);

      // Safety-net retry: if any "real person" rejection slips through, resubmit on Fast i2v.
      const errStr = JSON.stringify(j || {}).toLowerCase();
      if (status >= 400 && hasImage && errStr.includes('may contain real person')) {
        console.log('[seedance] real-person block — retrying on seedance-2-fast i2v');
        seedanceModel = 'bytedance/seedance-2.0-fast/image-to-video';
        ({ status, body: j } = await submit(seedanceModel));
        if (status < 400 && j && typeof j === 'object') {
          (j as any).auto_downgraded = true;
          (j as any).downgrade_reason = 'Seedance Pro blocked photoreal subject — retried on Fast.';
        }
      }

      return json(j, status);
    }

    return json({ error: `Unknown action: ${action}` }, 404);
  } catch (e) {
    console.error('story-composer error', e);
    return json({ error: (e as Error).message || 'Unknown error' }, 500);
  }
});
