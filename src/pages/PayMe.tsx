import { useState } from "react";
import { DollarSign, Copy, Check, Smartphone, Send } from "lucide-react";
import { toast } from "sonner";

const ZELLE = "Me@cozyhomestudio.com";
const CASHAPP = "$ITSWARR";

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
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
              <DollarSign className="h-8 w-8 text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Pay Warren</h1>
            <p className="text-zinc-400 text-sm mt-1">Send via Zelle or Cash App</p>
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
