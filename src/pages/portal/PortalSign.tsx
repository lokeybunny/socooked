import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { PenTool, Type, CheckCircle, FileText, Receipt } from 'lucide-react';

export default function PortalSign() {
  const { threadId } = useParams<{ threadId: string }>();
  const [thread, setThread] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [invoice, setInvoice] = useState<any>(null);
  const [signed, setSigned] = useState(false);
  const [sigType, setSigType] = useState<'typed' | 'drawn'>('typed');
  const [typedName, setTypedName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!threadId) return;
      const { data: t } = await supabase.from('conversation_threads').select('*, customers(full_name, email)').eq('id', threadId).single();
      setThread(t);

      if (t) {
        const { data: docs } = await supabase.from('documents').select('*').eq('thread_id', threadId);
        setDocuments(docs || []);

        // Check if already signed
        const { data: sigs } = await supabase.from('signatures').select('*').eq('customer_id', t.customer_id);
        if (sigs && sigs.length > 0) setSigned(true);

        // Check for invoice
        const { data: inv } = await supabase.from('invoices').select('*').eq('customer_id', t.customer_id).order('created_at', { ascending: false }).limit(1);
        if (inv && inv.length > 0) setInvoice(inv[0]);
      }
      setLoading(false);
    };
    load();
  }, [threadId]);

  const getCanvasContext = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext('2d');
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const ctx = getCanvasContext();
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvasRef.current!.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const ctx = getCanvasContext();
    if (!ctx) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'hsl(var(--foreground))';
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const ctx = getCanvasContext();
    if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const handleSign = async () => {
    if (!thread) return;
    setSubmitting(true);

    const signatureData = sigType === 'typed'
      ? typedName
      : canvasRef.current?.toDataURL() || '';

    if (!signatureData) {
      toast.error('Please provide a signature');
      setSubmitting(false);
      return;
    }

    const contractDoc = documents.find(d => d.type === 'contract');
    if (!contractDoc) {
      toast.error('No contract found');
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from('signatures').insert([{
      document_id: contractDoc.id,
      customer_id: thread.customer_id,
      signer_name: thread.customers?.full_name || typedName,
      signer_email: thread.customers?.email || '',
      signature_type: sigType,
      signature_data: signatureData,
      ip_address: 'client-side',
      user_agent: navigator.userAgent,
    }]);

    if (error) {
      toast.error(error.message);
      setSubmitting(false);
      return;
    }

    // Update thread status
    await supabase.from('conversation_threads').update({ status: 'signed' }).eq('id', threadId);

    // Auto-create invoice
    const { data: newInvoice } = await supabase.from('invoices').insert([{
      customer_id: thread.customer_id,
      amount: 400,
      currency: 'USD',
      status: 'sent',
      provider: 'manual',
      sent_at: new Date().toISOString(),
    }]).select().single();

    if (newInvoice) setInvoice(newInvoice);

    // Update thread to invoiced
    await supabase.from('conversation_threads').update({ status: 'invoiced' }).eq('id', threadId);

    setSigned(true);
    setSubmitting(false);
    toast.success('Contract signed! Invoice generated.');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Loading...</div>;
  if (!thread) return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Thread not found.</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border p-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">SC</span>
          </div>
          <span className="font-semibold text-foreground">SOCooked CM — Client Portal</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Welcome, {thread.customers?.full_name}</h1>
          <p className="text-muted-foreground text-sm mt-1">Please review and sign your contract below.</p>
        </div>

        {/* Documents */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Your Documents</h2>
          {documents.map(doc => (
            <div key={doc.id} className="glass-card p-4 flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{doc.title}</p>
                <p className="text-xs text-muted-foreground capitalize">{doc.type} · {doc.status}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Signature */}
        {!signed ? (
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Sign Contract</h2>
            <Tabs value={sigType} onValueChange={(v) => setSigType(v as 'typed' | 'drawn')}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="typed"><Type className="h-3 w-3 mr-1" />Type</TabsTrigger>
                <TabsTrigger value="drawn"><PenTool className="h-3 w-3 mr-1" />Draw</TabsTrigger>
              </TabsList>
              <TabsContent value="typed" className="space-y-3">
                <Label>Full Legal Name</Label>
                <Input value={typedName} onChange={e => setTypedName(e.target.value)} placeholder="Type your full name" />
                {typedName && (
                  <div className="p-4 border border-border rounded-lg bg-card/50">
                    <p className="text-2xl font-serif italic text-foreground">{typedName}</p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="drawn" className="space-y-3">
                <Label>Draw your signature</Label>
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={150}
                  className="w-full border border-border rounded-lg bg-card/50 cursor-crosshair"
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                />
                <Button variant="ghost" size="sm" onClick={clearCanvas}>Clear</Button>
              </TabsContent>
            </Tabs>
            <Button className="w-full" onClick={handleSign} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Sign & Submit'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              By signing, you agree to the terms outlined in the contract. Timestamp: {new Date().toISOString()}
            </p>
          </div>
        ) : (
          <div className="glass-card p-6 text-center space-y-3">
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
            <h2 className="text-lg font-semibold text-foreground">Contract Signed!</h2>
            <p className="text-sm text-muted-foreground">Thank you for signing. Your invoice has been generated.</p>
          </div>
        )}

        {/* Invoice */}
        {invoice && (
          <div className="glass-card p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Invoice</h2>
            </div>
            <div className="flex justify-between items-center">
              <div>
                <p className="text-lg font-bold text-foreground">${Number(invoice.amount).toFixed(2)} {invoice.currency}</p>
                <p className="text-xs text-muted-foreground capitalize">Status: {invoice.status}</p>
              </div>
              {invoice.status !== 'paid' && (
                <Button variant="outline" size="sm" disabled>Payment Link (Coming Soon)</Button>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-border p-4 mt-8">
        <div className="max-w-2xl mx-auto text-center">
          <a href="https://stu25.com" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
            ← Back to stu25.com
          </a>
        </div>
      </footer>
    </div>
  );
}
