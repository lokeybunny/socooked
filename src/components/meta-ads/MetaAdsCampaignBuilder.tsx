import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Zap, Save, Sparkles, Facebook, Instagram, Target, DollarSign,
  MapPin, Users, Calendar, Globe, MousePointerClick, ArrowRight, Check
} from 'lucide-react';
import { toast } from 'sonner';

export default function MetaAdsCampaignBuilder() {
  const [campaign, setCampaign] = useState({
    name: '',
    platforms: [] as string[],
    objective: '',
    budgetType: 'daily',
    budget: '',
    startDate: '',
    endDate: '',
    geoTargeting: '',
    ageMin: '18',
    ageMax: '65',
    gender: 'all',
    interests: '',
    customAudience: '',
    lookalike: '',
    exclusions: '',
    optimizationGoal: '',
    ctaType: '',
    destinationUrl: '',
    pixelStatus: 'not_connected',
    trackingNotes: '',
    creativeStatus: 'not_started',
    placements: 'automatic',
    adSetCount: '1',
    conversionLocation: '',
  });

  const togglePlatform = (p: string) => {
    setCampaign(prev => ({
      ...prev,
      platforms: prev.platforms.includes(p) ? prev.platforms.filter(x => x !== p) : [...prev.platforms, p],
    }));
  };

  const objectives = [
    'Lead Generation', 'Sales', 'Traffic', 'Engagement', 'Awareness', 'Messages', 'App Promotion',
  ];

  const ctaTypes = [
    'Learn More', 'Sign Up', 'Shop Now', 'Book Now', 'Contact Us', 'Get Quote',
    'Get Offer', 'Apply Now', 'Subscribe', 'Download', 'Send Message',
  ];

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" /> Campaign Builder
          </h3>
          <p className="text-sm text-muted-foreground">Build your Meta campaign step by step</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> AI Auto-Fill
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => toast.success('Campaign draft saved')}>
            <Save className="h-3.5 w-3.5" /> Save Draft
          </Button>
        </div>
      </div>

      {/* Campaign Basics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Campaign Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Campaign Name</Label>
              <Input placeholder="e.g. Med Spa Lead Gen - March" value={campaign.name} onChange={e => setCampaign(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Platform</Label>
              <div className="flex gap-2">
                {[{ key: 'facebook', icon: Facebook, label: 'Facebook' }, { key: 'instagram', icon: Instagram, label: 'Instagram' }].map(p => (
                  <Button
                    key={p.key}
                    variant={campaign.platforms.includes(p.key) ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1.5 flex-1"
                    onClick={() => togglePlatform(p.key)}
                  >
                    <p.icon className="h-3.5 w-3.5" /> {p.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Objective</Label>
              <Select value={campaign.objective} onValueChange={v => setCampaign(p => ({ ...p, objective: v }))}>
                <SelectTrigger><SelectValue placeholder="Select objective" /></SelectTrigger>
                <SelectContent>
                  {objectives.map(o => <SelectItem key={o} value={o.toLowerCase().replace(/\s/g, '_')}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Conversion Location</Label>
              <Select value={campaign.conversionLocation} onValueChange={v => setCampaign(p => ({ ...p, conversionLocation: v }))}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="instant_form">Instant Form</SelectItem>
                  <SelectItem value="messenger">Messenger</SelectItem>
                  <SelectItem value="instagram_dm">Instagram DM</SelectItem>
                  <SelectItem value="app">App</SelectItem>
                  <SelectItem value="calls">Phone Calls</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Budget & Schedule */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4" /> Budget & Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Budget Type</Label>
              <Select value={campaign.budgetType} onValueChange={v => setCampaign(p => ({ ...p, budgetType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily Budget</SelectItem>
                  <SelectItem value="lifetime">Lifetime Budget</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Amount ($)</Label>
              <Input type="number" placeholder="20" value={campaign.budget} onChange={e => setCampaign(p => ({ ...p, budget: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Ad Sets</Label>
              <Input type="number" min="1" max="10" value={campaign.adSetCount} onChange={e => setCampaign(p => ({ ...p, adSetCount: e.target.value }))} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={campaign.startDate} onChange={e => setCampaign(p => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">End Date (optional)</Label>
              <Input type="date" value={campaign.endDate} onChange={e => setCampaign(p => ({ ...p, endDate: e.target.value }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Targeting */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" /> Targeting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Geo Targeting</Label>
              <Input placeholder="City, State, ZIP, or Country" value={campaign.geoTargeting} onChange={e => setCampaign(p => ({ ...p, geoTargeting: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Placements</Label>
              <Select value={campaign.placements} onValueChange={v => setCampaign(p => ({ ...p, placements: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Automatic (Advantage+)</SelectItem>
                  <SelectItem value="manual">Manual Placements</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Age Range</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min="13" max="65" value={campaign.ageMin} onChange={e => setCampaign(p => ({ ...p, ageMin: e.target.value }))} className="w-20" />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="number" min="13" max="65" value={campaign.ageMax} onChange={e => setCampaign(p => ({ ...p, ageMax: e.target.value }))} className="w-20" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Gender</Label>
              <Select value={campaign.gender} onValueChange={v => setCampaign(p => ({ ...p, gender: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Detailed Interest Targeting</Label>
            <Textarea placeholder="e.g. Real Estate, Home Buying, Zillow, First-time buyers..." value={campaign.interests} onChange={e => setCampaign(p => ({ ...p, interests: e.target.value }))} className="min-h-[60px]" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Custom Audience</Label>
              <Input placeholder="Audience name or ID" value={campaign.customAudience} onChange={e => setCampaign(p => ({ ...p, customAudience: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Lookalike Audience</Label>
              <Input placeholder="Source audience" value={campaign.lookalike} onChange={e => setCampaign(p => ({ ...p, lookalike: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Exclusions</Label>
            <Input placeholder="Audiences or interests to exclude" value={campaign.exclusions} onChange={e => setCampaign(p => ({ ...p, exclusions: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      {/* Ad Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><MousePointerClick className="h-4 w-4" /> Ad Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">CTA Button</Label>
              <Select value={campaign.ctaType} onValueChange={v => setCampaign(p => ({ ...p, ctaType: v }))}>
                <SelectTrigger><SelectValue placeholder="Select CTA" /></SelectTrigger>
                <SelectContent>
                  {ctaTypes.map(c => <SelectItem key={c} value={c.toLowerCase().replace(/\s/g, '_')}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Destination URL</Label>
              <Input placeholder="https://..." value={campaign.destinationUrl} onChange={e => setCampaign(p => ({ ...p, destinationUrl: e.target.value }))} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Pixel Status</Label>
              <Badge variant="outline" className="text-xs">
                {campaign.pixelStatus === 'connected' ? '🟢 Connected' : '🔴 Not Connected'}
              </Badge>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Creative Status</Label>
              <Badge variant="outline" className="text-xs capitalize">{campaign.creativeStatus.replace(/_/g, ' ')}</Badge>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Tracking Notes</Label>
            <Textarea placeholder="UTM parameters, tracking setup notes..." value={campaign.trackingNotes} onChange={e => setCampaign(p => ({ ...p, trackingNotes: e.target.value }))} className="min-h-[60px]" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline">Save as Draft</Button>
        <Button className="gap-1.5" onClick={() => toast.success('Campaign created!')}>
          <Check className="h-4 w-4" /> Create Campaign
        </Button>
      </div>
    </div>
  );
}
