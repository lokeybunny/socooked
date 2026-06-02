import { useEffect, useState } from "react";
import { MessageCircle, X, ExternalLink } from "lucide-react";

const STORAGE_KEY = "wgb_pending_ticket_v1";
const DISCORD_URL = "https://discord.gg/warrenguru";
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const NOTIFY_INTERVAL_MS = 2 * 60 * 60 * 1000; // every 2h

export type PendingTicket = {
  confirmedAt: number;
  txHash?: string | null;
  lastNotifiedAt?: number;
  dismissed?: boolean;
};

export function markPurchasePending(txHash?: string | null) {
  try {
    const payload: PendingTicket = {
      confirmedAt: Date.now(),
      txHash: txHash || null,
      lastNotifiedAt: Date.now(),
      dismissed: false,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

function readPending(): PendingTicket | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingTicket;
    if (!p?.confirmedAt) return null;
    if (Date.now() - p.confirmedAt > WINDOW_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

function writePending(p: PendingTicket) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function fireNotification(txHash?: string | null) {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const n = new Notification("Reminder: Open your Discord verification ticket", {
      body: txHash
        ? "Paste your Solscan receipt in #verify so Warren Guru can assign your role."
        : "Join the Warren Guru Discord and open a #verify ticket to claim access.",
      tag: "wgb-ticket-reminder",
      requireInteraction: false,
    });
    n.onclick = () => {
      window.open(DISCORD_URL, "_blank", "noopener,noreferrer");
      n.close();
    };
  } catch {
    /* ignore */
  }
}

export default function DiscordTicketReminder() {
  const [pending, setPending] = useState<PendingTicket | null>(null);
  const [hidden, setHidden] = useState(false);

  // Sync with localStorage (across tabs + initial load)
  useEffect(() => {
    setPending(readPending());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPending(readPending());
    };
    const onFocus = () => setPending(readPending());
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Periodic notifications while window is open
  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => {
      const cur = readPending();
      if (!cur) {
        setPending(null);
        return;
      }
      const last = cur.lastNotifiedAt || cur.confirmedAt;
      if (Date.now() - last >= NOTIFY_INTERVAL_MS) {
        fireNotification(cur.txHash);
        const next = { ...cur, lastNotifiedAt: Date.now() };
        writePending(next);
        setPending(next);
      }
    }, 60 * 1000); // check every minute
    return () => window.clearInterval(id);
  }, [pending?.confirmedAt]);

  if (!pending || hidden) return null;

  const handleOpened = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setPending(null);
  };

  const goDiscord = () => {
    window.open(DISCORD_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed bottom-4 right-4 z-[1000] max-w-sm w-[calc(100%-2rem)] sm:w-96">
      <div className="rounded-2xl border border-emerald-400/30 bg-black/90 backdrop-blur-xl shadow-2xl shadow-emerald-500/10 overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <div className="h-9 w-9 rounded-xl bg-[#5865F2]/20 border border-[#5865F2]/40 flex items-center justify-center shrink-0">
            <MessageCircle className="h-4 w-4 text-[#a4adff]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold leading-tight">Open your Discord ticket</p>
            <p className="text-white/60 text-xs mt-1 leading-relaxed">
              Your payment is confirmed. Open a <span className="text-emerald-300">#verify</span> ticket and paste your Solscan receipt to get your role.
            </p>
            {pending.txHash && (
              <a
                href={`https://solscan.io/tx/${pending.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono text-emerald-300/80 hover:text-emerald-200 break-all"
              >
                <ExternalLink className="h-3 w-3" /> {pending.txHash.slice(0, 10)}…{pending.txHash.slice(-8)}
              </a>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={goDiscord}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-[11px] font-semibold tracking-wide transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Open Ticket
              </button>
              <button
                onClick={handleOpened}
                className="px-3 py-2 rounded-lg border border-white/15 hover:border-emerald-400/40 text-white/70 hover:text-emerald-300 text-[11px] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
          <button
            onClick={() => setHidden(true)}
            aria-label="Hide for now"
            className="text-white/30 hover:text-white/70 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
