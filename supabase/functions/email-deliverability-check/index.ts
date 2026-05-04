// Email Deliverability Check - Live DNS lookups for SPF, DKIM, DMARC, MX
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Google Workspace default DKIM selector
const DEFAULT_DKIM_SELECTORS = ["google", "default", "selector1", "selector2", "k1", "s1", "s2"];

async function dohQuery(name: string, type: string): Promise<string[]> {
  // Use Cloudflare DNS-over-HTTPS
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, { headers: { Accept: "application/dns-json" } });
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.Answer) return [];
  return data.Answer
    .filter((a: any) => a.type === typeNumber(type))
    .map((a: any) => {
      let val = a.data as string;
      // TXT records come quoted; strip surrounding quotes and join chunks
      if (type === "TXT") {
        val = val.replace(/^"|"$/g, "").replace(/"\s*"/g, "");
      }
      return val;
    });
}

function typeNumber(type: string): number {
  const map: Record<string, number> = { A: 1, MX: 15, TXT: 16, CNAME: 5, NS: 2 };
  return map[type] ?? 16;
}

async function checkSPF(domain: string) {
  const txts = await dohQuery(domain, "TXT");
  const spf = txts.find((t) => t.toLowerCase().startsWith("v=spf1"));
  if (!spf) {
    return {
      status: "fail",
      record: null,
      issues: ["No SPF record found"],
      recommendation: `Add a TXT record at @ (root of ${domain}):\nv=spf1 include:_spf.google.com ~all`,
    };
  }
  const issues: string[] = [];
  const includesGoogle = /include:_spf\.google\.com/i.test(spf);
  const endsAll = /[~\-?+]all\s*$/i.test(spf.trim());
  const hasHardFail = /-all\s*$/i.test(spf.trim());
  if (!includesGoogle) issues.push("SPF does not include Google Workspace (_spf.google.com)");
  if (!endsAll) issues.push("SPF record missing terminating 'all' mechanism");
  // Count DNS lookups (max 10 per RFC 7208)
  const lookupCount = (spf.match(/\b(include|a|mx|ptr|exists|redirect):/gi) || []).length;
  if (lookupCount > 10) issues.push(`SPF has ${lookupCount} DNS lookups (RFC limit is 10)`);

  return {
    status: issues.length === 0 ? "pass" : "warn",
    record: spf,
    issues,
    recommendation: issues.length
      ? `Recommended: v=spf1 include:_spf.google.com ${hasHardFail ? "-all" : "~all"}`
      : null,
    meta: { lookupCount, includesGoogle, hardFail: hasHardFail },
  };
}

async function checkDKIM(domain: string, selectors: string[]) {
  const results: any[] = [];
  for (const sel of selectors) {
    const host = `${sel}._domainkey.${domain}`;
    const txts = await dohQuery(host, "TXT");
    const cnames = await dohQuery(host, "CNAME");
    const dkim = txts.find((t) => /v=DKIM1/i.test(t));
    if (dkim || cnames.length > 0) {
      results.push({
        selector: sel,
        host,
        record: dkim || cnames[0],
        type: dkim ? "TXT" : "CNAME",
        valid: dkim ? /p=[A-Za-z0-9+/=]{50,}/.test(dkim) : true,
      });
    }
  }
  if (results.length === 0) {
    return {
      status: "fail",
      records: [],
      issues: ["No DKIM records found for common selectors (google, default, selector1/2)"],
      recommendation:
        "In Google Workspace: Apps → Google Workspace → Gmail → Authenticate email → Generate DKIM key (2048-bit). Then add the TXT record at google._domainkey." + domain + " and click 'Start Authentication'.",
    };
  }
  const allValid = results.every((r) => r.valid);
  return {
    status: allValid ? "pass" : "warn",
    records: results,
    issues: allValid ? [] : ["DKIM record present but public key looks malformed"],
    recommendation: null,
  };
}

async function checkDMARC(domain: string) {
  const txts = await dohQuery(`_dmarc.${domain}`, "TXT");
  const dmarc = txts.find((t) => /v=DMARC1/i.test(t));
  if (!dmarc) {
    return {
      status: "fail",
      record: null,
      issues: ["No DMARC record found"],
      recommendation: `Add a TXT record at _dmarc.${domain}:\nv=DMARC1; p=none; rua=mailto:dmarc@${domain}; pct=100; aspf=r; adkim=r\n\nStart with p=none to monitor, then upgrade to p=quarantine, then p=reject.`,
    };
  }
  const issues: string[] = [];
  const policyMatch = dmarc.match(/p=(none|quarantine|reject)/i);
  const policy = policyMatch?.[1]?.toLowerCase() || "unknown";
  const ruaMatch = dmarc.match(/rua=mailto:([^;]+)/i);
  const pctMatch = dmarc.match(/pct=(\d+)/i);
  const pct = pctMatch ? parseInt(pctMatch[1]) : 100;

  if (policy === "none") issues.push("DMARC policy is 'none' (monitor only — not enforcing)");
  if (!ruaMatch) issues.push("No 'rua' aggregate report address — you won't receive DMARC reports");
  if (pct < 100) issues.push(`Only ${pct}% of mail is being evaluated (pct=${pct})`);

  return {
    status: issues.length === 0 ? "pass" : "warn",
    record: dmarc,
    issues,
    recommendation:
      policy === "none"
        ? `Once you've verified legitimate mail is passing, upgrade to:\nv=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100; aspf=r; adkim=r`
        : null,
    meta: { policy, pct, hasRua: !!ruaMatch },
  };
}

async function checkMX(domain: string) {
  const records = await dohQuery(domain, "MX");
  if (records.length === 0) {
    return {
      status: "fail",
      records: [],
      issues: ["No MX records found"],
      recommendation: `Add Google Workspace MX records at ${domain}: smtp.google.com (priority 1)`,
    };
  }
  const isGoogle = records.some((r) => /google\.com|googlemail\.com/i.test(r));
  return {
    status: "pass",
    records,
    issues: [],
    recommendation: null,
    meta: { provider: isGoogle ? "Google Workspace" : "Other" },
  };
}

async function checkMTASTS(domain: string) {
  const txts = await dohQuery(`_mta-sts.${domain}`, "TXT");
  const mtaSts = txts.find((t) => /v=STSv1/i.test(t));
  return {
    status: mtaSts ? "pass" : "info",
    record: mtaSts || null,
    issues: mtaSts ? [] : ["MTA-STS not configured (optional, improves TLS enforcement)"],
    recommendation: mtaSts
      ? null
      : `Optional: Add TXT at _mta-sts.${domain}: v=STSv1; id=$(date +%Y%m%d%H%M%S)`,
  };
}

function computeScore(checks: any): number {
  let score = 0;
  const weights = { spf: 25, dkim: 30, dmarc: 25, mx: 15, mtaSts: 5 };
  for (const [key, weight] of Object.entries(weights)) {
    const c = checks[key];
    if (c.status === "pass") score += weight;
    else if (c.status === "warn") score += weight * 0.5;
    else if (c.status === "info") score += weight * 0.7;
  }
  return Math.round(score);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let domain = url.searchParams.get("domain") || "";
    let selectors = (url.searchParams.get("selectors") || "").split(",").map((s) => s.trim()).filter(Boolean);

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      domain = body.domain || domain;
      if (Array.isArray(body.selectors)) selectors = body.selectors;
    }

    if (!domain) domain = "stu25.com";
    if (selectors.length === 0) selectors = DEFAULT_DKIM_SELECTORS;

    domain = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();

    const [spf, dkim, dmarc, mx, mtaSts] = await Promise.all([
      checkSPF(domain),
      checkDKIM(domain, selectors),
      checkDMARC(domain),
      checkMX(domain),
      checkMTASTS(domain),
    ]);

    const checks = { spf, dkim, dmarc, mx, mtaSts };
    const score = computeScore(checks);
    const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";

    return new Response(
      JSON.stringify({
        domain,
        checkedAt: new Date().toISOString(),
        score,
        grade,
        checks,
        selectorsTried: selectors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("deliverability check error", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
