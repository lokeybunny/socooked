import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Search, Download, Send, Loader2, MapPin, Phone, Star, MessageSquare, Bot, User, Sparkles, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Business {
  name: string;
  phone: string | null;
  address: string;
  rating: number;
  reviewCount: number;
  negativeReview: string;
  website: string | null;
  gmapsUrl: string | null;
  categories: string[];
  categoryName: string | null;
  imageUrl: string | null;
  placeId: string | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  businesses?: Business[];
  parsed?: { searchTerms: string[]; location: string; maxItems: number; maxRating: number | null; minRating: number | null };
  loading?: boolean;
}

export function LeadHunterPro() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '🎯 **Lead Hunter Pro** ready. Tell me what businesses you want to find.\n\nExamples:\n• "Find 300 Las Vegas businesses with 2-3 star Google ratings"\n• "Get me 250 poor-rated restaurants in Henderson"\n• "Scrape senior care businesses in Las Vegas with bad reviews"',
    },
  ]);
  const [input, setInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [currentResults, setCurrentResults] = useState<Business[]>([]);
  const [sendingToCRM, setSendingToCRM] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSearch = async () => {
    const q = input.trim();
    if (!q || searching) return;
    setInput('');
    setSearching(true);

    setMessages(prev => [
      ...prev,
      { role: 'user', content: q },
      { role: 'assistant', content: 'Parsing your request and launching Apify scraper...', loading: true },
    ]);

    try {
      const { data, error } = await supabase.functions.invoke('lead-hunter', {
        body: { query: q },
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      const businesses: Business[] = data.businesses || [];
      const parsed = data.parsed;

      setCurrentResults(businesses);

      setMessages(prev => {
        const updated = [...prev];
        updated.pop(); // remove loading message
        updated.push({
          role: 'assistant',
          content: businesses.length > 0
            ? `✅ Found **${businesses.length}** businesses matching your criteria.\n\n📍 Location: ${parsed.location}\n🔍 Search: ${parsed.searchTerms.join(', ')}\n⭐ Rating filter: ${parsed.minRating || 'any'}–${parsed.maxRating || 'any'} stars\n\nResults are shown in the table below.`
            : `No businesses found matching that criteria. Try broadening your search terms or location.`,
          businesses,
          parsed,
        });
        return updated;
      });
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev];
        updated.pop();
        updated.push({ role: 'assistant', content: `❌ Error: ${err.message}` });
        return updated;
      });
      toast.error(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleExportCSV = () => {
    if (currentResults.length === 0) return;
    const headers = ['Name', 'Phone', 'Address', 'Rating', 'Reviews', 'Negative Review', 'Website', 'Google Maps URL', 'Category'];
    const rows = currentResults.map(b => [
      b.name,
      b.phone || '',
      b.address,
      String(b.rating),
      String(b.reviewCount),
      `"${(b.negativeReview || '').replace(/"/g, '""')}"`,
      b.website || '',
      b.gmapsUrl || '',
      b.categoryName || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lead-hunter-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${currentResults.length} leads as CSV`);
  };

  const handleSendToCRM = async () => {
    if (currentResults.length === 0 || sendingToCRM) return;
    setSendingToCRM(true);
    let created = 0;
    let skipped = 0;

    for (const biz of currentResults) {
      if (!biz.name || biz.name === 'Unknown Business') { skipped++; continue; }

      // Deduplicate by phone
      if (biz.phone) {
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', biz.phone)
          .limit(1);
        if (existing && existing.length > 0) { skipped++; continue; }
      }

      const { error } = await supabase.from('customers').insert({
        full_name: biz.name,
        phone: biz.phone,
        company: biz.name,
        status: 'lead',
        source: 'lead-hunter-pro',
        category: 'potential',
        address: biz.address || null,
        notes: [
          `Rating: ${biz.rating}/5 (${biz.reviewCount} reviews)`,
          biz.categoryName && `Category: ${biz.categoryName}`,
          biz.negativeReview && `Negative Review: ${biz.negativeReview}`,
          biz.website && `Website: ${biz.website}`,
        ].filter(Boolean).join('\n'),
        meta: {
          gmaps_url: biz.gmapsUrl,
          gmaps_rating: biz.rating,
          gmaps_review_count: biz.reviewCount,
          gmaps_categories: biz.categories,
          website: biz.website,
          phone: biz.phone,
          address: biz.address,
          source_platform: 'lead-hunter-pro',
        },
      });

      if (!error) created++;
      else skipped++;
    }

    setSendingToCRM(false);
    toast.success(`Sent ${created} leads to CRM (${skipped} duplicates skipped)`);

    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: `📤 **CRM Import Complete**\n\n✅ ${created} new leads added\n⏭️ ${skipped} duplicates skipped`,
      },
    ]);
  };

  return (
    <div className="space-y-4">
      {/* Chat Messages */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-500" />
            Lead Hunter Pro
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[300px] overflow-y-auto px-4 pb-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                {msg.role === 'assistant' && (
                  <div className="h-7 w-7 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-blue-500" />
                  </div>
                )}
                <div className={cn(
                  'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-foreground',
                  msg.loading && 'animate-pulse'
                )}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
                {msg.role === 'user' && (
                  <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border px-4 py-3 flex gap-2">
            <Input
              placeholder='e.g. "Find 300 Las Vegas businesses with 2-3 star ratings"'
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              disabled={searching}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={searching || !input.trim()} size="sm">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      {currentResults.length > 0 && (
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSendToCRM}
            disabled={sendingToCRM}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 text-base px-6 py-5"
          >
            {sendingToCRM ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            Send to Amplify CRM
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="gap-2 text-base px-6 py-5"
          >
            <Download className="h-5 w-5" /> Export as CSV
          </Button>
          <span className="text-sm text-muted-foreground ml-auto">
            {currentResults.length} results
          </span>
        </div>
      )}

      {/* Results Table */}
      {currentResults.length > 0 && (
        <Card className="border-border">
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 bg-background z-10">Business Name</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10">Phone</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10">Address</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10">Rating</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10">Reviews</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 min-w-[200px]">Negative Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentResults.map((biz, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-[200px]">{biz.name}</span>
                          {biz.gmapsUrl && (
                            <a href={biz.gmapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400 shrink-0">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {biz.phone ? (
                          <a href={`tel:${biz.phone}`} className="flex items-center gap-1 text-foreground hover:text-primary">
                            <Phone className="h-3 w-3" /> {biz.phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-xs">
                          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[180px]">{biz.address || 'N/A'}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1">
                          <Star className={cn('h-3.5 w-3.5', biz.rating <= 2 ? 'text-red-500' : biz.rating <= 3 ? 'text-yellow-500' : 'text-emerald-500')} />
                          <span className="font-semibold">{biz.rating}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{biz.reviewCount}</TableCell>
                      <TableCell>
                        {biz.negativeReview ? (
                          <span className="text-xs text-red-400 line-clamp-2">"{biz.negativeReview}"</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No negative reviews found</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
