import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  lead: 'status-lead',
  prospect: 'status-prospect',
  active: 'status-active',
  inactive: 'status-inactive',
  churned: 'status-churned',
  new: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  skip_traced: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  qualified: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  proposal: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  negotiation: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  won: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  lost: 'bg-red-500/15 text-red-600 dark:text-red-400',
  open: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  planned: 'bg-gray-500/15 text-gray-500',
  blocked: 'bg-red-500/15 text-red-600 dark:text-red-400',
  completed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  archived: 'bg-gray-500/15 text-gray-400',
  todo: 'bg-gray-500/15 text-gray-500',
  doing: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  done: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  draft: 'bg-gray-500/15 text-gray-500',
  scheduled: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  published: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  // Thread statuses
  collecting_info: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  ready_for_docs: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  docs_generated: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  sent_for_signature: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  signed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  invoiced: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  // Invoice statuses
  sent: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  paid: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  void: 'bg-red-500/15 text-red-600 dark:text-red-400',
  final: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  // Meeting statuses
  waiting: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  ended: 'bg-gray-500/15 text-gray-500',
  'in-progress': 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  cancelled: 'bg-red-500/15 text-red-600 dark:text-red-400',
  confirmed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  contacted: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  callback: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  in_call: 'bg-green-500/15 text-green-600 dark:text-green-400 animate-pulse',
  calling: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 animate-pulse',
};

const statusLabels: Record<string, string> = {
  skip_traced: 'Skip Traced',
  req_trace: 'Req. Trace',
  under_contract: 'Under Contract',
  offer_sent: 'Offer Sent',
  ai_complete: 'AI Complete',
  agreement_sent: 'Agreement Sent',
  collecting_info: 'Collecting Info',
  ready_for_docs: 'Ready for Docs',
  docs_generated: 'Docs Generated',
  sent_for_signature: 'Sent for Signature',
  'in-progress': 'In Progress',
  callback: 'Call Back',
  in_call: '📞 IN CALL',
  calling: '📞 Calling...',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
      statusStyles[status] || 'bg-muted text-muted-foreground',
      className
    )}>
      {statusLabels[status] || status}
    </span>
  );
}
