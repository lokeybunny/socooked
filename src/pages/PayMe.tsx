import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DollarSign, CreditCard, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const PayMe = () => {
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const presets = [25, 50, 100, 250, 500, 1000];

  const handlePay = async () => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || cents < 100) {
      toast.error("Please enter at least $1.00");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("square-pay-me", {
        body: { amount_cents: cents, name: name.trim() || "Anonymous", note: note.trim() },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No payment URL returned");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to create payment link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
              <DollarSign className="h-8 w-8 text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Pay Warren</h1>
            <p className="text-zinc-400 text-sm mt-1">Enter any amount below</p>
          </div>

          {/* Quick Amounts */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p.toString())}
                className={`py-2 rounded-lg text-sm font-medium transition-all border ${
                  amount === p.toString()
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                    : "bg-zinc-800/60 border-zinc-700/50 text-zinc-300 hover:border-zinc-600"
                }`}
              >
                ${p}
              </button>
            ))}
          </div>

          {/* Custom Amount */}
          <div className="space-y-4">
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                type="number"
                min="1"
                step="0.01"
                placeholder="Custom amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-9 bg-zinc-800/60 border-zinc-700 text-white text-lg h-12"
              />
            </div>

            <Input
              placeholder="Your name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-zinc-800/60 border-zinc-700 text-white"
            />

            <Textarea
              placeholder="Add a note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="bg-zinc-800/60 border-zinc-700 text-white resize-none"
            />

            <Button
              onClick={handlePay}
              disabled={loading || !amount}
              className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-base"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <CreditCard className="h-5 w-5 mr-2" />
                  Pay {amount ? `$${parseFloat(amount).toFixed(2)}` : "Now"}
                </>
              )}
            </Button>
          </div>

          <p className="text-zinc-600 text-xs text-center mt-4">
            Secured by Square · Credit Card, Apple Pay, Google Pay
          </p>
        </div>
      </div>
    </div>
  );
};

export default PayMe;
