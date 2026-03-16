import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, ChevronDown, TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MonthRow {
  month: string; // 'YYYY-MM'
  label: string; // 'Jan 2026'
  invoiceRevenue: number;
  recurringRevenue: number;
  totalRevenue: number;
  paidInvoices: number;
  unpaidInvoices: number;
  newCustomers: number;
  monthlyClients: number;
}

interface InvoiceRecord {
  id: string;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  due_date: string | null;
  customer_id: string;
  invoice_number: string | null;
  line_items: any;
  customer?: { full_name: string; email: string | null; company: string | null; status: string };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMonthLabel(ym: string) {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

export default function FinancialReports() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<string>(String(new Date().getFullYear()));
  const [exportType, setExportType] = useState<string>('income');

  useEffect(() => {
    async function load() {
      const [invRes, custRes] = await Promise.all([
        supabase.from('invoices').select('id, amount, status, paid_at, created_at, due_date, customer_id, invoice_number, line_items'),
        supabase.from('customers').select('id, full_name, email, company, status, created_at'),
      ]);
      setInvoices(invRes.data || []);
      setCustomers(custRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    const currentYear = new Date().getFullYear();
    years.add(String(currentYear));
    invoices.forEach(inv => {
      const y = (inv.paid_at || inv.created_at).slice(0, 4);
      years.add(y);
    });
    customers.forEach(c => {
      years.add(c.created_at.slice(0, 4));
    });
    return Array.from(years).sort().reverse();
  }, [invoices, customers]);

  const monthlyData = useMemo(() => {
    const rows: MonthRow[] = [];
    for (let m = 1; m <= 12; m++) {
      const ym = `${yearFilter}-${String(m).padStart(2, '0')}`;

      // Invoice revenue for this month (paid invoices by paid_at date)
      const monthInvoices = invoices.filter(inv => {
        const date = inv.paid_at || inv.created_at;
        return date.startsWith(ym);
      });
      const paidInvoices = monthInvoices.filter(i => i.status === 'paid');
      const unpaidInvoices = monthInvoices.filter(i => i.status !== 'paid');
      const invoiceRevenue = paidInvoices.reduce((s, i) => s + Number(i.amount), 0);

      // Monthly recurring clients active during this month
      const monthlyClients = customers.filter(c => {
        if (c.status !== 'monthly') return false;
        return c.created_at.slice(0, 7) <= ym;
      }).length;
      const recurringRevenue = monthlyClients * 250;

      // New customers this month
      const newCust = customers.filter(c => c.created_at.startsWith(ym) && c.status !== 'lead').length;

      rows.push({
        month: ym,
        label: getMonthLabel(ym),
        invoiceRevenue,
        recurringRevenue,
        totalRevenue: invoiceRevenue + recurringRevenue,
        paidInvoices: paidInvoices.length,
        unpaidInvoices: unpaidInvoices.length,
        newCustomers: newCust,
        monthlyClients,
      });
    }
    return rows;
  }, [invoices, customers, yearFilter]);

  const ytdTotals = useMemo(() => {
    return monthlyData.reduce(
      (acc, r) => ({
        invoiceRevenue: acc.invoiceRevenue + r.invoiceRevenue,
        recurringRevenue: acc.recurringRevenue + r.recurringRevenue,
        totalRevenue: acc.totalRevenue + r.totalRevenue,
        paidInvoices: acc.paidInvoices + r.paidInvoices,
        unpaidInvoices: acc.unpaidInvoices + r.unpaidInvoices,
        newCustomers: acc.newCustomers + r.newCustomers,
      }),
      { invoiceRevenue: 0, recurringRevenue: 0, totalRevenue: 0, paidInvoices: 0, unpaidInvoices: 0, newCustomers: 0 }
    );
  }, [monthlyData]);

  function getTrend(idx: number) {
    if (idx === 0) return 'neutral';
    const prev = monthlyData[idx - 1].totalRevenue;
    const curr = monthlyData[idx].totalRevenue;
    if (curr > prev) return 'up';
    if (curr < prev) return 'down';
    return 'neutral';
  }

  // ── Excel Export ──
  function exportExcel() {
    const wb = XLSX.utils.book_new();

    if (exportType === 'income' || exportType === 'full') {
      // Income Statement / P&L
      const incomeData = [
        ['STU25 — Income Report', '', '', '', '', ''],
        [`Fiscal Year: ${yearFilter}`, '', '', '', '', ''],
        ['Generated:', new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }), '', '', '', ''],
        [],
        ['Month', 'Invoice Revenue', 'Recurring Revenue ($250/client)', 'Total Revenue', 'Paid Invoices', 'Unpaid Invoices', 'New Customers', 'Monthly Clients'],
        ...monthlyData.map(r => [
          r.label, r.invoiceRevenue, r.recurringRevenue, r.totalRevenue,
          r.paidInvoices, r.unpaidInvoices, r.newCustomers, r.monthlyClients,
        ]),
        [],
        ['YTD TOTALS', ytdTotals.invoiceRevenue, ytdTotals.recurringRevenue, ytdTotals.totalRevenue, ytdTotals.paidInvoices, ytdTotals.unpaidInvoices, ytdTotals.newCustomers, ''],
      ];
      const ws = XLSX.utils.aoa_to_sheet(incomeData);
      // Column widths
      ws['!cols'] = [
        { wch: 14 }, { wch: 18 }, { wch: 30 }, { wch: 16 },
        { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Income Statement');
    }

    if (exportType === 'invoices' || exportType === 'full') {
      // Detailed Invoice Log
      const custMap = new Map(customers.map((c: any) => [c.id, c]));
      const filteredInv = invoices.filter(inv => (inv.paid_at || inv.created_at).startsWith(yearFilter));
      const invData = [
        ['STU25 — Invoice Detail Log', '', '', '', '', ''],
        [`Fiscal Year: ${yearFilter}`, '', '', '', '', ''],
        [],
        ['Invoice #', 'Date', 'Customer', 'Company', 'Amount', 'Status', 'Paid Date'],
        ...filteredInv
          .sort((a, b) => (a.paid_at || a.created_at).localeCompare(b.paid_at || b.created_at))
          .map(inv => {
            const c = custMap.get(inv.customer_id);
            return [
              inv.invoice_number || inv.id.slice(0, 8),
              new Date(inv.created_at).toLocaleDateString('en-US'),
              c?.full_name || '—',
              c?.company || '—',
              Number(inv.amount),
              inv.status,
              inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('en-US') : '—',
            ];
          }),
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(invData);
      ws2['!cols'] = [
        { wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 20 },
        { wch: 12 }, { wch: 10 }, { wch: 14 },
      ];
      XLSX.utils.book_append_sheet(wb, ws2, 'Invoice Detail');
    }

    if (exportType === 'recurring' || exportType === 'full') {
      // Recurring Revenue Schedule
      const monthlyClients = customers.filter((c: any) => c.status === 'monthly');
      const recData = [
        ['STU25 — Recurring Revenue Schedule', '', '', ''],
        [`Fiscal Year: ${yearFilter}`, '', '', ''],
        [],
        ['Client', 'Email', 'Company', 'Start Date', 'Monthly Rate', 'Annual Value'],
        ...monthlyClients.map((c: any) => [
          c.full_name,
          c.email || '—',
          c.company || '—',
          new Date(c.created_at).toLocaleDateString('en-US'),
          250,
          3000,
        ]),
        [],
        ['TOTALS', '', '', '', monthlyClients.length * 250, monthlyClients.length * 3000],
      ];
      const ws3 = XLSX.utils.aoa_to_sheet(recData);
      ws3['!cols'] = [
        { wch: 24 }, { wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      ];
      XLSX.utils.book_append_sheet(wb, ws3, 'Recurring Revenue');
    }

    if (exportType === 'customers' || exportType === 'full') {
      // Customer Roster
      const custData = [
        ['STU25 — Customer Roster', '', '', '', ''],
        [`As of: ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })}`, '', '', '', ''],
        [],
        ['Name', 'Email', 'Company', 'Status', 'Date Added'],
        ...customers
          .filter((c: any) => c.status !== 'lead')
          .sort((a: any, b: any) => a.created_at.localeCompare(b.created_at))
          .map((c: any) => [
            c.full_name,
            c.email || '—',
            c.company || '—',
            c.status,
            new Date(c.created_at).toLocaleDateString('en-US'),
          ]),
      ];
      const ws4 = XLSX.utils.aoa_to_sheet(custData);
      ws4['!cols'] = [
        { wch: 24 }, { wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
      ];
      XLSX.utils.book_append_sheet(wb, ws4, 'Customer Roster');
    }

    const filename = `STU25_Financial_Report_${yearFilter}_${exportType}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;

  return (
    <div className="glass-card p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-semibold text-foreground">Financial Reports</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <Calendar className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(y => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={exportType} onValueChange={setExportType}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">Full Report (All)</SelectItem>
              <SelectItem value="income">Income Statement</SelectItem>
              <SelectItem value="invoices">Invoice Detail</SelectItem>
              <SelectItem value="recurring">Recurring Revenue</SelectItem>
              <SelectItem value="customers">Customer Roster</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={exportExcel}>
            <Download className="h-3.5 w-3.5" />
            Export .xlsx
          </Button>
        </div>
      </div>

      {/* YTD Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">YTD Invoice Revenue</p>
          <p className="text-lg font-bold text-foreground mt-1">{loading ? '—' : fmt(ytdTotals.invoiceRevenue)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">YTD Recurring Revenue</p>
          <p className="text-lg font-bold text-foreground mt-1">{loading ? '—' : fmt(ytdTotals.recurringRevenue)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">YTD Total Revenue</p>
          <p className="text-lg font-bold text-emerald-500 mt-1">{loading ? '—' : fmt(ytdTotals.totalRevenue)}</p>
        </div>
      </div>

      {/* Month-to-Month Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-2 text-muted-foreground font-medium">Month</th>
              <th className="text-right py-2 px-2 text-muted-foreground font-medium">Invoice Rev</th>
              <th className="text-right py-2 px-2 text-muted-foreground font-medium">Recurring Rev</th>
              <th className="text-right py-2 px-2 text-muted-foreground font-medium font-semibold">Total</th>
              <th className="text-right py-2 px-2 text-muted-foreground font-medium">Paid</th>
              <th className="text-right py-2 px-2 text-muted-foreground font-medium">Unpaid</th>
              <th className="text-right py-2 px-2 text-muted-foreground font-medium">New Cust</th>
              <th className="text-right py-2 px-2 text-muted-foreground font-medium">Monthly Clients</th>
              <th className="text-center py-2 px-2 text-muted-foreground font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.map((row, idx) => {
              const trend = getTrend(idx);
              const hasData = row.totalRevenue > 0 || row.paidInvoices > 0 || row.newCustomers > 0;
              return (
                <tr
                  key={row.month}
                  className={`border-b border-border/50 ${hasData ? '' : 'opacity-40'} hover:bg-muted/50 transition-colors`}
                >
                  <td className="py-2 px-2 font-medium text-foreground">{row.label}</td>
                  <td className="py-2 px-2 text-right text-foreground">{fmt(row.invoiceRevenue)}</td>
                  <td className="py-2 px-2 text-right text-foreground">{fmt(row.recurringRevenue)}</td>
                  <td className="py-2 px-2 text-right font-semibold text-foreground">{fmt(row.totalRevenue)}</td>
                  <td className="py-2 px-2 text-right text-emerald-500">{row.paidInvoices}</td>
                  <td className="py-2 px-2 text-right text-amber-500">{row.unpaidInvoices}</td>
                  <td className="py-2 px-2 text-right text-foreground">{row.newCustomers}</td>
                  <td className="py-2 px-2 text-right text-foreground">{row.monthlyClients}</td>
                  <td className="py-2 px-2 text-center">
                    {trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-emerald-500 inline" />}
                    {trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-destructive inline" />}
                    {trend === 'neutral' && <Minus className="h-3.5 w-3.5 text-muted-foreground inline" />}
                  </td>
                </tr>
              );
            })}
            {/* YTD Totals Row */}
            <tr className="border-t-2 border-foreground/20 font-semibold bg-muted/30">
              <td className="py-2.5 px-2 text-foreground">YTD Total</td>
              <td className="py-2.5 px-2 text-right text-foreground">{fmt(ytdTotals.invoiceRevenue)}</td>
              <td className="py-2.5 px-2 text-right text-foreground">{fmt(ytdTotals.recurringRevenue)}</td>
              <td className="py-2.5 px-2 text-right text-emerald-500">{fmt(ytdTotals.totalRevenue)}</td>
              <td className="py-2.5 px-2 text-right text-emerald-500">{ytdTotals.paidInvoices}</td>
              <td className="py-2.5 px-2 text-right text-amber-500">{ytdTotals.unpaidInvoices}</td>
              <td className="py-2.5 px-2 text-right text-foreground">{ytdTotals.newCustomers}</td>
              <td className="py-2.5 px-2 text-right text-foreground">—</td>
              <td className="py-2.5 px-2"></td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-muted-foreground/60 text-right">
        Recurring revenue calculated at $250/month per active monthly client • Export as .xlsx for accountant handover
      </p>
    </div>
  );
}
