import { Checkbox } from '@/components/ui/checkbox';
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

type InterestsData = {
  property_types: string[];
  condition_prefs: string[];
  motivation_flags: string[];
  min_bedrooms: string;
  min_bathrooms: string;
  min_sqft: string;
  max_sqft: string;
  min_year_built: string;
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

  return (
    <div className="space-y-4">
      <div className="border border-border rounded-lg p-3 space-y-2">
        <Label className="text-sm font-semibold">Property Types</Label>
        <div className="grid grid-cols-2 gap-2">
          {PROPERTY_TYPES.map(pt => (
            <label key={pt.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={interests.property_types.includes(pt.key)}
                onCheckedChange={() => onChange({ ...interests, property_types: toggleArray(interests.property_types, pt.key) })}
              />
              {pt.label}
            </label>
          ))}
        </div>
      </div>

      <div className="border border-border rounded-lg p-3 space-y-2">
        <Label className="text-sm font-semibold">Condition Preference</Label>
        <div className="grid grid-cols-2 gap-2">
          {CONDITION_PREFS.map(cp => (
            <label key={cp.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={interests.condition_prefs.includes(cp.key)}
                onCheckedChange={() => onChange({ ...interests, condition_prefs: toggleArray(interests.condition_prefs, cp.key) })}
              />
              {cp.label}
            </label>
          ))}
        </div>
      </div>

      <div className="border border-border rounded-lg p-3 space-y-2">
        <Label className="text-sm font-semibold">Seller Motivation Flags</Label>
        <div className="grid grid-cols-2 gap-2">
          {MOTIVATION_FLAGS.map(mf => (
            <label key={mf.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={interests.motivation_flags.includes(mf.key)}
                onCheckedChange={() => onChange({ ...interests, motivation_flags: toggleArray(interests.motivation_flags, mf.key) })}
              />
              {mf.label}
            </label>
          ))}
        </div>
      </div>

      <div className="border border-border rounded-lg p-3 space-y-2">
        <Label className="text-sm font-semibold">Size & Year</Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Min Bedrooms</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={interests.min_bedrooms}
              onChange={e => onChange({ ...interests, min_bedrooms: e.target.value })}
            >
              {BEDROOM_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Min Bathrooms</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={interests.min_bathrooms}
              onChange={e => onChange({ ...interests, min_bathrooms: e.target.value })}
            >
              {BATHROOM_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Min Sqft</Label>
            <input
              type="number"
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={interests.min_sqft}
              onChange={e => onChange({ ...interests, min_sqft: e.target.value })}
              placeholder="800"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Max Sqft</Label>
            <input
              type="number"
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={interests.max_sqft}
              onChange={e => onChange({ ...interests, max_sqft: e.target.value })}
              placeholder="5000"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Min Year Built</Label>
          <input
            type="number"
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={interests.min_year_built}
            onChange={e => onChange({ ...interests, min_year_built: e.target.value })}
            placeholder="1980"
          />
        </div>
      </div>
    </div>
  );
}
