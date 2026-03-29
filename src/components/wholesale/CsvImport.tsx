/**
 * CSV Import for Seller/Property Records
 * 
 * Allows users to upload CSV files containing property data.
 * Maps columns to the lw_sellers schema, previews records,
 * and inserts with source='csv_import' and import_batch_id.
 */
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Upload, FileSpreadsheet, Loader2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

const SELLER_FIELDS = [
  { key: 'skip', label: '— Skip —' },
  { key: 'owner_name', label: 'Owner Name' },
  { key: 'owner_phone', label: 'Owner Phone' },
  { key: 'owner_email', label: 'Owner Email' },
  { key: 'owner_mailing_address', label: 'Mailing Address' },
  { key: 'address_full', label: 'Property Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP' },
  { key: 'county', label: 'County' },
  { key: 'apn', label: 'APN / Parcel ID' },
  { key: 'acreage', label: 'Acreage' },
  { key: 'lot_sqft', label: 'Lot Sqft' },
  { key: 'property_type', label: 'Property Type' },
  { key: 'zoning', label: 'Zoning' },
  { key: 'market_value', label: 'Market Value' },
  { key: 'assessed_value', label: 'Assessed Value' },
  { key: 'asking_price', label: 'Asking Price' },
  { key: 'bedrooms', label: 'Bedrooms' },
  { key: 'bathrooms', label: 'Bathrooms' },
  { key: 'living_sqft', label: 'Living Sqft' },
  { key: 'years_owned', label: 'Years Owned' },
  { key: 'equity_percent', label: 'Equity %' },
  { key: 'notes', label: 'Notes' },
];

// Auto-detect column mapping from header names
function autoMapColumn(header: string): string {
  const h = header.toLowerCase().replace(/[_\-\s]+/g, ' ').trim();
  const mappings: [RegExp, string][] = [
    [/owner.*name|seller.*name|full.*name/i, 'owner_name'],
    [/owner.*phone|phone.*number|phone/i, 'owner_phone'],
    [/owner.*email|email/i, 'owner_email'],
    [/mail.*addr|mailing/i, 'owner_mailing_address'],
    [/property.*addr|address|street/i, 'address_full'],
    [/\bcity\b/i, 'city'],
    [/\bstate\b/i, 'state'],
    [/\bzip\b|postal/i, 'zip'],
    [/\bcounty\b/i, 'county'],
    [/\bapn\b|parcel/i, 'apn'],
    [/\bacre/i, 'acreage'],
    [/lot.*sq/i, 'lot_sqft'],
    [/prop.*type|property.*type/i, 'property_type'],
    [/\bzone|zoning/i, 'zoning'],
    [/market.*val/i, 'market_value'],
    [/assess.*val/i, 'assessed_value'],
    [/ask.*price|list.*price/i, 'asking_price'],
    [/\bbed/i, 'bedrooms'],
    [/\bbath/i, 'bathrooms'],
    [/living.*sq|sq.*ft/i, 'living_sqft'],
    [/year.*own/i, 'years_owned'],
    [/equity/i, 'equity_percent'],
    [/\bnote/i, 'notes'],
  ];
  for (const [regex, field] of mappings) {
    if (regex.test(h)) return field;
  }
  return 'skip';
}

interface CsvImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  dealType?: string;
}

export default function CsvImport({ open, onOpenChange, onImported, dealType = 'land' }: CsvImportProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast.error('CSV needs at least a header row and one data row'); return; }

      // Simple CSV parse (handles quoted fields)
      const parseLine = (line: string) => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { inQuotes = !inQuotes; continue; }
          if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
          current += ch;
        }
        result.push(current.trim());
        return result;
      };

      const hdrs = parseLine(lines[0]);
      const dataRows = lines.slice(1).map(parseLine).filter(r => r.some(c => c));

      setHeaders(hdrs);
      setRows(dataRows.slice(0, 500)); // limit preview
      setMapping(hdrs.map(h => autoMapColumn(h)));
      setResult(null);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    const batchId = `csv_${Date.now()}`;
    let inserted = 0;
    let skipped = 0;

    const BATCH_SIZE = 50;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const records = batch.map(row => {
        const rec: any = {
          source: 'csv_import',
          import_batch_id: batchId,
          deal_type: dealType === 'home' ? 'home' : 'land',
          status: 'new',
          meta: {},
        };
        mapping.forEach((field, idx) => {
          if (field === 'skip' || !row[idx]) return;
          const val = row[idx];
          if (['acreage', 'lot_sqft', 'market_value', 'assessed_value', 'asking_price', 'bedrooms', 'bathrooms', 'living_sqft', 'years_owned', 'equity_percent'].includes(field)) {
            const num = parseFloat(val.replace(/[$,]/g, ''));
            if (!isNaN(num)) rec[field] = num;
          } else {
            rec[field] = val;
          }
        });
        return rec;
      }).filter(r => r.address_full || r.owner_name || r.apn); // need at least one identifying field

      if (records.length === 0) { skipped += batch.length; continue; }

      const { error } = await supabase.from('lw_sellers').insert(records);
      if (error) {
        console.error('CSV import batch error:', error);
        skipped += records.length;
      } else {
        inserted += records.length;
      }
    }

    // Log ingestion run
    await supabase.from('lw_ingestion_runs').insert({
      run_type: 'csv_import',
      source: 'csv',
      records_fetched: rows.length,
      records_new: inserted,
      credits_used: 0,
      params: { batch_id: batchId, headers, mapping },
      status: 'completed',
    });

    setResult({ inserted, skipped });
    setImporting(false);
    if (inserted > 0) {
      toast.success(`Imported ${inserted} records${skipped > 0 ? `, ${skipped} skipped` : ''}`);
      onImported();
    } else {
      toast.error('No records imported');
    }
  };

  const reset = () => {
    setHeaders([]);
    setRows([]);
    setMapping([]);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Seller Leads from CSV
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="text-center py-8 space-y-3">
            <Check className="h-10 w-10 mx-auto text-green-500" />
            <p className="text-lg font-semibold">{result.inserted} records imported</p>
            {result.skipped > 0 && <p className="text-sm text-muted-foreground">{result.skipped} rows skipped</p>}
            <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
          </div>
        ) : headers.length === 0 ? (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-3">Upload a CSV file with property/seller data</p>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
              <Button onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Choose CSV File
              </Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Expected columns (auto-detected):</p>
              <p>Owner Name, Phone, Email, Property Address, City, State, ZIP, County, APN, Acreage, Property Type, Market Value, etc.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm">
                <Badge variant="outline">{rows.length}</Badge> rows found, <Badge variant="outline">{headers.length}</Badge> columns
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={reset}>Reset</Button>
                <Button size="sm" onClick={handleImport} disabled={importing}>
                  {importing ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Importing…</> : `Import ${rows.length} Records`}
                </Button>
              </div>
            </div>

            {/* Column Mapping */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Column Mapping</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {headers.map((header, i) => (
                    <div key={i} className="space-y-1">
                      <p className="text-[10px] text-muted-foreground truncate" title={header}>{header}</p>
                      <Select value={mapping[i]} onValueChange={v => {
                        const newMap = [...mapping];
                        newMap[i] = v;
                        setMapping(newMap);
                      }}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SELLER_FIELDS.map(f => (
                            <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Preview */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Preview (first 5 rows)</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map((h, i) => (
                        <TableHead key={i} className="text-[10px] whitespace-nowrap">
                          {mapping[i] !== 'skip' ? (
                            <Badge variant="default" className="text-[9px]">{SELLER_FIELDS.find(f => f.key === mapping[i])?.label}</Badge>
                          ) : (
                            <span className="text-muted-foreground">{h}</span>
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 5).map((row, ri) => (
                      <TableRow key={ri}>
                        {row.map((cell, ci) => (
                          <TableCell key={ci} className={`text-xs whitespace-nowrap ${mapping[ci] === 'skip' ? 'opacity-30' : ''}`}>
                            {cell.length > 30 ? cell.slice(0, 28) + '…' : cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
