import { supabase } from '@/integrations/supabase/client';

/**
 * When a user enters an AI-generated website URL for a customer,
 * auto-create or update the corresponding api_previews record.
 */
export async function upsertAiPreview(customerId: string, aiWebsite: string | null, customerName: string) {
  if (!aiWebsite) return;

  const url = aiWebsite.startsWith('http') ? aiWebsite : `https://${aiWebsite}`;

  // Check if a preview already exists for this customer with this URL
  const { data: existing } = await supabase
    .from('api_previews')
    .select('id, preview_url')
    .eq('customer_id', customerId)
    .limit(50);

  const alreadyExists = existing?.some(p => p.preview_url === url);
  if (alreadyExists) return;

  // Create a new preview record
  await supabase.from('api_previews').insert({
    customer_id: customerId,
    title: `${customerName} — AI Website`,
    preview_url: url,
    edit_url: url,
    status: 'completed',
    source: 'manual',
  });
}
