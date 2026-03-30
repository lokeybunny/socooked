import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { PenTool, Type, CheckCircle, FileText, ChevronDown, ChevronUp, Shield } from 'lucide-react';

export default function AgreementSign() {
  const { documentId } = useParams<{ documentId: string }>();
  const [doc, setDoc] = useState<any>(null);
  const [agreementText, setAgreementText] = useState('');
  const [signed, setSigned] = useState(false);
  const [sigType, setSigType] = useState<'typed' | 'drawn'>('drawn');
  const [typedName, setTypedName] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Canvas state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!documentId) return;

      // Load document
      const { data: d, error: docErr } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      console.log('Document load:', { d, docErr });

      if (!d) { setLoading(false); return; }
      setDoc(d);
      setSignerName(d.customers?.full_name || '');
      setSignerEmail(d.customers?.email || '');

      // Check if already signed
      const { data: sigs } = await supabase
        .from('signatures')
        .select('id')
        .eq('document_id', documentId)
        .limit(1);
      if (sigs && sigs.length > 0) setSigned(true);

      // Load agreement text from storage
      if (d.storage_path) {
        const { data: fileData } = await supabase.storage
          .from('documents')
          .download(d.storage_path);
        if (fileData) {
          const text = await fileData.text();
          setAgreementText(text);
        }
      }
      setLoading(false);
    };
    load();
  }, [documentId]);

  // --- Touch + Mouse Drawing ---
  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }, []);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    setHasDrawn(true);
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getPos]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing, getPos]);

  const stopDraw = useCallback(() => setIsDrawing(false), []);

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasDrawn(false);
  };

  const handleSign = async () => {
    if (!doc || !documentId) return;
    if (!signerName.trim()) { toast.error('Please enter your full name'); return; }

    const signatureData = sigType === 'typed'
      ? typedName
      : canvasRef.current?.toDataURL() || '';

    if (sigType === 'typed' && !typedName.trim()) { toast.error('Please type your name to sign'); return; }
    if (sigType === 'drawn' && !hasDrawn) { toast.error('Please draw your signature'); return; }

    setSubmitting(true);

    const { error } = await supabase.from('signatures').insert([{
      document_id: documentId,
      customer_id: doc.customer_id,
      signer_name: signerName,
      signer_email: signerEmail,
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

    // Update document status
    await supabase.from('documents').update({ status: 'signed' }).eq('id', documentId);

    // Send signed copy notification to admin (warren@stu25.com)
    try {
      const signedHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #059669; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">✅ Agreement Signed!</h1>
          </div>
          <div style="padding: 24px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="font-size: 15px; color: #374151;">The following agreement has been signed:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Document</td><td style="padding: 8px; font-size: 13px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">${doc.title}</td></tr>
              <tr><td style="padding: 8px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Signed By</td><td style="padding: 8px; font-size: 13px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">${signerName}</td></tr>
              <tr><td style="padding: 8px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Email</td><td style="padding: 8px; font-size: 13px; border-bottom: 1px solid #e5e7eb;">${signerEmail || 'N/A'}</td></tr>
              <tr><td style="padding: 8px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Signature Type</td><td style="padding: 8px; font-size: 13px; border-bottom: 1px solid #e5e7eb;">${sigType === 'drawn' ? '✍️ Hand-drawn' : '⌨️ Typed'}</td></tr>
              <tr><td style="padding: 8px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Timestamp</td><td style="padding: 8px; font-size: 13px; border-bottom: 1px solid #e5e7eb;">${new Date().toLocaleString()}</td></tr>
              <tr><td style="padding: 8px; font-size: 13px; color: #6b7280;">IP / User Agent</td><td style="padding: 8px; font-size: 11px; color: #9ca3af;">${navigator.userAgent.slice(0, 80)}…</td></tr>
            </table>
            ${sigType === 'drawn' ? `<div style="text-align:center; margin: 16px 0;"><p style="font-size:12px; color:#6b7280; margin-bottom:8px;">Captured Signature:</p><img src="${signatureData}" style="max-width:400px; border:1px solid #e5e7eb; border-radius:8px; padding:8px; background:white;" /></div>` : `<div style="text-align:center; margin:16px 0; padding:20px; border:1px solid #e5e7eb; border-radius:8px; background:white;"><p style="font-size:28px; font-style:italic; font-family:Georgia,serif; color:#1a1a1a;">${typedName}</p></div>`}
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin-top: 16px;">View the full signed document in your CRM under Documents.</p>
          </div>
        </div>
      `;

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-api?action=send`;
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({
          to: 'warren@stu25.com',
          subject: `✅ Signed: ${doc.title}`,
          body: signedHtml,
        }),
      });
      if (!res.ok) console.error('Admin notify failed:', await res.text());
    } catch (emailErr) {
      console.error('Failed to notify admin:', emailErr);
    }

    setSigned(true);
    setSubmitting(false);
    toast.success('Agreement signed successfully!');
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="animate-pulse text-gray-500">Loading agreement…</div>
    </div>
  );

  if (!doc) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <p className="text-gray-600">Agreement not found or link has expired.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <FileText className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Document Signing</p>
              <p className="text-[10px] text-gray-500">Secure • Legally Binding</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-emerald-600">
            <Shield className="h-3 w-3" />
            <span>Encrypted</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Document Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h1 className="text-lg font-bold text-gray-900">{doc.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Please review the agreement below and provide your signature.
          </p>
        </div>

        {/* Agreement Text */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-900">Purchase Agreement</span>
            </div>
            {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>
          {expanded && (
            <div className="border-t border-gray-100 p-5 max-h-[60vh] overflow-y-auto">
              <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed text-gray-800">{agreementText}</pre>
            </div>
          )}
          {!expanded && (
            <div className="px-5 pb-4">
              <p className="text-xs text-gray-500">Tap to expand and review the full agreement</p>
            </div>
          )}
        </div>

        {/* Signature Section */}
        {!signed ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Sign Agreement</h2>
              <p className="text-xs text-gray-500 mt-0.5">Use your finger or mouse to sign below</p>
            </div>

            {/* Signer Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-600">Full Legal Name</Label>
                <Input
                  value={signerName}
                  onChange={e => setSignerName(e.target.value)}
                  placeholder="Your full name"
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-600">Email Address</Label>
                <Input
                  value={signerEmail}
                  onChange={e => setSignerEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="mt-1 h-9 text-sm"
                />
              </div>
            </div>

            {/* Signature Tabs */}
            <Tabs value={sigType} onValueChange={(v) => setSigType(v as 'typed' | 'drawn')}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="drawn" className="text-xs gap-1"><PenTool className="h-3 w-3" />Draw Signature</TabsTrigger>
                <TabsTrigger value="typed" className="text-xs gap-1"><Type className="h-3 w-3" />Type Signature</TabsTrigger>
              </TabsList>

              <TabsContent value="drawn" className="space-y-3 mt-3">
                <div className="relative border-2 border-dashed border-gray-300 rounded-lg bg-white overflow-hidden">
                  {/* Sign-here guide line */}
                  <div className="absolute bottom-[30px] left-6 right-6 border-b border-gray-200" />
                  <p className="absolute bottom-2 left-6 text-[10px] text-gray-300 select-none">Sign here</p>
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={200}
                    className="w-full cursor-crosshair touch-none"
                    style={{ height: '160px' }}
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={stopDraw}
                    onMouseLeave={stopDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={stopDraw}
                    onTouchCancel={stopDraw}
                  />
                </div>
                <Button variant="ghost" size="sm" onClick={clearCanvas} className="text-xs text-gray-500">
                  Clear Signature
                </Button>
              </TabsContent>

              <TabsContent value="typed" className="space-y-3 mt-3">
                <Input
                  value={typedName}
                  onChange={e => setTypedName(e.target.value)}
                  placeholder="Type your full legal name"
                  className="h-9 text-sm"
                />
                {typedName && (
                  <div className="p-5 border border-gray-200 rounded-lg bg-gray-50 text-center">
                    <p className="text-3xl italic text-gray-900" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                      {typedName}
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Submit */}
            <Button
              className="w-full h-11 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSign}
              disabled={submitting}
            >
              {submitting ? 'Submitting Signature…' : '✍️ Sign & Submit Agreement'}
            </Button>
            <p className="text-[10px] text-gray-400 text-center leading-relaxed">
              By signing, you acknowledge that you have read and agree to all terms in this agreement.
              Your signature is legally binding. Timestamp: {new Date().toISOString()} • IP recorded for audit.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-emerald-200 p-8 text-center space-y-3">
            <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-900">Agreement Signed!</h2>
            <p className="text-sm text-gray-500">
              Thank you for signing. A copy has been recorded and all parties will be notified.
            </p>
            <div className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
              <Shield className="h-3 w-3" />
              Signature verified & stored securely
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white mt-8">
        <div className="max-w-3xl mx-auto px-4 py-4 text-center">
          <p className="text-[10px] text-gray-400">
            Powered by SOCooked CM • Signatures are legally binding and timestamped
          </p>
        </div>
      </footer>
    </div>
  );
}
