import { supabase } from "@/integrations/supabase/client";

export type LRTestAttempt = {
  url: string;
  ok: boolean;
  http_status: number;
  duration_ms: number;
  error?: string;
  body_preview?: string;
};
export type LRTestResult = {
  success: boolean;
  message: string;
  egress_ip?: string | null;
  username?: string;
  attempts?: LRTestAttempt[];
  raw?: any;
};

export async function lrTestConnection(): Promise<LRTestResult> {
  const { data, error } = await supabase.functions.invoke("leadsrain-test-connection", { body: {} });
  if (error) throw error;
  return data as LRTestResult;
}

export type SendVoiceDropInput = {
  customer_id?: string | null;
  lead_id?: string | null;
  phone_number: string;
  campaign_id?: string | null;
  first_name?: string;
  last_name?: string;
};

export async function lrSendVoiceDrop(input: SendVoiceDropInput) {
  const { data, error } = await supabase.functions.invoke("leadsrain-send-voicedrop", { body: input });
  if (error) throw error;
  return data as {
    ok: boolean;
    drop_id?: string;
    status?: string;
    provider_lead_id?: string | null;
    voidfix_sms_sent?: boolean;
    voidfix_error?: string | null;
    error?: string;
  };
}

export async function lrRefreshStatus(drop_id: string) {
  const { data, error } = await supabase.functions.invoke("leadsrain-refresh-status", { body: { drop_id } });
  if (error) throw error;
  return data;
}
