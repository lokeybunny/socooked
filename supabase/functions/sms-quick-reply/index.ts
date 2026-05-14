import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { inboundMessage, contactName, recentMessages, inboundAt } = await req.json();
    if (!inboundMessage || typeof inboundMessage !== 'string') {
      return new Response(JSON.stringify({ error: 'inboundMessage required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    // Format the lead's reply timestamp into a friendly string (PST)
    let whenLabel = '';
    try {
      const t = inboundAt ? new Date(inboundAt) : null;
      if (t && !isNaN(t.getTime())) {
        whenLabel = t.toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit',
        }) + ' PST';
      }
    } catch {}

    const LINK = 'https://instagram.com/w4rr3nguru';

    const system = `You are Warren, an AI drone videographer texting back real estate agents and property owners.

OUTPUT FORMAT — follow EXACTLY, three short blocks separated by blank lines:

Block 1 — quote their question with timestamp:
> "<their exact message, trimmed if long>" — ${whenLabel || 'earlier'}

Block 2 — your friendly, direct answer (1-3 sentences, casual, human, no greetings, no "Hi [name]", no signatures, no emojis unless they used them).

Block 3 — exactly this link on its own line:
${LINK}

Total under 480 chars. Do NOT add anything before, after, or around these blocks. Do NOT use square-bracket placeholders.`;

    const history = (Array.isArray(recentMessages) ? recentMessages : [])
      .slice(-8)
      .map((m: any) => `${m.direction === 'outbound' ? 'Me' : (contactName || 'Lead')}: ${m.body || ''}`)
      .join('\n');

    const userPrompt = `Conversation so far:\n${history || '(no prior thread)'}\n\nThe lead said${whenLabel ? ` at ${whenLabel}` : ''}: "${inboundMessage}"\n\nDraft the 3-block reply now.`;


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
