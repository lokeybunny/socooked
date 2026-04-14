import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  Search, Download, Send, Loader2, MapPin, Phone, Star,
  Bot, User, Sparkles, ExternalLink, Plus, FolderOpen,
  PhoneOff, Zap, Trash2, Edit2, Check, ChevronDown, ChevronUp, Save,
} from 'lucide-react';
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

interface SavedList {
  id: string;
  name: string;
  lead_count: number;
  status: string;
  created_at: string;
  meta: any;
}

interface SavedItem {
  id: string;
  phone: string;
  name: string | null;
  address: string | null;
  rating: number | null;
  review_count: number | null;
  negative_review: string | null;
  website: string | null;
  gmaps_url: string | null;
  category_name: string | null;
}

// Normalize phone to +1XXXXXXXXXX
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return normalized.length === 10 ? `+1${normalized}` : raw;
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

  // Saved lists state
  const [savedLists, setSavedLists] = useState<SavedList[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [expandedListId, setExpandedListId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<SavedItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingList, setSavingList] = useState(false);
  const [pushingToPD, setPushingToPD] = useState<string | null>(null);
  const [showSavedPanel, setShowSavedPanel] = useState(false);

  // DNC state
  const [dncPhones, setDncPhones] = useState<Set<string>>(new Set());
  const [showDNC, setShowDNC] = useState(false);
  const [dncEntries, setDncEntries] = useState<{ phone: string; reason: string; call_count: number; last_called_at: string | null }[]>([]);

  // Selected rows for saving
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load saved lists and DNC registry on mount
  useEffect(() => {
    loadSavedLists();
    loadDNCRegistry();
  }, []);

  const loadSavedLists = async () => {
    setLoadingLists(true);
    const { data } = await supabase
      .from('lh_saved_lists')
      .select('*')
      .order('created_at', { ascending: false });
    setSavedLists((data as SavedList[]) || []);
    setLoadingLists(false);
  };

  const loadDNCRegistry = async () => {
    const { data } = await supabase.from('lh_dnc_registry').select('phone, reason, call_count, last_called_at');
    if (data) {
      setDncPhones(new Set(data.map(d => d.phone)));
      setDncEntries(data);
    }
  };

  const loadListItems = async (listId: string) => {
    if (expandedListId === listId) {
      setExpandedListId(null);
      return;
    }
    setLoadingItems(true);
    setExpandedListId(listId);
    const { data } = await supabase
      .from('lh_saved_list_items')
      .select('*')
      .eq('list_id', listId)
      .order('created_at', { ascending: true });
    setExpandedItems((data as SavedItem[]) || []);
    setLoadingItems(false);
  };

  // ─── SEARCH ───
  const handleSearch = async () => {
    const q = input.trim();
    if (!q || searching) return;
    setInput('');
    setSearching(true);
    setSelectedRows(new Set());

    setMessages(prev => [
      ...prev,
      { role: 'user', content: q },
      { role: 'assistant', content: 'Parsing your request and launching Apify scraper...', loading: true },
    ]);

    try {
      const { data, error } = await supabase.functions.invoke('lead-hunter', { body: { query: q } });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      const businesses: Business[] = data.businesses || [];
      const parsed = data.parsed;
      setCurrentResults(businesses);

      setMessages(prev => {
        const updated = [...prev];
        updated.pop();
        updated.push({
          role: 'assistant',
          content: businesses.length > 0
            ? `✅ Found **${businesses.length}** businesses matching your criteria.\n\n📍 Location: ${parsed.location}\n🔍 Search: ${parsed.searchTerms.join(', ')}\n⭐ Rating filter: ${parsed.minRating || 'any'}–${parsed.maxRating || 'any'} stars\n\nResults are shown in the table below. Select leads and save them to a list, or push directly to the Power Dialer.`
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

  // ─── EXPORT CSV ───
  const handleExportCSV = () => {
    if (currentResults.length === 0) return;
    const headers = ['Name', 'Phone', 'Address', 'Rating', 'Reviews', 'Negative Review', 'Website', 'Google Maps URL', 'Category', 'DNC Status'];
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
      b.phone && dncPhones.has(normalizePhone(b.phone)) ? 'DNC' : 'Clear',
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

  // ─── SEND TO CRM ───
  const handleSendToCRM = async () => {
    if (currentResults.length === 0 || sendingToCRM) return;
    setSendingToCRM(true);
    let created = 0, skipped = 0;

    for (const biz of currentResults) {
      if (!biz.name || biz.name === 'Unknown Business') { skipped++; continue; }
      if (biz.phone) {
        const { data: existing } = await supabase.from('customers').select('id').eq('phone', biz.phone).limit(1);
        if (existing && existing.length > 0) { skipped++; continue; }
      }
      const { error } = await supabase.from('customers').insert({
        full_name: biz.name, phone: biz.phone, company: biz.name, status: 'lead',
        source: 'lead-hunter-pro', category: 'potential', address: biz.address || null,
        notes: [
          `Rating: ${biz.rating}/5 (${biz.reviewCount} reviews)`,
          biz.categoryName && `Category: ${biz.categoryName}`,
          biz.negativeReview && `Negative Review: ${biz.negativeReview}`,
          biz.website && `Website: ${biz.website}`,
        ].filter(Boolean).join('\n'),
        meta: { gmaps_url: biz.gmapsUrl, gmaps_rating: biz.rating, gmaps_review_count: biz.reviewCount, website: biz.website, source_platform: 'lead-hunter-pro' },
      });
      if (!error) created++; else skipped++;
    }

    setSendingToCRM(false);
    toast.success(`Sent ${created} leads to CRM (${skipped} duplicates skipped)`);
    setMessages(prev => [...prev, { role: 'assistant', content: `📤 **CRM Import Complete**\n\n✅ ${created} new leads added\n⏭️ ${skipped} duplicates skipped` }]);
  };

  // ─── SAVE TO LIST ───
  const handleSaveToList = async (existingListId?: string) => {
    const leadsToSave = selectedRows.size > 0
      ? currentResults.filter((_, i) => selectedRows.has(i))
      : currentResults;

    const withPhone = leadsToSave.filter(b => b.phone);
    if (withPhone.length === 0) { toast.error('No leads with phone numbers to save'); return; }

    setSavingList(true);
    try {
      let listId = existingListId;

      if (!listId) {
        const { data: session } = await supabase.auth.getSession();
        const userId = session?.session?.user?.id;
        if (!userId) throw new Error('Not authenticated');

        const listName = `Scrape ${new Date().toLocaleDateString()} — ${withPhone.length} leads`;
        const { data: newList, error: listErr } = await supabase
          .from('lh_saved_lists')
          .insert({ name: listName, created_by: userId, lead_count: withPhone.length })
          .select()
          .single();
        if (listErr) throw listErr;
        listId = newList.id;
      }

      const items = withPhone.map(b => ({
        list_id: listId!,
        phone: normalizePhone(b.phone!),
        name: b.name,
        address: b.address || null,
        rating: b.rating,
        review_count: b.reviewCount,
        negative_review: b.negativeReview || null,
        website: b.website,
        gmaps_url: b.gmapsUrl,
        category_name: b.categoryName,
      }));

      const { error: insertErr } = await supabase.from('lh_saved_list_items').insert(items);
      if (insertErr) throw insertErr;

      if (existingListId) {
        // Update lead count
        const { data: countData } = await supabase
          .from('lh_saved_list_items')
          .select('id', { count: 'exact', head: true })
          .eq('list_id', existingListId);
        // We'll just reload
      }

      toast.success(`Saved ${withPhone.length} leads to list`);
      loadSavedLists();
      setSelectedRows(new Set());
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingList(false);
    }
  };

  // ─── PUSH TO POWER DIALER ───
  const handlePushToPowerDial = async (listId: string, listName: string) => {
    setPushingToPD(listId);
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      if (!userId) throw new Error('Not authenticated');

      // Get items for this list
      const { data: items, error: itemErr } = await supabase
        .from('lh_saved_list_items')
        .select('*')
        .eq('list_id', listId);
      if (itemErr) throw itemErr;
      if (!items || items.length === 0) throw new Error('No leads in this list');

      // Filter out DNC phones
      const callableItems = items.filter(item => !dncPhones.has(item.phone));
      const dncSkipped = items.length - callableItems.length;

      if (callableItems.length === 0) {
        toast.error('All leads in this list are on the Do Not Call list');
        setPushingToPD(null);
        return;
      }

      // Create a PowerDial campaign
      const { data: campaign, error: campErr } = await supabase
        .from('powerdial_campaigns')
        .insert({
          name: `LH: ${listName}`,
          created_by: userId,
          total_leads: callableItems.length,
          status: 'pending',
        })
        .select()
        .single();
      if (campErr) throw campErr;

      // Insert queue items
      const queueItems = callableItems.map((item, i) => ({
        campaign_id: campaign.id,
        phone: item.phone,
        contact_name: item.name,
        position: i,
        status: 'pending',
      }));

      // Batch insert in chunks of 50
      for (let i = 0; i < queueItems.length; i += 50) {
        const chunk = queueItems.slice(i, i + 50);
        const { error: qErr } = await supabase.from('powerdial_queue').insert(chunk);
        if (qErr) throw qErr;
      }

      // Mark list as pushed
      await supabase.from('lh_saved_lists').update({ status: 'pushed_to_pd', meta: { campaign_id: campaign.id } }).eq('id', listId);

      toast.success(`🚀 ${callableItems.length} leads pushed to Power Dialer campaign "${campaign.name}"${dncSkipped > 0 ? ` (${dncSkipped} DNC skipped)` : ''}`);
      loadSavedLists();

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `🚀 **Pushed to Power Dialer**\n\n📋 Campaign: "${campaign.name}"\n✅ ${callableItems.length} callable leads queued\n${dncSkipped > 0 ? `🚫 ${dncSkipped} leads skipped (DNC list)\n` : ''}⚡ Head to the Power Dialer to start dialing!`,
      }]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPushingToPD(null);
    }
  };

  // ─── DELETE LIST ───
  const handleDeleteList = async (listId: string) => {
    await supabase.from('lh_saved_lists').delete().eq('id', listId);
    toast.success('List deleted');
    if (expandedListId === listId) setExpandedListId(null);
    loadSavedLists();
  };

  // ─── RENAME LIST ───
  const handleRenameList = async (listId: string) => {
    if (!editingName.trim()) return;
    await supabase.from('lh_saved_lists').update({ name: editingName.trim() }).eq('id', listId);
    setEditingListId(null);
    loadSavedLists();
  };

  // ─── DELETE ITEM FROM LIST ───
  const handleDeleteItem = async (itemId: string) => {
    await supabase.from('lh_saved_list_items').delete().eq('id', itemId);
    setExpandedItems(prev => prev.filter(i => i.id !== itemId));
    toast.success('Lead removed from list');
  };

  // ─── TOGGLE SELECTION ───
  const toggleRow = (idx: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedRows.size === currentResults.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(currentResults.map((_, i) => i)));
    }
  };

  const isDNC = (phone: string | null) => phone ? dncPhones.has(normalizePhone(phone)) : false;

  return (
    <div className="space-y-4">
      {/* Chat Messages */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-500" />
            Lead Hunter Pro
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setShowSavedPanel(!showSavedPanel); setShowDNC(false); }} className="text-xs gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" /> Saved Lists ({savedLists.length})
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowDNC(!showDNC); setShowSavedPanel(false); }} className="text-xs gap-1.5">
                <PhoneOff className="h-3.5 w-3.5" /> DNC ({dncPhones.size})
              </Button>
            </div>
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
                  msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-foreground',
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

      {/* ─── DNC PANEL ─── */}
      {showDNC && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-red-400">
              <PhoneOff className="h-4 w-4" /> Do Not Call Registry ({dncEntries.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dncEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">No DNC entries yet. Numbers are added here after 2 failed call attempts via Power Dialer.</p>
            ) : (
              <div className="max-h-[250px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Phone</TableHead>
                      <TableHead className="text-xs">Reason</TableHead>
                      <TableHead className="text-xs">Calls</TableHead>
                      <TableHead className="text-xs">Last Called</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dncEntries.map((entry, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-mono">{entry.phone}</TableCell>
                        <TableCell><Badge variant="destructive" className="text-[10px]">{entry.reason}</Badge></TableCell>
                        <TableCell className="text-xs">{entry.call_count}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{entry.last_called_at ? new Date(entry.last_called_at).toLocaleDateString() : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── SAVED LISTS PANEL ─── */}
      {showSavedPanel && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-400">
              <FolderOpen className="h-4 w-4" /> Saved Lead Lists
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingLists ? (
              <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : savedLists.length === 0 ? (
              <p className="text-xs text-muted-foreground">No saved lists yet. Run a search and save leads to create one.</p>
            ) : (
              savedLists.map(list => (
                <div key={list.id} className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                    <button onClick={() => loadListItems(list.id)} className="flex-1 text-left flex items-center gap-2 min-w-0">
                      {expandedListId === list.id ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                      {editingListId === list.id ? (
                        <Input
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleRenameList(list.id)}
                          className="h-6 text-xs"
                          onClick={e => e.stopPropagation()}
                          autoFocus
                        />
                      ) : (
                        <span className="text-sm font-medium truncate">{list.name}</span>
                      )}
                    </button>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{list.lead_count} leads</Badge>
                    {list.status === 'pushed_to_pd' && <Badge className="text-[10px] bg-purple-500/20 text-purple-400 shrink-0">⚡ In PD</Badge>}
                    <div className="flex gap-1 shrink-0">
                      {editingListId === list.id ? (
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleRenameList(list.id)}>
                          <Check className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setEditingListId(list.id); setEditingName(list.name); }}>
                          <Edit2 className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-purple-400 hover:text-purple-300"
                        disabled={pushingToPD === list.id}
                        onClick={() => handlePushToPowerDial(list.id, list.name)}
                        title="Push to Power Dialer"
                      >
                        {pushingToPD === list.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      </Button>
                      {currentResults.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-emerald-400 hover:text-emerald-300"
                          onClick={() => handleSaveToList(list.id)}
                          title="Add current results to this list"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-300" onClick={() => handleDeleteList(list.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded items */}
                  {expandedListId === list.id && (
                    <div className="border-t border-border max-h-[250px] overflow-auto">
                      {loadingItems ? (
                        <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                      ) : expandedItems.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-3">No leads in this list</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-[10px]">Name</TableHead>
                              <TableHead className="text-[10px]">Phone</TableHead>
                              <TableHead className="text-[10px]">Rating</TableHead>
                              <TableHead className="text-[10px]">Status</TableHead>
                              <TableHead className="text-[10px] w-8"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {expandedItems.map(item => (
                              <TableRow key={item.id} className={cn(isDNC(item.phone) && 'opacity-50 bg-red-500/5')}>
                                <TableCell className="text-xs">{item.name || '—'}</TableCell>
                                <TableCell className="text-xs font-mono">{item.phone}</TableCell>
                                <TableCell className="text-xs">{item.rating ? `${item.rating}⭐` : '—'}</TableCell>
                                <TableCell>
                                  {isDNC(item.phone) ? (
                                    <Badge variant="destructive" className="text-[10px]">DNC</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px]">Clear</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400" onClick={() => handleDeleteItem(item.id)}>
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {currentResults.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={handleSendToCRM} disabled={sendingToCRM} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 text-base px-6 py-5">
            {sendingToCRM ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            Send to Amplify CRM
          </Button>
          <Button variant="outline" onClick={handleExportCSV} className="gap-2 text-base px-6 py-5">
            <Download className="h-5 w-5" /> Export as CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSaveToList()}
            disabled={savingList}
            className="gap-2 text-base px-6 py-5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
          >
            {savingList ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            {selectedRows.size > 0 ? `Save ${selectedRows.size} Selected` : 'Save All to List'}
          </Button>
          <span className="text-sm text-muted-foreground ml-auto">
            {selectedRows.size > 0 ? `${selectedRows.size} selected · ` : ''}{currentResults.length} results
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
                    <TableHead className="sticky top-0 bg-background z-10 w-10">
                      <input type="checkbox" checked={selectedRows.size === currentResults.length && currentResults.length > 0} onChange={toggleAll} className="rounded" />
                    </TableHead>
                    <TableHead className="sticky top-0 bg-background z-10">Business Name</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10">Phone</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10">Address</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10">Rating</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10">Reviews</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10">Status</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 min-w-[200px]">Negative Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentResults.map((biz, i) => {
                    const phoneIsDNC = isDNC(biz.phone);
                    return (
                      <TableRow key={i} className={cn(phoneIsDNC && 'opacity-50 bg-red-500/5', selectedRows.has(i) && 'bg-blue-500/5')}>
                        <TableCell>
                          <input type="checkbox" checked={selectedRows.has(i)} onChange={() => toggleRow(i)} className="rounded" />
                        </TableCell>
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
                          {phoneIsDNC ? (
                            <Badge variant="destructive" className="text-[10px] gap-1"><PhoneOff className="h-2.5 w-2.5" /> DNC</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Clear</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {biz.negativeReview ? (
                            <span className="text-xs text-red-400 line-clamp-2">"{biz.negativeReview}"</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No negative reviews found</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
