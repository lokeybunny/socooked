import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Stethoscope, Copy, ChevronDown, ChevronRight } from "lucide-react";

type ResultType =
  | "NETWORK_TIMEOUT"
  | "NETWORK_REACHABLE_AUTH_FAILED"
  | "AUTH_SUCCESS_CAMPAIGNS_FOUND"
  | "AUTH_SUCCESS_NO_CAMPAIGNS"
  | "AUTH_SUCCESS_PARSE_UNKNOWN"
  | "REACHABLE_PARSE_NEEDS_MAPPING"
  | "API_ERROR"
  | "OPTIONAL_PROXY_NOT_CONFIGURED"
  | "SERVER_ERROR"
  | "UNKNOWN";

export type DiagnosticReport = {
  ok: boolean;
  summary?: {
    final_diagnosis: string;
    network_reachable: boolean | null;
    auth_valid: boolean | null;
    campaigns_found: boolean | null;
    best_endpoint: string | null;
    recommended_next_step: string;
  };
  credentials?: {
    username_present: boolean;
    api_key_present: boolean;
    api_key_preview: string;
    username_source: string;
    proxy_configured: boolean;
    proxy_misconfigured: boolean;
  };
  tests?: Array<{
    name: string;
    endpoint: string;
    http_status: number;
    duration_ms: number;
    result_type: ResultType;
    diagnosis: string;
    error: string | null;
    raw_text_preview: string;
    raw_json: any;
  }>;
  timestamp?: string;
  error?: string;
};

const TYPE_BADGE: Record<ResultType, { label: string; cls: string }> = {
  AUTH_SUCCESS_CAMPAIGNS_FOUND: { label: "Success", cls: "bg-green-500/15 text-green-400 border-green-500/40" },
  AUTH_SUCCESS_NO_CAMPAIGNS: { label: "Connected · No campaigns", cls: "bg-blue-500/15 text-blue-400 border-blue-500/40" },
  AUTH_SUCCESS_PARSE_UNKNOWN: { label: "Connected / Parser Needs Mapping", cls: "bg-blue-500/15 text-blue-400 border-blue-500/40" },
  REACHABLE_PARSE_NEEDS_MAPPING: { label: "Connected / Parser Needs Mapping", cls: "bg-blue-500/15 text-blue-400 border-blue-500/40" },
  NETWORK_REACHABLE_AUTH_FAILED: { label: "Auth failed", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40" },
  NETWORK_TIMEOUT: { label: "Network Timeout", cls: "bg-red-500/15 text-red-400 border-red-500/40" },
  API_ERROR: { label: "API Error", cls: "bg-red-500/15 text-red-400 border-red-500/40" },
  OPTIONAL_PROXY_NOT_CONFIGURED: { label: "Optional Proxy Not Configured", cls: "bg-muted text-muted-foreground border-border" },
  SERVER_ERROR: { label: "Server error", cls: "bg-red-500/15 text-red-400 border-red-500/40" },
  UNKNOWN: { label: "Unknown", cls: "bg-muted text-muted-foreground border-border" },
};

export type DiagnosticHealth =
  | { state: "Healthy" | "Auth Error" | "Network Blocked" | "No Campaigns" | "Down" | "Unknown"; message?: string };

export function reportToHealth(r: DiagnosticReport | null): DiagnosticHealth {
  if (!r || !r.ok || !r.summary) return { state: "Unknown" };
  const s = r.summary;
  // PostLead HTTPS reachability is the authoritative health signal.
  const postLead = r.tests?.find((t) => /PostLead HTTPS/i.test(t.name));
  const postLeadReachable = !!postLead && postLead.http_status >= 200 && postLead.http_status < 500;
  if (postLeadReachable) return { state: "Healthy", message: s.final_diagnosis };
  if (s.campaigns_found) return { state: "Healthy", message: s.final_diagnosis };
  if (s.auth_valid === true && s.campaigns_found === false) return { state: "No Campaigns", message: s.final_diagnosis };
  if (s.auth_valid === false) return { state: "Auth Error", message: s.final_diagnosis };
  if (s.network_reachable === false) return { state: "Network Blocked", message: s.final_diagnosis };
  if (r.tests?.some((t) => t.result_type === "SERVER_ERROR")) return { state: "Down", message: s.final_diagnosis };
  return { state: "Unknown", message: s.final_diagnosis };
}

interface Props {
  onReport?: (r: DiagnosticReport) => void;
}

export default function LeadsRainDiagnostic({ onReport }: Props) {
  const [running, setRunning] = useState(false);
  const [useSecrets, setUseSecrets] = useState(true);
  const [username, setUsername] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [mode, setMode] = useState<"all" | "s2" | "s1" | "s3" | "proxy" | "postlead">("postlead");
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const body: any = { mode };
      if (campaignId.trim()) body.campaign_id = campaignId.trim();
      if (!useSecrets) {
        if (!username.trim() || !apiKey.trim()) {
          toast.error("Enter username and API key, or toggle 'Use saved secrets'");
          setRunning(false);
          return;
        }
        body.username = username.trim();
        body.api_key = apiKey.trim();
      }
      const { data, error } = await supabase.functions.invoke("leadsrain-diagnostic", { body });
      if (error) throw error;
      const r = data as DiagnosticReport;
      setReport(r);
      onReport?.(r);
      if (r.ok) toast.success(r.summary?.final_diagnosis || "Diagnostic complete");
      else toast.error(r.error || "Diagnostic failed");
    } catch (e: any) {
      toast.error(e?.message || "Diagnostic failed");
    } finally {
      setRunning(false);
    }
  };

  const copyReport = async () => {
    if (!report) return;
    const safe = {
      timestamp: report.timestamp,
      summary: report.summary,
      credentials: report.credentials, // already masked
      tests: report.tests?.map((t) => ({
        name: t.name,
        endpoint: t.endpoint,
        http_status: t.http_status,
        duration_ms: t.duration_ms,
        result_type: t.result_type,
        diagnosis: t.diagnosis,
        error: t.error,
        raw_text_preview: t.raw_text_preview?.slice(0, 800),
      })),
    };
    await navigator.clipboard.writeText(JSON.stringify(safe, null, 2));
    toast.success("Report copied");
  };

  return (
    <Card className="border-lime-500/30 bg-card/60 backdrop-blur">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-lime-400" /> LeadsRain Connection Diagnostic
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Live HTTPS PostLead is the production endpoint. Legacy Campaign View and Proxy tests are optional.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={run} disabled={running} className="bg-lime-500 hover:bg-lime-400 text-black font-semibold">
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Stethoscope className="w-4 h-4 mr-2" />}
              Run Definitive Diagnostic
            </Button>
            {report && (
              <Button variant="outline" onClick={copyReport}>
                <Copy className="w-4 h-4 mr-2" /> Copy Report
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2 flex items-center gap-3 rounded-md border border-border/60 px-3 py-2">
            <Switch checked={useSecrets} onCheckedChange={setUseSecrets} id="use-secrets" />
            <Label htmlFor="use-secrets" className="text-xs cursor-pointer">
              Use saved server secrets (LEADSRAIN_USERNAME / LEADSRAIN_API_KEY)
            </Label>
          </div>
          <div>
            <Label className="text-xs">Endpoint</Label>
            <Select value={mode} onValueChange={(v: any) => setMode(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="postlead">Live PostLead HTTPS (production)</SelectItem>
                <SelectItem value="all">Run All (incl. legacy)</SelectItem>
                <SelectItem value="s2">Legacy: Direct HTTP s2</SelectItem>
                <SelectItem value="s1">Legacy: Direct HTTP s1</SelectItem>
                <SelectItem value="s3">Legacy: Direct HTTP s3</SelectItem>
                <SelectItem value="proxy">Optional: Proxy URL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Optional Campaign ID</Label>
            <Input value={campaignId} onChange={(e) => setCampaignId(e.target.value)} placeholder="e.g. 6913353" />
          </div>
          <div className="grid grid-cols-2 gap-2 md:col-span-1">
            <div>
              <Label className="text-xs">Username (override)</Label>
              <Input disabled={useSecrets} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="…" />
            </div>
            <div>
              <Label className="text-xs">API Key (override)</Label>
              <Input disabled={useSecrets} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="…" />
            </div>
          </div>
        </div>

        {report?.summary && (
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={
                report.summary.campaigns_found
                  ? "bg-green-500/15 text-green-400 border-green-500/40"
                  : report.summary.auth_valid === false
                    ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/40"
                    : report.summary.network_reachable === false
                      ? "bg-red-500/15 text-red-400 border-red-500/40"
                      : "bg-blue-500/15 text-blue-400 border-blue-500/40"
              }>
                {report.summary.final_diagnosis}
              </Badge>
              {report.credentials && (
                <span className="text-xs text-muted-foreground">
                  creds: {report.credentials.username_source} · key {report.credentials.api_key_preview}
                  {advancedOpen && (
                    <> · proxy {report.credentials.proxy_configured ? "OK" : (report.credentials.proxy_misconfigured ? "misconfigured" : "not set (optional)")}</>
                  )}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">Next: {report.summary.recommended_next_step}</div>
            {report.summary.best_endpoint && (
              <div className="text-xs font-mono">Best endpoint: {report.summary.best_endpoint}</div>
            )}
          </div>
        )}

        {report?.tests && report.tests.length > 0 && (() => {
          const isLegacy = (t: any) => /s1|s2|s3|proxy|campaign view/i.test(`${t.name} ${t.endpoint}`);
          const visibleTests = advancedOpen ? report.tests : report.tests.filter((t) => !isLegacy(t));
          const hiddenCount = report.tests.length - visibleTests.length;
          return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {advancedOpen ? "Showing all tests including legacy/optional." : "Showing production tests only."}
                {hiddenCount > 0 && !advancedOpen && ` ${hiddenCount} legacy/optional test(s) hidden.`}
              </div>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setAdvancedOpen((v) => !v)}>
                {advancedOpen ? "Hide" : "Show"} Advanced Diagnostics (Optional)
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border border-border/40">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Test</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.tests.map((t, i) => {
                  const badge = TYPE_BADGE[t.result_type] || TYPE_BADGE.UNKNOWN;
                  const open = !!expanded[i];
                  return (
                    <>
                      <TableRow key={i} className="cursor-pointer hover:bg-accent/30" onClick={() => setExpanded((e) => ({ ...e, [i]: !e[i] }))}>
                        <TableCell>
                          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{t.name}</TableCell>
                        <TableCell className="text-xs font-mono max-w-[260px] truncate">{t.endpoint}</TableCell>
                        <TableCell className="text-xs">{t.http_status || "—"}</TableCell>
                        <TableCell className="text-xs">{t.duration_ms}ms</TableCell>
                        <TableCell><Badge variant="outline" className={badge.cls}>{badge.label}</Badge></TableCell>
                        <TableCell className="text-xs text-red-400 max-w-[260px] truncate">{t.error || "—"}</TableCell>
                      </TableRow>
                      {open && (
                        <TableRow key={`${i}-detail`}>
                          <TableCell colSpan={7} className="bg-muted/30">
                            <div className="text-xs space-y-2 p-2">
                              <div><strong>Diagnosis:</strong> {t.diagnosis}</div>
                              {t.raw_text_preview && (
                                <details>
                                  <summary className="cursor-pointer text-muted-foreground">Raw response preview</summary>
                                  <pre className="mt-2 p-2 bg-background rounded border border-border/40 overflow-x-auto max-h-64 text-[10px]">{t.raw_text_preview}</pre>
                                </details>
                              )}
                              {t.raw_json && (
                                <details>
                                  <summary className="cursor-pointer text-muted-foreground">Parsed JSON</summary>
                                  <pre className="mt-2 p-2 bg-background rounded border border-border/40 overflow-x-auto max-h-64 text-[10px]">{JSON.stringify(t.raw_json, null, 2)}</pre>
                                </details>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
