import { useState, useEffect, useCallback } from "react";
import { DollarSign, Copy, Check, Smartphone, Send, CreditCard, Loader2, ShieldCheck, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const ZELLE = "Me@cozyhomestudio.com";
const CASHAPP = "$ITSWARR";

const PayMe = () => {
  const [copied, setCopied] = useState<string | null>(null);

  // Card form state
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [exp, setExp] = useState(""); // MM/YY
  const [cvv, setCvv] = useState("");
  const [zip, setZip] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ id: string; amount: string; last4: string } | null>(null);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const formatCard = (v: string) =>
    v.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");

  const formatExp = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    if (d.length <= 2) return d;
    return `${d.slice(0, 2)}/${d.slice(2)}`;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt < 1) { toast.error("Enter a valid amount"); return; }
    const [mm, yy] = exp.split("/");
    if (!mm || !yy) { toast.error("Enter expiry as MM/YY"); return; }
    const rawCard = cardNumber.replace(/\s+/g, "");
    if (rawCard.length < 13) { toast.error("Enter a valid card number"); return; }
    if (cvv.length < 3) { toast.error("Enter CVV"); return; }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("authnet-charge", {
        body: {
          amount: amt,
          cardNumber: rawCard,
          expMonth: mm,
          expYear: yy,
          cvv,
          zip,
          name,
          email,
          note,
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Charge failed");
      setSuccess({ id: data.transactionId, amount: data.amount, last4: data.last4 });
      toast.success(`Charged $${data.amount}`);
      // Reset sensitive fields
      setCardNumber(""); setExp(""); setCvv("");
    } catch (err: any) {
      toast.error(err.message || "Payment failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-md">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
              <DollarSign className="h-8 w-8 text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Pay Warren</h1>
            <p className="text-zinc-400 text-sm mt-1">Card, Zelle, or Cash App</p>
          </div>

          {/* Credit Card */}
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="h-4 w-4 text-amber-400" />
              <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Credit / Debit Card</span>
            </div>

            {success ? (
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 border border-green-500/30 mb-3">
                  <Check className="h-6 w-6 text-green-400" />
                </div>
                <p className="text-white font-semibold">Payment of ${success.amount} received</p>
                <p className="text-zinc-400 text-xs mt-1">Card ending {success.last4}</p>
                <p className="text-zinc-500 text-xs mt-1">Ref: {success.id}</p>
                <button
                  onClick={() => { setSuccess(null); setAmount(""); }}
                  className="mt-4 text-amber-400 text-sm hover:underline"
                >
                  Make another payment
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400">Amount (USD)</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                    <input
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-lg focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                    required
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email (receipt)"
                    className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>

                <input
                  inputMode="numeric"
                  autoComplete="cc-number"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCard(e.target.value))}
                  placeholder="Card number"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm tracking-wider focus:outline-none focus:border-amber-500"
                  required
                />

                <div className="grid grid-cols-3 gap-2">
                  <input
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    value={exp}
                    onChange={(e) => setExp(formatExp(e.target.value))}
                    placeholder="MM/YY"
                    className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                    required
                  />
                  <input
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="CVV"
                    className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                    required
                  />
                  <input
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={zip}
                    onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="ZIP"
                    className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>

                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (invoice # or memo)"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  maxLength={250}
                />

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-semibold text-sm transition flex items-center justify-center gap-2"
                >
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : <>Pay ${amount || "0.00"}</>}
                </button>
                <p className="flex items-center justify-center gap-1 text-[10px] text-zinc-500">
                  <ShieldCheck className="h-3 w-3" /> Secured by Authorize.Net
                </p>
              </form>
            )}
          </div>

          {/* Zelle */}
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Send className="h-4 w-4 text-purple-400" />
              <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Zelle</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-white font-medium break-all">{ZELLE}</span>
              <button
                onClick={() => copy("Zelle", ZELLE)}
                className="shrink-0 p-2 rounded-lg bg-zinc-700/60 hover:bg-zinc-700 text-zinc-200 transition"
                aria-label="Copy Zelle"
              >
                {copied === "Zelle" ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Cash App */}
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Smartphone className="h-4 w-4 text-green-400" />
              <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Cash App</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-white font-medium">{CASHAPP}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => copy("Cash App", CASHAPP)}
                  className="shrink-0 p-2 rounded-lg bg-zinc-700/60 hover:bg-zinc-700 text-zinc-200 transition"
                  aria-label="Copy Cash App"
                >
                  {copied === "Cash App" ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </button>
                <a
                  href={`https://cash.app/${CASHAPP}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 px-3 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-black text-xs font-semibold transition"
                >
                  Open
                </a>
              </div>
            </div>
          </div>

          <p className="text-zinc-500 text-xs text-center">
            Please include your name or invoice # in the memo.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PayMe;
