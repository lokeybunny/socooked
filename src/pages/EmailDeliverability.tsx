import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle, XCircle, Info, RefreshCw, Copy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import SEOHead from "@/components/SEOHead";

type CheckStatus = "pass" | "warn" | "fail" | "info";

interface CheckResult {
  status: CheckStatus;
  record?: string | null;
  records?: any[];
  issues: string[];
  recommendation?: string | null;
  meta?: Record<string, any>;
}

interface ReportData {
  domain: string;
  checkedAt: string;
  score: number;
  grade: string;
  checks: {
    spf: CheckResult;
    dkim: CheckResult & { records?: any[] };
    dmarc: CheckResult;
    mx: CheckResult & { records?: any[] };
    mtaSts: CheckResult;
  };
  selectorsTried: string[];
}

const STATUS_CONFIG: Record<CheckStatus, { icon: any; color: string; label: string }> = {
  pass: { icon: CheckCircle2, color: "text-emerald-500", label: "Pass" },
  warn: { icon: AlertTriangle, color: "text-amber-500", label: "Warn" },
  fail: { icon: XCircle, color: "text-red-500", label: "Fail" },
  info: { icon: Info, color: "text-blue-500", label: "Info" },
};

function StatusIcon({ status }: { status: CheckStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return <Icon className={`h-5 w-5 ${cfg.color}`} />;
}

function CopyButton({ text }: { text: string }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
      }}
    >
      <Copy className="h-3.5 w-3.5" />
    </Button>
  );
}

function CheckCard({
  title,
  subtitle,
  result,
  recordLabel = "Record",
}: {
  title: string;
  subtitle: string;
  result: CheckResult & { records?: any[] };
  recordLabel?: string;
}) {
  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <StatusIcon status={result.status} />
            {title}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <Badge
          variant="outline"
          className={
            result.status === "pass"
              ? "border-emerald-500/40 text-emerald-500"
              : result.status === "warn"
                ? "border-amber-500/40 text-amber-500"
                : result.status === "fail"
                  ? "border-red-500/40 text-red-500"
                  : "border-blue-500/40 text-blue-500"
          }
        >
          {STATUS_CONFIG[result.status].label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {result.record && (
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">{recordLabel}</div>
              <code className="block bg-muted/50 px-3 py-2 rounded text-xs break-all font-mono">
                {result.record}
              </code>
            </div>
            <CopyButton text={result.record} />
          </div>
        )}
        {result.records && result.records.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Records found</div>
            {result.records.map((r, i) => (
              <code
                key={i}
                className="block bg-muted/50 px-3 py-2 rounded text-xs break-all font-mono"
              >
                {typeof r === "string" ? r : `${r.selector} → ${r.record}`}
              </code>
            ))}
          </div>
        )}
        {result.issues.length > 0 && (
          <ul className="space-y-1">
            {result.issues.map((iss, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-amber-500 mt-0.5">•</span>
                <span>{iss}</span>
              </li>
            ))}
          </ul>
        )}
        {result.recommendation && (
          <div className="bg-primary/5 border border-primary/20 rounded p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="text-xs font-semibold text-primary">Recommended Fix</div>
              <CopyButton text={result.recommendation} />
            </div>
            <pre className="text-xs whitespace-pre-wrap font-mono text-foreground/80">
              {result.recommendation}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function EmailDeliverability() {
  const [domain, setDomain] = useState("stu25.com");
  const [selectors, setSelectors] = useState("google,default,selector1,selector2");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("email-deliverability-check", {
        body: {
          domain: domain.trim(),
          selectors: selectors.split(",").map((s) => s.trim()).filter(Boolean),
        },
      });
      if (error) throw error;
      setReport(data);
    } catch (e: any) {
      toast.error(e.message || "Check failed");
    } finally {
      setLoading(false);
    }
  }, [domain, selectors]);

  useEffect(() => {
    runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gradeColor =
    !report ? "text-muted-foreground"
      : report.grade === "A" ? "text-emerald-500"
      : report.grade === "B" ? "text-lime-500"
      : report.grade === "C" ? "text-amber-500"
      : report.grade === "D" ? "text-orange-500"
      : "text-red-500";

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <SEOHead
        title="Email Deliverability Check"
        description="Verify SPF, DKIM, DMARC, and MX records for your sending domain."
        canonical="/email-deliverability"
      />
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Email Deliverability</h1>
          <p className="text-muted-foreground text-sm">
            Live DNS health check for SPF, DKIM, DMARC, MX & MTA-STS
          </p>
        </div>
      </div>

      <Card className="mb-6 bg-card/50 border-border/50">
        <CardContent className="pt-6">
          <div className="grid md:grid-cols-[1fr_2fr_auto] gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Domain</label>
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="stu25.com" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                DKIM selectors (comma-separated)
              </label>
              <Input
                value={selectors}
                onChange={(e) => setSelectors(e.target.value)}
                placeholder="google,default,selector1,selector2"
              />
            </div>
            <Button onClick={runCheck} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Checking…" : "Run Check"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && !report && (
        <div className="grid md:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      )}

      {report && (
        <>
          <Card className="mb-6 bg-gradient-to-br from-card to-card/50 border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Deliverability Score for</div>
                  <div className="text-2xl font-bold">{report.domain}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Checked {new Date(report.checkedAt).toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-7xl font-bold ${gradeColor}`}>{report.grade}</div>
                  <div className="text-sm text-muted-foreground">{report.score} / 100</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <CheckCard
              title="SPF"
              subtitle="Sender Policy Framework — authorizes which servers can send on your behalf"
              result={report.checks.spf}
            />
            <CheckCard
              title="DKIM"
              subtitle="DomainKeys — cryptographic signature proving the email wasn't tampered with"
              result={report.checks.dkim}
              recordLabel="DKIM Records"
            />
            <CheckCard
              title="DMARC"
              subtitle="Policy that tells receivers what to do with unauthenticated mail"
              result={report.checks.dmarc}
            />
            <CheckCard
              title="MX"
              subtitle="Mail exchange records — where inbound mail is routed"
              result={report.checks.mx}
              recordLabel="MX Records"
            />
            <CheckCard
              title="MTA-STS"
              subtitle="Optional — enforces TLS encryption between mail servers"
              result={report.checks.mtaSts}
            />
          </div>

          <Card className="mt-6 bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Quick Setup Guide (Google Workspace + stu25.com)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div>
                <strong className="text-foreground">1. SPF</strong> — At your DNS registrar, add a TXT record at
                {" @ "} (root):{" "}
                <code className="text-xs bg-muted/50 px-1.5 py-0.5 rounded">
                  v=spf1 include:_spf.google.com ~all
                </code>
              </div>
              <div>
                <strong className="text-foreground">2. DKIM</strong> — In Google Admin: Apps → Google Workspace →
                Gmail → Authenticate email. Generate a 2048-bit key, copy the TXT record into your DNS at{" "}
                <code className="text-xs bg-muted/50 px-1.5 py-0.5 rounded">google._domainkey</code>, then click
                "Start Authentication".
              </div>
              <div>
                <strong className="text-foreground">3. DMARC</strong> — Add a TXT at{" "}
                <code className="text-xs bg-muted/50 px-1.5 py-0.5 rounded">_dmarc</code>. Start with{" "}
                <code className="text-xs bg-muted/50 px-1.5 py-0.5 rounded">p=none</code> for monitoring,
                then upgrade to <code className="text-xs bg-muted/50 px-1.5 py-0.5 rounded">p=quarantine</code> after
                2-4 weeks of clean reports.
              </div>
              <div>
                <strong className="text-foreground">4. Wait for propagation</strong> — DNS changes can take up to
                48 hours. Re-run this check until all records show Pass.
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
