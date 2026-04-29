import { useState } from "react";
import { DollarSign, Copy, Check, Smartphone, Send, CreditCard, Loader2, ShieldCheck, Receipt, AlertCircle, Download, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";

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
  const [success, setSuccess] = useState<{ id: string; amount: string; last4: string; name: string; email: string; note: string; date: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);

  // Eligibility gate
  const [verifying, setVerifying] = useState(false);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  const luhnValid = (num: string): boolean => {
    if (!/^\d+$/.test(num)) return false;
    let sum = 0, alt = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let d = parseInt(num[i], 10);
      if (alt) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
      alt = !alt;
    }
    return sum % 10 === 0;
  };

  const setError = (msg: string, field?: string) => {
    setErrorMsg(msg);
    setErrorField(field || null);
    toast.error(msg);
  };
  const fieldClass = (name: string, base: string) =>
    `${base} ${errorField === name ? "border-red-500 focus:border-red-500" : "border-zinc-700 focus:border-amber-500"}`;
  const verifyEligibility = async () => {
    const clean = email.trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      return setError("Enter a valid email to unlock card payments.", "email");
    }
    setVerifying(true);
    setErrorMsg(null); setErrorField(null);
    try {
      const { data, error } = await supabase.functions.invoke("verify-proposal-signed", {
        body: { email: clean },
      });
      if (error) throw new Error(error.message);
      if (data?.eligible) {
        setEligible(true);
        setVerifiedEmail(clean);
        toast.success("Card payments unlocked");
      } else {
        setEligible(false);
        setVerifiedEmail(null);
        setError("This email has no signed agreement on file. Card payments are restricted to clients with a signed proposal.", "email");
      }
    } catch (e: any) {
      setError(e?.message || "Verification failed", "email");
    } finally {
      setVerifying(false);
    }
  };

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
    setErrorMsg(null); setErrorField(null);

    if (!eligible || !verifiedEmail || verifiedEmail !== email.trim().toLowerCase()) {
      return setError("Verify your email first to unlock card payments.", "email");
    }

    const amt = Number(amount);
    if (!amt || amt < 1) return setError("Enter a valid amount of at least $1.", "amount");
    if (amt > 100000) return setError("Amount cannot exceed $100,000.", "amount");

    const rawCard = cardNumber.replace(/\D/g, "");
    if (rawCard.length < 13 || rawCard.length > 16) return setError("Card number must be 13–16 digits.", "cardNumber");
    if (!luhnValid(rawCard)) return setError("That card number doesn't look right. Please double-check the digits.", "cardNumber");

    const [mm, yy] = exp.split("/");
    if (!mm || !yy) return setError("Enter the expiration as MM/YY.", "exp");
    const mmNum = Number(mm);
    if (mmNum < 1 || mmNum > 12) return setError("Expiry month must be 01–12.", "exp");
    const fullYear = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    const lastDay = new Date(fullYear, mmNum, 0, 23, 59, 59);
    if (lastDay < new Date()) return setError("This card has expired.", "exp");

    if (cvv.length < 3 || cvv.length > 4) return setError("CVV must be 3 or 4 digits.", "cvv");

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("authnet-charge", {
        body: { amount: amt, cardNumber: rawCard, expMonth: mm, expYear: yy, cvv, zip, name, email, note },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) {
        setError(data?.error || "Charge failed", data?.field);
        return;
      }
      setSuccess({
        id: data.transactionId,
        amount: data.amount,
        last4: data.last4,
        name,
        email,
        note,
        date: new Date().toLocaleString(),
      });
      toast.success(`Charged $${data.amount}`);
      setCardNumber(""); setExp(""); setCvv("");
    } catch (err: any) {
      // FunctionsHttpError stashes the JSON body on err.context
      let msg = err?.message || "Payment failed";
      let field: string | undefined;
      try {
        const ctx = err?.context;
        if (ctx && typeof ctx.json === "function") {
          const j = await ctx.json();
          if (j?.error) msg = j.error;
          if (j?.field) field = j.field;
        }
      } catch { /* ignore */ }
      setError(msg, field);
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
                      onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, "")); if (errorField === "amount") setErrorField(null); }}
                      placeholder="0.00"
                      className={fieldClass("amount", "w-full pl-7 pr-3 py-2 bg-zinc-900 border rounded-lg text-white text-lg focus:outline-none")}
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
                  onChange={(e) => { setCardNumber(formatCard(e.target.value)); if (errorField === "cardNumber") setErrorField(null); }}
                  placeholder="Card number"
                  className={fieldClass("cardNumber", "w-full px-3 py-2 bg-zinc-900 border rounded-lg text-white text-sm tracking-wider focus:outline-none")}
                  required
                />

                <div className="grid grid-cols-3 gap-2">
                  <input
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    value={exp}
                    onChange={(e) => { setExp(formatExp(e.target.value)); if (errorField === "exp") setErrorField(null); }}
                    placeholder="MM/YY"
                    className={fieldClass("exp", "px-3 py-2 bg-zinc-900 border rounded-lg text-white text-sm focus:outline-none")}
                    required
                  />
                  <input
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    value={cvv}
                    onChange={(e) => { setCvv(e.target.value.replace(/\D/g, "").slice(0, 4)); if (errorField === "cvv") setErrorField(null); }}
                    placeholder="CVV"
                    className={fieldClass("cvv", "px-3 py-2 bg-zinc-900 border rounded-lg text-white text-sm focus:outline-none")}
                    required
                  />
                  <input
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={zip}
                    onChange={(e) => { setZip(e.target.value.replace(/\D/g, "").slice(0, 10)); if (errorField === "zip") setErrorField(null); }}
                    placeholder="ZIP"
                    className={fieldClass("zip", "px-3 py-2 bg-zinc-900 border rounded-lg text-white text-sm focus:outline-none")}
                  />
                </div>

                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (invoice # or memo)"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  maxLength={250}
                />

                {errorMsg && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-[1px]" />
                    <span>{errorMsg}</span>
                  </div>
                )}

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

        {/* Recent Receipts */}
        {receipts.length > 0 && (
          <div className="mt-6 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="h-4 w-4 text-amber-400" />
              <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Recent Receipts</span>
            </div>
            <ul className="space-y-2">
              {receipts.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/40"
                >
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium truncate">
                      {r.payer_name || "Anonymous"}
                      {r.last4 && <span className="text-zinc-500 font-normal"> · •••• {r.last4}</span>}
                    </div>
                    <div className="text-zinc-500 text-xs truncate">
                      {new Date(r.created_at).toLocaleString()}
                      {r.note && ` · ${r.note}`}
                    </div>
                  </div>
                  <div className="text-amber-400 font-semibold text-sm shrink-0">
                    ${Number(r.amount).toFixed(2)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default PayMe;
