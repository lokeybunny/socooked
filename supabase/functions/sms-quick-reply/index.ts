import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { inboundMessage, contactName, recentMessages } = await req.json();
    if (!inboundMessage || typeof inboundMessage !== 'string') {
      return new Response(JSON.stringify({ error: 'inboundMessage required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const system = `You are Warren, an AI drone videographer reaching out to real estate agents and property owners. Draft a SHORT, friendly, casual SMS reply (1-3 sentences max, under 320 chars) directly answering or responding to the lead's last message. Be human, warm, no emojis unless the lead used them, no signatures, no greetings like "Hi [Name]". Just the reply text — nothing else.`;

    const history = (Array.isArray(recentMessages) ? recentMessages : [])
      .slice(-8)
      .map((m: any) => `${m.direction === 'outbound' ? 'Me' : (contactName || 'Lead')}: ${m.body || ''}`)
      .join('\n');

    const userPrompt = `Conversation so far:\n${history}\n\nThe lead just said: "${inboundMessage}"\n\nDraft my reply.`;

    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      const status = r.status === 429 || r.status === 402 ? r.status : 500;
      return new Response(JSON.stringify({ error: status === 429 ? 'Rate limited' : status === 402 ? 'Add credits to Lovable AI' : 'AI error', detail: t }), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || '';
    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
