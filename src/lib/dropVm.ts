import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export async function sendRinglessVM(opts: {
  phone: string;
  customer_id?: string;
  audio_url?: string;
}): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("drop-vm", {
      body: { action: "send", ...opts },
    });
    if (error) throw error;
    if (!data?.success) {
      const msg = data?.drop_response?.ApiStatusMessage || data?.error || "Drop failed";
      toast.error(`Voicemail drop failed: ${msg}`);
      return false;
    }
    toast.success("Ringless voicemail queued ✓");
    return true;
  } catch (err: any) {
    toast.error(err.message || "Failed to send voicemail drop");
    return false;
  }
}
