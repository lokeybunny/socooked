import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const PROPERTY_TYPES = [
  { key: 'sfr', label: '🏠 Single Family Home' },
  { key: 'multi_family', label: '🏘️ Multi-Family (2-4 units)' },
  { key: 'apartment', label: '🏢 Apartment Complex (5+)' },
  { key: 'land', label: '🏞️ Vacant Land' },
  { key: 'commercial', label: '🏪 Commercial' },
  { key: 'mobile_home', label: '🏕️ Mobile / Manufactured Home' },
  { key: 'townhouse', label: '🏡 Townhouse / Condo' },
];

export const CONDITION_PREFS = [
  { key: 'fixer_upper', label: '🔧 Fixer-Upper / Rehab' },
  { key: 'turnkey', label: '✅ Turnkey / Move-In Ready' },
  { key: 'tear_down', label: '🏚️ Tear-Down' },
  { key: 'new_construction', label: '🆕 New Construction' },
];

export const MOTIVATION_FLAGS = [
  { key: 'distressed', label: '🔥 Distressed / Motivated Seller' },
  { key: 'pre_foreclosure', label: '⚠️ Pre-Foreclosure' },
  { key: 'tax_delinquent', label: '💰 Tax Delinquent' },
  { key: 'absentee_owner', label: '📍 Absentee Owner' },
  { key: 'probate', label: '📜 Probate / Inherited' },
  { key: 'vacant', label: '🏚️ Vacant Property' },
  { key: 'free_clear', label: '🆓 Free & Clear' },
  { key: 'cash_buyer', label: '💵 Cash Purchase Only' },
];

export const BEDROOM_OPTIONS = [
  { key: 'any', label: 'Any' },
  { key: '1+', label: '1+' },
  { key: '2+', label: '2+' },
  { key: '3+', label: '3+' },
  { key: '4+', label: '4+' },
  { key: '5+', label: '5+' },
];

export const BATHROOM_OPTIONS = [
  { key: 'any', label: 'Any' },
  { key: '1+', label: '1+' },
  { key: '2+', label: '2+' },
  { key: '3+', label: '3+' },
];

export const GARAGE_OPTIONS = [
  { key: 'any', label: 'Any' },
  { key: '1+', label: '1+' },
  { key: '2+', label: '2+' },
  { key: '3+', label: '3+' },
];

export const STORIES_OPTIONS = [
  { key: 'any', label: 'Any' },
  { key: '1', label: '1' },
  { key: '2', label: '2' },
  { key: '3+', label: '3+' },
];

type InterestsData = {
  property_types: string[];
  condition_prefs: string[];
  motivation_flags: string[];
  min_bedrooms: string;
  min_bathrooms: string;
  min_sqft: string;
  max_sqft: string;
  min_year_built: string;
  max_year_built: string;
  min_garage: string;
  min_stories: string;
  max_stories: string;
  min_lot_sqft: string;
  max_lot_sqft: string;
  wants_pool: boolean;
  wants_basement: boolean;
  wants_ac: boolean;
  target_city: string;
  search_radius_miles: string;
};

export const emptyInterests: InterestsData = {
  property_types: [],
  condition_prefs: [],
  motivation_flags: [],
  min_bedrooms: 'any',
  min_bathrooms: 'any',
  min_sqft: '',
  max_sqft: '',
  min_year_built: '',
  max_year_built: '',
  min_garage: 'any',
  min_stories: 'any',
  max_stories: 'any',
  min_lot_sqft: '',
  max_lot_sqft: '',
  wants_pool: false,
  wants_basement: false,
  wants_ac: false,
  target_city: '',
  search_radius_miles: '',
};

export type { InterestsData };

export default function BuyerInterests({
  interests,
  onChange,
}: {
  interests: InterestsData;
  onChange: (i: InterestsData) => void;
}) {
  const toggleArray = (arr: string[], key: string) =>
    arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key];

  // Merge with defaults to handle old data missing new fields
  const i = { ...emptyInterests, ...interests };

  return (
    <div className="space-y-4">
      {/* Property Types (Required — at least one) */}
      <div className="border border-border rounded-lg p-3 space-y-2">
        <Label className="text-sm font-semibold">Property Types *</Label>
        <p className="text-[10px] text-muted-foreground">Select at least one to enable matching</p>
        <div className="grid grid-cols-2 gap-2">
          {PROPERTY_TYPES.map(pt => (
            <label key={pt.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={i.property_types.includes(pt.key)}
                onCheckedChange={() => onChange({ ...i, property_types: toggleArray(i.property_types, pt.key) })}
              />
              {pt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Location Preferences */}
      <div className="border border-border rounded-lg p-3 space-y-2">
        <Label className="text-sm font-semibold">📍 Location Preferences</Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Target City</Label>
            <Input
              className="h-9 text-sm"
              value={i.target_city}
              onChange={e => onChange({ ...i, target_city: e.target.value })}
              placeholder="e.g. Phoenix"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Search Radius (miles)</Label>
            <Input
              type="number"
              className="h-9 text-sm"
              value={i.search_radius_miles}
              onChange={e => onChange({ ...i, search_radius_miles: e.target.value })}
              placeholder="e.g. 30"
            />
          </div>
        </div>
      </div>

      {/* Building Specs */}
      <div className="border border-border rounded-lg p-3 space-y-2">
        <Label className="text-sm font-semibold">🏗️ Building Specs</Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Min Bedrooms</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={i.min_bedrooms}
              onChange={e => onChange({ ...i, min_bedrooms: e.target.value })}
            >
              {BEDROOM_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Min Bathrooms</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={i.min_bathrooms}
              onChange={e => onChange({ ...i, min_bathrooms: e.target.value })}
            >
              {BATHROOM_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Min Garage</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={i.min_garage}
              onChange={e => onChange({ ...i, min_garage: e.target.value })}
            >
              {GARAGE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Stories</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={i.min_stories}
              onChange={e => onChange({ ...i, min_stories: e.target.value })}
            >
              {STORIES_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Min Sqft</Label>
            <Input
              type="number"
              className="h-9 text-sm"
              value={i.min_sqft}
              onChange={e => onChange({ ...i, min_sqft: e.target.value })}
              placeholder="800"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Max Sqft</Label>
            <Input
              type="number"
              className="h-9 text-sm"
              value={i.max_sqft}
              onChange={e => onChange({ ...i, max_sqft: e.target.value })}
              placeholder="5000"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Min Lot Sqft</Label>
            <Input
              type="number"
              className="h-9 text-sm"
              value={i.min_lot_sqft}
              onChange={e => onChange({ ...i, min_lot_sqft: e.target.value })}
              placeholder="2000"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Max Lot Sqft</Label>
            <Input
              type="number"
              className="h-9 text-sm"
              value={i.max_lot_sqft}
              onChange={e => onChange({ ...i, max_lot_sqft: e.target.value })}
              placeholder="50000"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Min Year Built</Label>
            <Input
              type="number"
              className="h-9 text-sm"
              value={i.min_year_built}
              onChange={e => onChange({ ...i, min_year_built: e.target.value })}
              placeholder="1980"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Max Year Built</Label>
            <Input
              type="number"
              className="h-9 text-sm"
              value={i.max_year_built}
              onChange={e => onChange({ ...i, max_year_built: e.target.value })}
              placeholder="2024"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 pt-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={i.wants_pool}
              onCheckedChange={v => onChange({ ...i, wants_pool: !!v })}
            />
            🏊 Pool
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={i.wants_basement}
              onCheckedChange={v => onChange({ ...i, wants_basement: !!v })}
            />
            🏚️ Basement
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={i.wants_ac}
              onCheckedChange={v => onChange({ ...i, wants_ac: !!v })}
            />
            ❄️ A/C
          </label>
        </div>
      </div>

      {/* Condition Preference */}
      <div className="border border-border rounded-lg p-3 space-y-2">
        <Label className="text-sm font-semibold">Condition Preference</Label>
        <div className="grid grid-cols-2 gap-2">
          {CONDITION_PREFS.map(cp => (
            <label key={cp.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={i.condition_prefs.includes(cp.key)}
                onCheckedChange={() => onChange({ ...i, condition_prefs: toggleArray(i.condition_prefs, cp.key) })}
              />
              {cp.label}
            </label>
          ))}
        </div>
      </div>

      {/* Seller Motivation Flags */}
      <div className="border border-border rounded-lg p-3 space-y-2">
        <Label className="text-sm font-semibold">Seller Motivation Flags</Label>
        <div className="grid grid-cols-2 gap-2">
          {MOTIVATION_FLAGS.map(mf => (
            <label key={mf.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={i.motivation_flags.includes(mf.key)}
                onCheckedChange={() => onChange({ ...i, motivation_flags: toggleArray(i.motivation_flags, mf.key) })}
              />
              {mf.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
