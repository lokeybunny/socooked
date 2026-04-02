import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Link2, Users, Building2, FileText, Globe, Package, Phone,
  Palette, StickyNote, CheckSquare, MessageSquare, Plus
} from 'lucide-react';

const linkSections = [
  { icon: Users, label: 'Linked Clients', count: 3, description: 'CRM clients attached to campaigns' },
  { icon: Building2, label: 'Linked Brands', count: 2, description: 'Brand profiles for multi-client management' },
  { icon: Phone, label: 'Linked Leads', count: 12, description: 'Leads from ad campaigns' },
  { icon: Globe, label: 'Linked Landing Pages', count: 4, description: 'Landing pages used in ads' },
  { icon: Package, label: 'Linked Offers', count: 5, description: 'Offers and promotions in campaigns' },
  { icon: Palette, label: 'Linked Creative Assets', count: 18, description: 'Images, videos, and graphics' },
  { icon: StickyNote, label: 'Linked Notes', count: 7, description: 'Strategy and optimization notes' },
  { icon: CheckSquare, label: 'Linked Tasks', count: 4, description: 'Tasks created from AI recommendations' },
  { icon: MessageSquare, label: 'Linked Conversations', count: 8, description: 'AI chat threads tied to campaigns' },
  { icon: FileText, label: 'Linked Funnels', count: 2, description: 'Sales funnels connected to ads' },
];

export default function MetaAdsCRMLinks() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Link2 className="h-5 w-5 text-foreground" /> CRM Connections
        </h3>
        <p className="text-sm text-muted-foreground">Link campaigns to your CRM records</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {linkSections.map((s, i) => (
          <Card key={i} className="hover:border-primary/20 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
                    <s.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{s.label}</p>
                    <p className="text-[11px] text-muted-foreground">{s.description}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">{s.count}</Badge>
              </div>
              <Button variant="ghost" size="sm" className="w-full mt-3 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                <Plus className="h-3 w-3" /> Add Link
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Integration placeholders */}
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Future Integrations</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            'Meta Ads API', 'Campaign Sync', 'Ad Account Connection', 'Performance Import',
          ].map(item => (
            <div key={item} className="p-3 rounded-lg bg-muted/50 text-center">
              <p className="text-xs text-muted-foreground">{item}</p>
              <Badge variant="outline" className="text-[9px] mt-1">Coming Soon</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
