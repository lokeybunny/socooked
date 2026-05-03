import { motion } from 'framer-motion';
import {
  Mail, Phone, MapPin, ShieldCheck, PlayCircle, PauseCircle, CheckCircle2,
  Upload, FileSignature, Receipt, User, MoreHorizontal, Send, UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CountdownTimer } from './CountdownTimer';
import { cn } from '@/lib/utils';

export interface QueueRow {
  id: string;
  customer_id: string | null;
  proposal_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  listing_address: string | null;
  status: string;
  production_started_at: string | null;
  deadline_at: string | null;
  paused_at: string | null;
  total_paused_seconds: number;
  signed_at: string | null;
  payment_approved_at: string | null;
  assigned_to: string | null;
  notes: string | null;
  meta: Record<string, any>;
  position: number;
}

interface Props {
  row: QueueRow;
  onAction: (action: string, row: QueueRow) => void;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export function QueueCard({ row, onAction }: Props) {
  const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown Customer';
  const inProgress = !!row.production_started_at && row.status !== 'completed' && row.status !== 'delivered';
  const paused = !!row.paused_at;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        'relative rounded-2xl border border-border/60 bg-card/50 backdrop-blur-md',
        'shadow-[0_0_0_1px_rgba(0,255,136,0.04),0_8px_24px_-12px_rgba(0,0,0,0.6)]',
        'hover:border-emerald-500/30 hover:shadow-[0_0_0_1px_rgba(0,255,136,0.12),0_12px_32px_-12px_rgba(0,0,0,0.7)]',
        'transition-all duration-200 overflow-hidden',
      )}
    >
      {/* Priority strip */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-500/60 via-emerald-500/30 to-transparent" />

      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground">#{String(row.position).padStart(3, '0')}</span>
              <h3 className="text-base font-semibold text-foreground truncate">{fullName}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
              {row.email && (
                <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                  <Mail className="h-3 w-3" /> {row.email}
                </span>
              )}
              {row.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {row.phone}
                </span>
              )}
            </div>
          </div>
          <CountdownTimer
            deadlineAt={row.deadline_at}
            pausedAt={row.paused_at}
            totalPausedSeconds={row.total_paused_seconds}
          />
        </div>

        {/* Listing */}
        {row.listing_address && (
          <div className="flex items-start gap-2 text-sm text-foreground/90">
            <MapPin className="h-3.5 w-3.5 mt-0.5 text-emerald-400 shrink-0" />
            <span className="truncate">{row.listing_address}</span>
          </div>
        )}

        {/* Audit row */}
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={row.status} />
          {row.signed_at && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
              <ShieldCheck className="h-3 w-3" />
              Signed {fmtDate(row.signed_at)}
            </span>
          )}
          {row.payment_approved_at && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
              <Receipt className="h-3 w-3" />
              Paid
            </span>
          )}
          {row.assigned_to && (
            <span className="inline-flex items-center gap-1 text-[11px] text-foreground bg-muted/50 border border-border rounded-full px-2 py-0.5">
              <User className="h-3 w-3" />
              Assigned
            </span>
          )}
        </div>

        {/* Notes preview */}
        {row.notes && (
          <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/20 rounded-md px-2 py-1.5 border border-border/40">
            {row.notes}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {!inProgress && row.status !== 'completed' && (
            <Button
              size="sm"
              className="h-7 text-xs bg-emerald-500 hover:bg-emerald-600 text-black"
              onClick={() => onAction('start', row)}
            >
              <PlayCircle className="h-3.5 w-3.5" />
              Start Production
            </Button>
          )}
          {inProgress && !paused && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAction('pause', row)}>
              <PauseCircle className="h-3.5 w-3.5" />
              Pause
            </Button>
          )}
          {inProgress && paused && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAction('resume', row)}>
              <PlayCircle className="h-3.5 w-3.5" />
              Resume
            </Button>
          )}
          {row.status !== 'completed' && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAction('complete', row)}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Complete
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAction('upload', row)}>
            <Upload className="h-3.5 w-3.5" />
            Files
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAction('send_update', row)}>
            <Send className="h-3.5 w-3.5" />
            Update
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAction('assign', row)}>
            <UserPlus className="h-3.5 w-3.5" />
            Assign
          </Button>
          {row.customer_id && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAction('open_customer', row)}>
              <User className="h-3.5 w-3.5" />
              Customer
            </Button>
          )}
          {row.proposal_id && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAction('view_agreement', row)}>
              <FileSignature className="h-3.5 w-3.5" />
              Agreement
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAction('notes', row)}>
            <MoreHorizontal className="h-3.5 w-3.5" />
            Notes
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
