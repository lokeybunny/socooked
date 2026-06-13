import { useEffect, useState } from "react";
import { Phone, PhoneCall } from "lucide-react";

export default function AutoCall() {
  const [called, setCalled] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const PHONE = "+17028322317";
  const TEL_HREF = `tel:${PHONE}`;

  useEffect(() => {
    if (countdown <= 0) {
      window.location.href = TEL_HREF;
      setCalled(true);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-8">
        <div className="mx-auto w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center ring-1 ring-emerald-500/30">
          <PhoneCall className="w-10 h-10 text-emerald-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            Calling you now…
          </h1>
          <p className="text-slate-400 text-sm">
            Your phone should ring in a moment.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6 space-y-4">
          <div className="text-4xl font-mono font-bold text-emerald-400 tabular-nums">
            {countdown > 0 ? countdown : "Calling…"}
          </div>

          <a
            href={TEL_HREF}
            className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-3 px-6 transition-colors"
          >
            <Phone className="w-5 h-5" />
            {called ? "Call Again" : `Call ${PHONE}`}
          </a>

          <p className="text-xs text-slate-500">
            If the call didn&apos;t start automatically, tap the button above.
          </p>
        </div>

        <p className="text-xs text-slate-600">
          Powered by WarrenTheCreative
        </p>
      </div>
    </div>
  );
}
