import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText, Plus, Search, Layout, MessageSquare, PenTool, Target,
  Palette, TrendingUp, StickyNote, Sparkles
} from 'lucide-react';
import { Input } from '@/components/ui/input';

interface CampaignRecord {
  id: string;
  name: string;
  client: string;
  status: 'active' | 'draft' | 'paused' | 'completed';
  platform: string;
  objective: string;
  created: string;
}

const mockRecords: CampaignRecord[] = [
  { id: '1', name: 'Med Spa Lead Gen - March', client: 'Glow Med Spa', status: 'active', platform: 'Facebook + Instagram', objective: 'Lead Generation', created: '2026-03-15' },
  { id: '2', name: 'Realtor Cash Offers', client: 'Warren Realty', status: 'active', platform: 'Facebook', objective: 'Lead Generation', created: '2026-03-10' },
  { id: '3', name: 'Dental Cleaning Special', client: 'Bright Smile Dental', status: 'draft', platform: 'Instagram', objective: 'Messages', created: '2026-03-20' },
  { id: '4', name: 'Ecommerce Retarget', client: 'Urban Threads', status: 'paused', platform: 'Facebook + Instagram', objective: 'Sales', created: '2026-02-28' },
];

const statusColors: Record<string, string> = {
  active: 'bg-green-500/10 text-green-500',
  draft: 'bg-muted text-muted-foreground',
  paused: 'bg-yellow-500/10 text-yellow-500',
  completed: 'bg-blue-500/10 text-blue-500',
};

export default function MetaAdsCampaignRecords() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = mockRecords.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.client.toLowerCase().includes(search.toLowerCase())
  );

  if (selected) {
    const record = mockRecords.find(r => r.id === selected)!;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground mb-1">← Back to campaigns</button>
            <h3 className="text-lg font-semibold text-foreground">{record.name}</h3>
            <p className="text-sm text-muted-foreground">{record.client}</p>
          </div>
          <Badge className={statusColors[record.status]}>{record.status}</Badge>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
            {['Overview', 'Strategy', 'Copy', 'Audiences', 'Creative', 'Performance', 'Notes', 'AI Chat'].map(t => (
              <TabsTrigger key={t} value={t.toLowerCase().replace(' ', '-')} className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 rounded-lg px-2.5 py-1">
                {t}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <Card>
              <CardContent className="p-6 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Platform:</span> <span className="text-foreground ml-2">{record.platform}</span></div>
                  <div><span className="text-muted-foreground">Objective:</span> <span className="text-foreground ml-2">{record.objective}</span></div>
                  <div><span className="text-muted-foreground">Created:</span> <span className="text-foreground ml-2">{record.created}</span></div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge className={`ml-2 ${statusColors[record.status]}`}>{record.status}</Badge></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {['strategy', 'copy', 'audiences', 'creative', 'performance', 'notes', 'ai-chat'].map(tab => (
            <TabsContent key={tab} value={tab} className="mt-4">
              <Card className="border-dashed">
                <CardContent className="p-8 flex flex-col items-center text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/20 mb-2" />
                  <p className="text-sm text-muted-foreground capitalize">{tab.replace('-', ' ')} workspace</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">Save your {tab.replace('-', ' ')} content here</p>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-foreground" /> Campaign Records
          </h3>
          <p className="text-sm text-muted-foreground">Saved campaigns and workspaces</p>
        </div>
        <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> New Campaign</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search campaigns..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid gap-3">
        {filtered.map(r => (
          <Card key={r.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setSelected(r.id)}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-semibold text-sm text-foreground">{r.name}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{r.client}</span>
                  <span>•</span>
                  <span>{r.platform}</span>
                  <span>•</span>
                  <span>{r.objective}</span>
                </div>
              </div>
              <Badge className={statusColors[r.status]}>{r.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
