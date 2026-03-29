/**
 * Advanced Distress Filter Panel
 * 
 * Accordion-based filter groups for distressed property intelligence.
 * Supports ownership, financial, foreclosure, property, geography,
 * and business logic filters. Also includes smart view presets.
 */
import { useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SMART_VIEW_PRESETS, SmartViewPreset } from '@/lib/wholesale/distressScoring';
import { Filter, X, Zap } from 'lucide-react';

export interface DistressFilterState {
  // Ownership
  isAbsentee: boolean | null;
  isOutOfState: boolean | null;
  isCorporate: boolean | null;
  isTrustOwned: boolean | null;
  ownerOccupied: boolean | null;
  minYearsOwned: number | null;
  maxYearsOwned: number | null;
  // Financial
  isTaxDelinquent: boolean | null;
  hasTaxLien: boolean | null;
  isFreeAndClear: boolean | null;
  minEquity: number | null;
  maxEquity: number | null;
  minLienCount: number | null;
  // Foreclosure
  isPreForeclosure: boolean | null;
  auctionStatus: string | null;
  isProbate: boolean | null;
  isInherited: boolean | null;
  // Property
  isVacant: boolean | null;
  dealType: string | null;
  propertyType: string | null;
  minAcreage: number | null;
  maxAcreage: number | null;
  // Geography (state/county handled externally)
  // Scoring
  minMotivation: number | null;
  minBuyerMatch: number | null;
  minOpportunity: number | null;
  // Status
  stage: string | null;
  skipTraceStatus: string | null;
  leadTemperature: string | null;
}

export const EMPTY_DISTRESS_FILTERS: DistressFilterState = {
  isAbsentee: null, isOutOfState: null, isCorporate: null, isTrustOwned: null,
  ownerOccupied: null, minYearsOwned: null, maxYearsOwned: null,
  isTaxDelinquent: null, hasTaxLien: null, isFreeAndClear: null,
  minEquity: null, maxEquity: null, minLienCount: null,
  isPreForeclosure: null, auctionStatus: null, isProbate: null, isInherited: null,
  isVacant: null, dealType: null, propertyType: null, minAcreage: null, maxAcreage: null,
  minMotivation: null, minBuyerMatch: null, minOpportunity: null,
  stage: null, skipTraceStatus: null, leadTemperature: null,
};

function countActiveFilters(f: DistressFilterState): number {
  return Object.values(f).filter(v => v !== null && v !== false).length;
}

interface DistressFiltersProps {
  filters: DistressFilterState;
  onChange: (filters: DistressFilterState) => void;
  onPreset: (preset: SmartViewPreset) => void;
}

export default function DistressFilters({ filters, onChange, onPreset }: DistressFiltersProps) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(filters);

  const set = <K extends keyof DistressFilterState>(key: K, val: DistressFilterState[K]) => {
    onChange({ ...filters, [key]: val });
  };

  const clearAll = () => onChange(EMPTY_DISTRESS_FILTERS);

  return (
    <div className="space-y-3">
      {/* Smart View Presets */}
      <div className="flex flex-wrap gap-1.5">
        {SMART_VIEW_PRESETS.map(preset => (
          <Button
            key={preset.key}
            size="sm"
            variant="outline"
            className="text-xs gap-1 h-7"
            onClick={() => onPreset(preset)}
            title={preset.description}
          >
            <span>{preset.emoji}</span>
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Toggle advanced filters */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={open ? 'default' : 'outline'}
          className="gap-1.5 text-xs"
          onClick={() => setOpen(!open)}
        >
          <Filter className="h-3.5 w-3.5" />
          Advanced Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{activeCount}</Badge>
          )}
        </Button>
        {activeCount > 0 && (
          <Button size="sm" variant="ghost" className="text-xs gap-1 h-7" onClick={clearAll}>
            <X className="h-3 w-3" /> Clear All
          </Button>
        )}
      </div>

      {open && (
        <div className="border rounded-lg bg-card p-3">
          <Accordion type="multiple" defaultValue={['ownership', 'scoring']} className="space-y-0">
            {/* Ownership / Occupancy */}
            <AccordionItem value="ownership" className="border-b-0">
              <AccordionTrigger className="text-xs font-semibold uppercase py-2">
                Ownership & Occupancy
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <CheckFilter label="Absentee Owner" checked={filters.isAbsentee} onChange={v => set('isAbsentee', v)} />
                  <CheckFilter label="Out-of-State" checked={filters.isOutOfState} onChange={v => set('isOutOfState', v)} />
                  <CheckFilter label="Corporate Owned" checked={filters.isCorporate} onChange={v => set('isCorporate', v)} />
                  <CheckFilter label="Trust Owned" checked={filters.isTrustOwned} onChange={v => set('isTrustOwned', v)} />
                  <div className="space-y-1">
                    <Label className="text-xs">Min Years Owned</Label>
                    <Input type="number" placeholder="e.g. 10" className="h-7 text-xs"
                      value={filters.minYearsOwned ?? ''} onChange={e => set('minYearsOwned', e.target.value ? Number(e.target.value) : null)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Years Owned</Label>
                    <Input type="number" placeholder="e.g. 30" className="h-7 text-xs"
                      value={filters.maxYearsOwned ?? ''} onChange={e => set('maxYearsOwned', e.target.value ? Number(e.target.value) : null)} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Financial Distress */}
            <AccordionItem value="financial" className="border-b-0">
              <AccordionTrigger className="text-xs font-semibold uppercase py-2">
                Financial Distress
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <CheckFilter label="Tax Delinquent" checked={filters.isTaxDelinquent} onChange={v => set('isTaxDelinquent', v)} />
                  <CheckFilter label="Tax Lien" checked={filters.hasTaxLien} onChange={v => set('hasTaxLien', v)} />
                  <CheckFilter label="Free & Clear" checked={filters.isFreeAndClear} onChange={v => set('isFreeAndClear', v)} />
                  <div className="space-y-1">
                    <Label className="text-xs">Min Equity %</Label>
                    <Input type="number" placeholder="e.g. 40" className="h-7 text-xs"
                      value={filters.minEquity ?? ''} onChange={e => set('minEquity', e.target.value ? Number(e.target.value) : null)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Min Lien Count</Label>
                    <Input type="number" placeholder="e.g. 2" className="h-7 text-xs"
                      value={filters.minLienCount ?? ''} onChange={e => set('minLienCount', e.target.value ? Number(e.target.value) : null)} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Foreclosure / Legal */}
            <AccordionItem value="foreclosure" className="border-b-0">
              <AccordionTrigger className="text-xs font-semibold uppercase py-2">
                Foreclosure & Legal
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <CheckFilter label="Pre-Foreclosure" checked={filters.isPreForeclosure} onChange={v => set('isPreForeclosure', v)} />
                  <CheckFilter label="Probate / Estate" checked={filters.isProbate} onChange={v => set('isProbate', v)} />
                  <CheckFilter label="Inherited" checked={filters.isInherited} onChange={v => set('isInherited', v)} />
                  <div className="space-y-1">
                    <Label className="text-xs">Auction Status</Label>
                    <Select value={filters.auctionStatus || 'any'} onValueChange={v => set('auctionStatus', v === 'any' ? null : v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Property */}
            <AccordionItem value="property" className="border-b-0">
              <AccordionTrigger className="text-xs font-semibold uppercase py-2">
                Property Type & Size
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <CheckFilter label="Vacant" checked={filters.isVacant} onChange={v => set('isVacant', v)} />
                  <div className="space-y-1">
                    <Label className="text-xs">Min Acreage</Label>
                    <Input type="number" step="0.1" placeholder="e.g. 1" className="h-7 text-xs"
                      value={filters.minAcreage ?? ''} onChange={e => set('minAcreage', e.target.value ? Number(e.target.value) : null)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Acreage</Label>
                    <Input type="number" step="0.1" placeholder="e.g. 100" className="h-7 text-xs"
                      value={filters.maxAcreage ?? ''} onChange={e => set('maxAcreage', e.target.value ? Number(e.target.value) : null)} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Scoring & Status */}
            <AccordionItem value="scoring" className="border-b-0">
              <AccordionTrigger className="text-xs font-semibold uppercase py-2">
                Scoring & Status
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Min Distress Score</Label>
                    <Input type="number" placeholder="e.g. 70" className="h-7 text-xs"
                      value={filters.minMotivation ?? ''} onChange={e => set('minMotivation', e.target.value ? Number(e.target.value) : null)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Min Buyer Match</Label>
                    <Input type="number" placeholder="e.g. 30" className="h-7 text-xs"
                      value={filters.minBuyerMatch ?? ''} onChange={e => set('minBuyerMatch', e.target.value ? Number(e.target.value) : null)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Min Opportunity</Label>
                    <Input type="number" placeholder="e.g. 50" className="h-7 text-xs"
                      value={filters.minOpportunity ?? ''} onChange={e => set('minOpportunity', e.target.value ? Number(e.target.value) : null)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Lead Temperature</Label>
                    <Select value={filters.leadTemperature || 'any'} onValueChange={v => set('leadTemperature', v === 'any' ? null : v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="Hot">🔥 Hot</SelectItem>
                        <SelectItem value="Warm">🟡 Warm</SelectItem>
                        <SelectItem value="Cold">❄️ Cold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Skip Trace Status</Label>
                    <Select value={filters.skipTraceStatus || 'any'} onValueChange={v => set('skipTraceStatus', v === 'any' ? null : v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="not_ready">Not Ready</SelectItem>
                        <SelectItem value="ready">Ready</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="complete">Complete</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </div>
  );
}

function CheckFilter({ label, checked, onChange }: {
  label: string;
  checked: boolean | null;
  onChange: (val: boolean | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={checked === true}
        onCheckedChange={(v) => onChange(v ? true : null)}
      />
      <Label className="text-xs cursor-pointer" onClick={() => onChange(checked ? null : true)}>{label}</Label>
    </div>
  );
}
