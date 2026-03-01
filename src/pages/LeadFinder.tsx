import { useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Search, MapPin, Users, Loader2, ExternalLink, Mail, Phone, Building2, Briefcase, Globe, Linkedin, UserPlus, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LeadResult {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  mobile_number?: string;
  personal_email?: string;
  job_title?: string;
  headline?: string;
  seniority_level?: string;
  functional_level?: string;
  linkedin?: string;
  city?: string;
  state?: string;
  country?: string;
  company_name?: string;
  company_domain?: string;
  company_website?: string;
  company_linkedin?: string;
  company_size?: string;
  industry?: string;
  company_description?: string;
  company_annual_revenue?: string;
  company_total_funding?: string;
  company_founded_year?: string;
  company_phone?: string;
  company_full_address?: string;
  keywords?: string;
  company_technologies?: string;
}

interface CreatedCustomer {
  id: string;
  full_name: string;
  email: string | null;
  company: string | null;
}

export default function LeadFinder() {
  const [activeTab, setActiveTab] = useState('google');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LeadResult[]>([]);
  const [createdCustomers, setCreatedCustomers] = useState<CreatedCustomer[]>([]);
  const [createdCount, setCreatedCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  // Google tab form
  const [jobTitle, setJobTitle] = useState('');
  const [location, setLocation] = useState('');
  const [city, setCity] = useState('');
  const [industry, setIndustry] = useState('');
  const [keywords, setKeywords] = useState('');
  const [fetchCount, setFetchCount] = useState('25');

  // Saved leads tab
  const [savedLeads, setSavedLeads] = useState<any[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const loadSavedLeads = useCallback(async () => {
    setLoadingSaved(true);
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('category', 'potential')
      .eq('source', 'lead-finder')
      .order('created_at', { ascending: false })
      .limit(200);
    setSavedLeads(data || []);
    setLoadingSaved(false);
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'leads') loadSavedLeads();
  };

  const handleSearch = async () => {
    if (!jobTitle && !location && !city && !industry && !keywords) {
      toast.error('Please fill in at least one search field');
      return;
    }

    setLoading(true);
    setHasSearched(true);
    setResults([]);
    setCreatedCustomers([]);
    setCreatedCount(0);

    try {
      const payload: Record<string, any> = {
        fetch_count: parseInt(fetchCount) || 25,
      };
      if (jobTitle) payload.contact_job_title = jobTitle.split(',').map(s => s.trim()).filter(Boolean);
      if (location) payload.contact_location = location.split(',').map(s => s.trim()).filter(Boolean);
      if (city) payload.contact_city = city.split(',').map(s => s.trim()).filter(Boolean);
      if (industry) payload.company_industry = industry.split(',').map(s => s.trim()).filter(Boolean);
      if (keywords) payload.company_keywords = keywords.split(',').map(s => s.trim()).filter(Boolean);

      const { data, error } = await supabase.functions.invoke('lead-finder', { body: payload });

      if (error) throw new Error(error.message);

      setResults(data.leads || []);
      setCreatedCustomers(data.created_customers || []);
      setCreatedCount(data.created_count || 0);

      if (data.created_count > 0) {
        toast.success(`Found ${data.total_found} leads, ${data.created_count} new customers created`);
      } else if (data.total_found > 0) {
        toast.info(`Found ${data.total_found} leads (all already exist in your CRM)`);
      } else {
        toast.info('No leads found. Try broadening your search criteria.');
      }
    } catch (err: any) {
      console.error('Lead finder error:', err);
      toast.error(err.message || 'Failed to search for leads');
    } finally {
      setLoading(false);
    }
  };

  const isCreated = (email?: string) => {
    if (!email) return false;
    return createdCustomers.some(c => c.email === email);
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lead Finder</h1>
          <p className="text-muted-foreground text-sm mt-1">Generate B2B leads with verified emails & company data. All leads auto-save to your CRM.</p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="google" className="gap-2">
              <MapPin className="h-4 w-4" /> Google
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-2">
              <Users className="h-4 w-4" /> Leads
            </TabsTrigger>
          </TabsList>

          <TabsContent value="google" className="space-y-6">
            {/* Search Form */}
            <Card className="border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Search className="h-5 w-5 text-primary" />
                  Search Criteria
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> Job Title</Label>
                    <Input
                      value={jobTitle}
                      onChange={e => setJobTitle(e.target.value)}
                      placeholder="e.g. Marketing Manager, CEO, Realtor"
                    />
                    <p className="text-[10px] text-muted-foreground">Comma-separated for multiple</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> Location (Region/Country/State)</Label>
                    <Input
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      placeholder="e.g. United States, California"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> City</Label>
                    <Input
                      value={city}
                      onChange={e => setCity(e.target.value)}
                      placeholder="e.g. Los Angeles, Miami"
                    />
                    <p className="text-[10px] text-muted-foreground">Use City OR Location, not both</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Industry</Label>
                    <Input
                      value={industry}
                      onChange={e => setIndustry(e.target.value)}
                      placeholder="e.g. Real Estate, SaaS, Marketing"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Company Keywords</Label>
                    <Input
                      value={keywords}
                      onChange={e => setKeywords(e.target.value)}
                      placeholder="e.g. AI, blockchain, fintech"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label># Leads to Fetch</Label>
                    <Input
                      type="number"
                      value={fetchCount}
                      onChange={e => setFetchCount(e.target.value)}
                      min="1"
                      max="100"
                      placeholder="25"
                    />
                    <p className="text-[10px] text-muted-foreground">Max 100 per run (free plan)</p>
                  </div>
                </div>
                <Button onClick={handleSearch} disabled={loading} className="w-full sm:w-auto">
                  {loading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Searching…</>
                  ) : (
                    <><Search className="h-4 w-4 mr-2" /> Find Leads</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Results */}
            {loading && (
              <div className="flex items-center justify-center py-16">
                <div className="text-center space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                  <p className="text-sm text-muted-foreground">Searching for leads… This may take up to 3 minutes.</p>
                </div>
              </div>
            )}

            {!loading && hasSearched && results.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No leads found. Try broadening your search criteria.</p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {results.length} leads found · <span className="text-primary font-medium">{createdCount} new</span> added to CRM
                  </p>
                </div>

                <div className="grid gap-3">
                  {results.map((lead, i) => {
                    const name = lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
                    const wasCreated = isCreated(lead.email);
                    return (
                      <div
                        key={i}
                        className={cn(
                          "glass-card p-4 rounded-xl space-y-2 transition-all",
                          wasCreated && "ring-1 ring-primary/30"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-foreground">{name || 'Unknown'}</span>
                              {wasCreated && (
                                <Badge variant="outline" className="text-primary border-primary/30 gap-1 text-[10px]">
                                  <CheckCircle2 className="h-3 w-3" /> Added
                                </Badge>
                              )}
                              {lead.seniority_level && (
                                <Badge variant="secondary" className="text-[10px]">{lead.seniority_level}</Badge>
                              )}
                            </div>
                            {lead.job_title && (
                              <p className="text-sm text-muted-foreground">{lead.job_title}</p>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {lead.linkedin && (
                              <a href={lead.linkedin} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                <Linkedin className="h-4 w-4" />
                              </a>
                            )}
                            {lead.company_website && (
                              <a href={lead.company_website} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {lead.email && (
                            <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span>
                          )}
                          {(lead.mobile_number || lead.company_phone) && (
                            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.mobile_number || lead.company_phone}</span>
                          )}
                          {lead.company_name && (
                            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{lead.company_name}</span>
                          )}
                          {(lead.city || lead.country) && (
                            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[lead.city, lead.state, lead.country].filter(Boolean).join(', ')}</span>
                          )}
                          {lead.industry && (
                            <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{lead.industry}</span>
                          )}
                        </div>

                        {lead.company_name && (
                          <div className="pt-1 border-t border-border/50 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                            {lead.company_size && <span>Size: {lead.company_size}</span>}
                            {lead.company_annual_revenue && <span>Revenue: {lead.company_annual_revenue}</span>}
                            {lead.company_founded_year && <span>Founded: {lead.company_founded_year}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="leads" className="space-y-4">
            {loadingSaved ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : savedLeads.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <UserPlus className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No leads generated yet. Use the Google tab to find your first leads.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{savedLeads.length} leads in your CRM</p>
                <div className="glass-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">Name</th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Email</th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Company</th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Location</th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden xl:table-cell">Title</th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">Added</th>
                        </tr>
                      </thead>
                      <tbody>
                        {savedLeads.map(lead => {
                          const meta = lead.meta && typeof lead.meta === 'object' ? lead.meta : {};
                          return (
                            <tr key={lead.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-foreground">{lead.full_name}</span>
                                  {(meta as any).linkedin && (
                                    <a href={(meta as any).linkedin} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                                      <Linkedin className="h-3.5 w-3.5" />
                                    </a>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{lead.email || '—'}</td>
                              <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">{lead.company || '—'}</td>
                              <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">{lead.address || '—'}</td>
                              <td className="py-3 px-4 text-muted-foreground hidden xl:table-cell">{(meta as any).job_title || '—'}</td>
                              <td className="py-3 px-4 text-muted-foreground text-xs">
                                {new Date(lead.created_at).toLocaleDateString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
