import { useState } from "react";
import { DollarSign, Copy, Check, Smartphone, Send, CreditCard, Mail } from "lucide-react";
import { toast } from "sonner";

const ZELLE = "Me@cozyhomestudio.com";
const CASHAPP = "$ITSWARR";
const INVOICE_EMAIL = "Me@cozyhomestudio.com";

const PayMe = () => {
  const [copied, setCopied] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-md">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
              <DollarSign className="h-8 w-8 text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Pay Warren</h1>
            <p className="text-zinc-400 text-sm mt-1">Zelle, Cash App, or Card by Invoice</p>
          </div>

          {/* Card by Invoice */}
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-amber-400" />
              <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Credit / Debit Card</span>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Card payments are handled through a secure invoice link sent to your email.
              Reply to your latest email or request an invoice and you'll receive a secure
              hosted checkout link to pay by credit or debit card.
            </p>
            <a
              href={`mailto:${INVOICE_EMAIL}?subject=Invoice%20Request&body=Hi%20Warren%2C%20please%20send%20me%20a%20secure%20card%20invoice.`}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition"
            >
              <Mail className="h-4 w-4" /> Request Card Invoice
            </a>
            <p className="mt-3 text-[11px] text-zinc-500">
              Secure hosted checkout. Your card details are never entered or stored on this site.
            </p>
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
