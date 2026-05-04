import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, PlayCircle, Phone, Building2, RefreshCw, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Stats = {
  agents: number;
  agents_with_profile: number;
  agents_enriched: number;
  contacts: number;
  validated_mobiles: number;
  jobs_today: number;
  last_job_status: string | null;
  last_job_at: string | null;
  last_job_location: string | null;
};

export default function AgentFlowApifyPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [detailing, setDetailing] = useState(false);
  const [location, setLocation] = useState("Portland, OR");

  async function loadStats() {
    setLoading(true);
    try {
      const [agents, agentsWithProfile, agentsEnriched, contacts, validated, jobsToday, lastJob] = await Promise.all([
        supabase.from("af_agents").select("*", { count: "exact", head: true }),
        supabase.from("af_agents").select("*", { count: "exact", head: true }).not("agent_profile_url", "is", null),
        supabase.from("af_agents").select("*", { count: "exact", head: true }).not("last_profile_scraped_at", "is", null),
        supabase.from("af_agent_contacts").select("*", { count: "exact", head: true }),
        supabase.from("af_agent_contacts").select("*", { count: "exact", head: true }).eq("is_valid", true).eq("phone_type", "mobile"),
        supabase.from("af_scrape_jobs").select("*", { count: "exact", head: true }).gte("started_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
        supabase.from("af_scrape_jobs").select("status, started_at, target_location").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setStats({
        agents: agents.count || 0,
        agents_with_profile: agentsWithProfile.count || 0,
        agents_enriched: agentsEnriched.count || 0,
        contacts: contacts.count || 0,
        validated_mobiles: validated.count || 0,
        jobs_today: jobsToday.count || 0,
        last_job_status: lastJob.data?.status || null,
        last_job_at: lastJob.data?.started_at || null,
        last_job_location: lastJob.data?.target_location || null,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStats(); }, []);

  async function triggerScrape() {
    if (!location.trim()) { toast.error("Enter a location first"); return; }
    setScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke("agentflow-scrape-zillow", {
        body: { location: location.trim(), max_items: 250 },
      });
      if (error) throw error;
      if (data?.code === "APIFY_MONTHLY_LIMIT") {
        toast.error(data.error || "Apify monthly usage hard limit exceeded. Raise the limit in Apify, then retry.");
        await loadStats();
        return;
      }
      if (data?.ok === false) throw new Error(data.error || "scrape failed");
      toast.success(`Scrape done: ${data?.itemsReturned || 0} items, ${data?.newAgents || 0} new agents`);
      await loadStats();
    } catch (e: any) {
      toast.error(`Scrape failed: ${e?.message || e}`);
    } finally {
      setScraping(false);
    }
  }

  async function triggerDetailScrape() {
    setDetailing(true);
    try {
      const { data, error } = await supabase.functions.invoke("agentflow-scrape-listing-details", {
        body: { limit: 25 },
      });
      if (error) throw error;
      if (data?.code === "APIFY_MONTHLY_LIMIT") {
        toast.error(data.error || "Apify monthly usage hard limit exceeded.");
        await loadStats();
        return;
      }
      if (data?.ok === false) throw new Error(data.error || "detail scrape failed");
      toast.success(
        `Detail done: ${data?.listingsProcessed || 0} listings, +${data?.agentsCreated || 0} agents, ${data?.cellsFound || 0} mobiles`,
      );
      await loadStats();
    } catch (e: any) {
      toast.error(`Detail scrape failed: ${e?.message || e}`);
    } finally {
      setDetailing(false);
    }
  }

  async function triggerEnrich() {
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke("agentflow-enrich-phones", {
        body: { limit: 30 },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || "enrich failed");
      toast.success(`Enrich done: ${data?.cellsFound || 0} mobiles, ${data?.businessFound || 0} business lines`);
      await loadStats();
    } catch (e: any) {
      toast.error(`Enrich failed: ${e?.message || e}`);
    } finally {
      setEnriching(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            AgentFlow — Apify Pipeline
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Zillow listing scraper + agent profile enrichment via Apify</p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadStats} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Total Agents" value={stats?.agents ?? "—"} />
          <Stat label="With Profile URL" value={stats?.agents_with_profile ?? "—"} />
          <Stat label="Enriched" value={stats?.agents_enriched ?? "—"} />
          <Stat label="Contacts" value={stats?.contacts ?? "—"} />
          <Stat label="Valid Mobiles" value={stats?.validated_mobiles ?? "—"} highlight />
          <Stat label="Jobs (24h)" value={stats?.jobs_today ?? "—"} />
        </div>

        {stats?.last_job_at && (
          <div className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
            Last job: <Badge variant="outline" className="ml-1 mr-2">{stats.last_job_status}</Badge>
            <span className="mr-2">{stats.last_job_location}</span>
            <span>{new Date(stats.last_job_at).toLocaleString()}</span>
          </div>
        )}

        <div className="border-t pt-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder='e.g. "Portland, OR"'
              className="flex-1 px-3 py-2 text-sm rounded-md border bg-background"
            />
            <Button onClick={triggerScrape} disabled={scraping}>
              {scraping ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
              Scrape Listings
            </Button>
            <Button onClick={triggerDetailScrape} disabled={detailing} variant="secondary">
              {detailing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
              Scrape Listing Details
            </Button>
            <Button onClick={triggerEnrich} disabled={enriching} variant="secondary">
              {enriching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Phone className="w-4 h-4 mr-2" />}
              Enrich Profiles
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>1.</strong> Scrape Listings (<code>zillow-scraper</code>, ~$0.001 ea) →{" "}
            <strong>2.</strong> Scrape Listing Details (<code>zillow-detail-scraper</code>, ~$0.005 ea) — pulls real agent name + profile URL + phone numbers from each listing →{" "}
            <strong>3.</strong> Enrich Profiles — re-scrapes agent profile pages for any missing phones. Run step 2 to backfill the existing 2,215 listings.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${highlight ? "bg-primary/5 border-primary/30" : "bg-muted/30"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
