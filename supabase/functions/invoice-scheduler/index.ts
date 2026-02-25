import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INVOICE_API_URL = SUPABASE_URL + '/functions/v1/invoice-api';
const GMAIL_API_URL = SUPABASE_URL + '/functions/v1/gmail-api';

const ACTIONS_MANIFEST = `
You are an Invoice Scheduler AI for a CRM. You translate natural language into Invoice API and Gmail API calls.
Current UTC time: {{NOW}}

CUSTOMER DATABASE (use for name/email resolution):
{{CUSTOMERS}}

AVAILABLE ACTIONS (return as JSON array of steps):

=== INVOICE ACTIONS (via invoice-api) ===

1. create-invoice — Create a new invoice
   Method: POST to invoice-api
   Body: {
     customer_id: "uuid" (REQUIRED - resolve from customer name above),
     line_items: [{ description: string, quantity: number, unit_price: number }] (REQUIRED),
     currency?: "USD"|"EUR"|"GBP"|"AUD"|"CAD" (default: "USD"),
     due_date?: "YYYY-MM-DD",
     notes?: string,
     tax_rate?: number (percentage, default: 0),
     status?: "draft"|"paid" (default: "draft"),
     auto_send?: boolean (if true, creates + generates PDF + emails in one step)
   }

2. send-invoice — Generate PDF and email an existing invoice
   Method: POST to invoice-api?action=send-invoice
   Body: { invoice_id: "uuid" }

3. update-invoice-status — Mark invoice as paid/sent/void
   Method: PATCH to invoice-api
   Body: { invoice_id: "uuid", status: "paid"|"sent"|"void"|"draft" }

4. list-invoices — List invoices (optionally filter by customer)
   Method: GET to invoice-api?customer_id=uuid
   No body needed.

5. delete-invoice — Delete an invoice
   Method: DELETE directly via supabase
   Body: { invoice_id: "uuid" }

=== EMAIL ACTIONS (via gmail-api) ===

6. send-email — Send a custom email (not invoice-related)
   Method: POST to gmail-api?action=send
   Body: { to: "email", subject: "string", body: "html string" }

7. read-inbox — Read recent emails
   Method: GET to gmail-api?action=inbox&maxResults=10

RULES:
- Always resolve customer names to their customer_id and email from the database above.
- If the user says "send a paid invoice to X for $500", create with status:"paid" and auto_send:true.
- If the user says "send X an invoice for $500 due next week", create with status:"draft", auto_send:true, and calculate due_date.
- If the user says "mark invoice INV-XXXXX as paid", use update-invoice-status.
- If the user says "email invoice INV-XXXXX", use send-invoice with the invoice_id.
- For amounts like "$500", create a single line item: { description: "Professional Services", quantity: 1, unit_price: 500 }.
- For multi-item invoices, create multiple line items.
- User timezone is PST (UTC-8). Convert relative dates accordingly.
- Return a JSON array of steps. Each step: { "action": "...", "method": "POST"|"GET"|"PATCH"|"DELETE", "endpoint": "invoice-api"|"gmail-api", "params": {...}, "body": {...}, "description": "human-readable" }
- If the request is unclear, return: { "clarify": "question to ask" }
- Never fabricate invoice IDs. If you need one, ask or look it up.
- When creating invoices with auto_send, remind the user the PDF will be generated and emailed automatically.

EXISTING INVOICES:
{{INVOICES}}
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

async function executeAction(step: any): Promise<any> {
  const { action, method, endpoint, params, body } = step;

  let url = '';
  if (endpoint === 'invoice-api') {
    url = INVOICE_API_URL;
    if (params) {
      const sp = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, String(v)); });
      if (sp.toString()) url += '?' + sp.toString();
    }
  } else if (endpoint === 'gmail-api') {
    url = GMAIL_API_URL;
    if (params) {
      const sp = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, String(v)); });
      if (sp.toString()) url += '?' + sp.toString();
    }
  }

  const fetchOpts: RequestInit = {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
  };
  if (body && method !== 'GET') fetchOpts.body = JSON.stringify(body);

  const res = await fetch(url, fetchOpts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text, status: res.status }; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, history } = await req.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch customers and recent invoices for context
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    
    const [customersRes, invoicesRes] = await Promise.all([
      supabase.from('customers').select('id, full_name, email, company').order('full_name'),
      supabase.from('invoices').select('id, invoice_number, customer_id, amount, status, currency, due_date, customers(full_name, email)').order('created_at', { ascending: false }).limit(50),
    ]);

    const customers = customersRes.data || [];
    const invoices = invoicesRes.data || [];

    const customersContext = customers.map(c => 
      `- ${c.full_name} (id: ${c.id}, email: ${c.email || 'none'}${c.company ? ', company: ' + c.company : ''})`
    ).join('\n');

    const invoicesContext = invoices.map(inv => 
      `- ${inv.invoice_number || 'no-number'} | ${(inv as any).customers?.full_name || 'unknown'} | $${inv.amount} ${inv.currency} | status: ${inv.status}`
    ).join('\n') || 'No invoices yet.';

    const now = new Date().toISOString();
    const systemPrompt = ACTIONS_MANIFEST
      .replace('{{NOW}}', now)
      .replace('{{CUSTOMERS}}', customersContext)
      .replace('{{INVOICES}}', invoicesContext);

    // Build context with history
    const contextParts: string[] = [];
    if (history?.length) {
      contextParts.push('Recent conversation:\n' + history.map((h: any) => `${h.role}: ${h.text}`).join('\n'));
    }
    const fullPrompt = contextParts.length
      ? `${prompt}\n\nContext:\n${contextParts.join('\n')}`
      : prompt;

    // Step 1: AI parses the intent
    const aiResponse = await callAI(systemPrompt, fullPrompt);
    console.log('[invoice-scheduler] AI response:', aiResponse);

    // Extract JSON
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
        const result = await executeAction(step);
        results.push({
          action: step.action,
          description: step.description || step.action,
          success: !(result?.success === false || result?.error),
          data: result?.data || result,
          error: result?.error,
        });

        // Log activity
        try {
          await supabase.from('activity_log').insert({
            entity_type: 'invoice',
            action: step.action,
            meta: { name: `Invoice Terminal: ${step.description || step.action}` },
          });
        } catch (_) {}
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
    console.error('[invoice-scheduler] error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
