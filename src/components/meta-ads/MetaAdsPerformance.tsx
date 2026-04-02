import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  TrendingUp, DollarSign, Eye, MousePointerClick, Users, Target,
  ShoppingCart, BarChart3, AlertTriangle, Sparkles, RefreshCw, Link2,
  ArrowUpRight, ArrowDownRight
} from 'lucide-react';

const metrics = [
  { label: 'Spend', value: '$1,240', icon: DollarSign, change: '+12%', up: true },
  { label: 'Impressions', value: '89,400', icon: Eye, change: '+8%', up: true },
  { label: 'CPM', value: '$13.87', icon: BarChart3, change: '-3%', up: false },
  { label: 'CPC', value: '$0.92', icon: MousePointerClick, change: '-5%', up: false },
  { label: 'CTR', value: '3.2%', icon: TrendingUp, change: '+0.4%', up: true },
  { label: 'Leads', value: '97', icon: Users, change: '+15%', up: true },
  { label: 'CPL', value: '$12.78', icon: Target, change: '-8%', up: false },
  { label: 'Purchases', value: '23', icon: ShoppingCart, change: '+4', up: true },
  { label: 'CPA', value: '$53.91', icon: DollarSign, change: '-11%', up: false },
  { label: 'ROAS', value: '3.4x', icon: TrendingUp, change: '+0.6x', up: true },
  { label: 'Frequency', value: '1.8', icon: RefreshCw, change: '+0.2', up: true },
  { label: 'Conv. Rate', value: '4.7%', icon: Target, change: '+0.3%', up: true },
];

const aiInsights = [
  { type: 'success', text: 'Your lead gen campaign is performing well — CPL dropped 8% this week.' },
  { type: 'success', text: 'CTR at 3.2% is above the industry average of 1.5%.' },
  { type: 'warning', text: 'Frequency is reaching 1.8 — creative fatigue may start. Consider refreshing creatives.' },
  { type: 'warning', text: 'CPA on the retargeting campaign is rising — review audience overlap.' },
  { type: 'info', text: 'Consider testing 3 new hooks this week to combat creative decay.' },
  { type: 'info', text: 'Budget scaling opportunity: lead gen campaign can handle a 20% increase safely.' },
];

export default function MetaAdsPerformance({ trainerMode }: { trainerMode: boolean }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-500" /> Performance Analyzer
          </h3>
          <p className="text-sm text-muted-foreground">Campaign metrics and AI analysis</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Link2 className="h-3.5 w-3.5" /> Connect Ad Account
        </Button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {metrics.map((m, i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <m.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className={`text-[10px] flex items-center gap-0.5 ${m.up ? 'text-green-500' : 'text-red-500'}`}>
                  {m.up ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                  {m.change}
                </span>
              </div>
              <p className="text-lg font-bold text-foreground">{m.value}</p>
              <p className="text-[10px] text-muted-foreground">{m.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts placeholder */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground">Spend & Leads Chart</p>
            <p className="text-xs text-muted-foreground/50">Connect your ad account to see live charts</p>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground">ROAS Trend</p>
            <p className="text-xs text-muted-foreground/50">Connect your ad account to see trends</p>
          </CardContent>
        </Card>
      </div>

      {/* AI Analysis */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI Performance Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {aiInsights.map((insight, i) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${
              insight.type === 'success' ? 'bg-green-500/5' :
              insight.type === 'warning' ? 'bg-amber-500/5' : 'bg-blue-500/5'
            }`}>
              {insight.type === 'success' && <TrendingUp className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />}
              {insight.type === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
              {insight.type === 'info' && <Sparkles className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />}
              <p className="text-sm text-foreground">{insight.text}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {trainerMode && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-500 flex items-center gap-1.5">💡 Trainer: Understanding These Metrics</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p><strong>CTR (Click-Through Rate)</strong> — % of people who clicked your ad. Above 2% is generally good.</p>
            <p><strong>CPL (Cost Per Lead)</strong> — How much you pay for each lead. Lower is better.</p>
            <p><strong>ROAS (Return on Ad Spend)</strong> — Revenue divided by spend. 3x+ means profitable.</p>
            <p><strong>Frequency</strong> — How many times each person sees your ad. Above 2.5 may indicate fatigue.</p>
            <p><strong>CPM</strong> — Cost per 1,000 impressions. Depends on audience competition.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
