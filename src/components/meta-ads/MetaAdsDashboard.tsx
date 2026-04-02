import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3, MessageSquare, PenTool, Target, Palette, TrendingUp,
  Plus, Sparkles, GraduationCap, Zap, DollarSign, Eye, MousePointerClick,
  Users, Activity, ArrowUpRight, Clock, CheckCircle2, Pause, FileText,
  Send, Lightbulb, Layout, Link2, Settings2, BookOpen, Video
} from 'lucide-react';
import MetaAdsChat from './MetaAdsChat';
import MetaAdsCampaignBuilder from './MetaAdsCampaignBuilder';
import MetaAdsCopyLab from './MetaAdsCopyLab';
import MetaAdsCreativeBrief from './MetaAdsCreativeBrief';
import MetaAdsAudienceBuilder from './MetaAdsAudienceBuilder';
import MetaAdsPerformance from './MetaAdsPerformance';
import MetaAdsCampaignRecords from './MetaAdsCampaignRecords';
import MetaAdsCRMLinks from './MetaAdsCRMLinks';
import MetaAdsOnboarding from './MetaAdsOnboarding';
import MetaAdsVideoManager from './MetaAdsVideoManager';

export default function MetaAdsDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [trainerMode, setTrainerMode] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('meta-ads-onboarded');
  });
  const [userProfile, setUserProfile] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('meta-ads-profile') || '{}');
    } catch { return {}; }
  });
  const [metaConnected, setMetaConnected] = useState(() => {
    return localStorage.getItem('meta-ads-connected') === 'true';
  });

  const handleOnboardingComplete = (answers: Record<string, string>) => {
    localStorage.setItem('meta-ads-onboarded', 'true');
    localStorage.setItem('meta-ads-profile', JSON.stringify(answers));
    setUserProfile(answers);
    setShowOnboarding(false);
  };

  const handleConnectMeta = () => {
    // Placeholder: In production this would open OAuth flow
    setMetaConnected(true);
    localStorage.setItem('meta-ads-connected', 'true');
    toast.success('Meta Ads account connected! Live data sync coming soon.');
  };

  const handleDisconnectMeta = () => {
    setMetaConnected(false);
    localStorage.removeItem('meta-ads-connected');
    toast.info('Meta Ads account disconnected.');
  };

  if (showOnboarding) {
    return <MetaAdsOnboarding onComplete={handleOnboardingComplete} />;
  }

  const stats = [
    { icon: BarChart3, label: 'Total Campaigns', value: '12', color: 'text-primary' },
    { icon: CheckCircle2, label: 'Active', value: '4', color: 'text-green-500' },
    { icon: FileText, label: 'Drafts', value: '5', color: 'text-muted-foreground' },
    { icon: Pause, label: 'Paused', value: '3', color: 'text-yellow-500' },
    { icon: DollarSign, label: 'Est. Monthly Spend', value: '$2,400', color: 'text-emerald-500' },
    { icon: Users, label: 'Leads Generated', value: '187', color: 'text-blue-500' },
    { icon: MousePointerClick, label: 'Avg CTR', value: '3.2%', color: 'text-cyan-500' },
    { icon: Target, label: 'Cost/Lead', value: '$12.84', color: 'text-orange-500' },
  ];

  const quickActions = [
    { icon: Plus, label: 'New Campaign', tab: 'campaign-builder', color: 'bg-primary text-primary-foreground' },
    { icon: MessageSquare, label: 'Ask AI', tab: 'ai-chat', color: 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20' },
    { icon: PenTool, label: 'Generate Copy', tab: 'copy-lab', color: 'bg-purple-500/10 text-purple-500 hover:bg-purple-500/20' },
    { icon: Target, label: 'Build Audience', tab: 'audience', color: 'bg-green-500/10 text-green-500 hover:bg-green-500/20' },
    { icon: Palette, label: 'Creative Brief', tab: 'creative', color: 'bg-pink-500/10 text-pink-500 hover:bg-pink-500/20' },
    { icon: TrendingUp, label: 'Analyze', tab: 'performance', color: 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-foreground">Meta Ads AI</h2>
            <Badge className="bg-gradient-to-r from-blue-500 to-purple-500 text-white border-0 text-[10px]">
              <Sparkles className="h-3 w-3 mr-1" /> AI-Powered
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">Facebook & Instagram campaign command center</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={trainerMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTrainerMode(!trainerMode)}
            className="gap-1.5"
          >
            <GraduationCap className="h-3.5 w-3.5" />
            Trainer Mode {trainerMode ? 'ON' : 'OFF'}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0">
          {[
            { value: 'overview', icon: Layout, label: 'Dashboard' },
            { value: 'ai-chat', icon: MessageSquare, label: 'AI Strategist' },
            { value: 'campaign-builder', icon: Zap, label: 'Campaign Builder' },
            { value: 'copy-lab', icon: PenTool, label: 'Ad Copy Lab' },
            { value: 'creative', icon: Palette, label: 'Creative Briefs' },
            { value: 'audience', icon: Target, label: 'Audiences' },
            { value: 'performance', icon: TrendingUp, label: 'Performance' },
            { value: 'records', icon: FileText, label: 'Campaigns' },
            { value: 'crm', icon: Link2, label: 'CRM Links' },
            { value: 'videos', icon: Video, label: 'Video Ads' },
          ].map(t => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 rounded-lg px-3 py-1.5 text-xs"
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview Dashboard */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map((s, i) => (
              <Card key={i} className="border-border/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0`}>
                    <s.icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground truncate">{s.label}</p>
                    <p className="text-lg font-bold text-foreground">{s.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" /> Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {quickActions.map((a, i) => (
                  <Button
                    key={i}
                    variant="ghost"
                    className={`flex-col h-auto py-4 gap-2 rounded-xl ${a.color}`}
                    onClick={() => setActiveTab(a.tab)}
                  >
                    <a.icon className="h-5 w-5" />
                    <span className="text-[11px] font-medium">{a.label}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Campaign Health + Recent AI */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-green-500" /> Campaign Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { name: 'Med Spa Lead Gen', health: 92, status: 'active' },
                  { name: 'Realtor Cash Offers', health: 78, status: 'active' },
                  { name: 'Dental Cleaning Special', health: 45, status: 'warning' },
                  { name: 'Ecommerce Retarget', health: 88, status: 'active' },
                ].map((c, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${c.health > 70 ? 'bg-green-500' : c.health > 50 ? 'bg-yellow-500' : 'bg-red-500'}`} />
                      <span className="text-sm text-foreground">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${c.health > 70 ? 'bg-green-500' : c.health > 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${c.health}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground w-8">{c.health}%</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-blue-500" /> Recent AI Conversations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { title: 'Med spa lead campaign strategy', time: '2h ago' },
                  { title: 'Ad copy for dental cleaning offer', time: '5h ago' },
                  { title: 'Retargeting audience setup help', time: '1d ago' },
                  { title: 'Budget allocation recommendations', time: '2d ago' },
                ].map((c, i) => (
                  <button
                    key={i}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                    onClick={() => setActiveTab('ai-chat')}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span className="text-sm text-foreground">{c.title}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{c.time}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* ROAS Placeholder */}
          <Card className="border-dashed">
            <CardContent className="p-8 flex flex-col items-center justify-center text-center">
              <TrendingUp className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">ROAS & Revenue Tracking</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {metaConnected ? 'Meta Ads account connected — live data sync coming soon' : 'Connect your Meta Ads account to see live ROAS data'}
              </p>
              <Button
                variant={metaConnected ? 'secondary' : 'outline'}
                size="sm"
                className="mt-3 gap-1.5"
                onClick={metaConnected ? handleDisconnectMeta : handleConnectMeta}
              >
                <Link2 className="h-3.5 w-3.5" />
                {metaConnected ? 'Connected ✓ (Disconnect)' : 'Connect Meta Ads'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-chat" className="mt-6">
          <MetaAdsChat trainerMode={trainerMode} userProfile={userProfile} />
        </TabsContent>

        <TabsContent value="campaign-builder" className="mt-6">
          <MetaAdsCampaignBuilder />
        </TabsContent>

        <TabsContent value="copy-lab" className="mt-6">
          <MetaAdsCopyLab trainerMode={trainerMode} />
        </TabsContent>

        <TabsContent value="creative" className="mt-6">
          <MetaAdsCreativeBrief />
        </TabsContent>

        <TabsContent value="audience" className="mt-6">
          <MetaAdsAudienceBuilder />
        </TabsContent>

        <TabsContent value="performance" className="mt-6">
          <MetaAdsPerformance trainerMode={trainerMode} />
        </TabsContent>

        <TabsContent value="records" className="mt-6">
          <MetaAdsCampaignRecords />
        </TabsContent>

        <TabsContent value="crm" className="mt-6">
          <MetaAdsCRMLinks />
        </TabsContent>

        <TabsContent value="videos" className="mt-6">
          <MetaAdsVideoManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
        </TabsContent>
      </Tabs>
    </div>
  );
}
