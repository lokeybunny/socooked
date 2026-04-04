import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Phone, Building2, Loader2, CheckCircle, Video } from 'lucide-react';

export default function Stream() {
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      toast.error('Please enter a valid phone number');
      return;
    }
    if (!businessName.trim()) {
      toast.error('Please enter your business name');
      return;
    }

    setSubmitting(true);
    try {
      // Create customer record for the callback
      const { error: custErr } = await supabase.from('customers').insert({
        full_name: businessName.trim(),
        phone: cleanPhone.length === 10 ? `+1${cleanPhone}` : `+${cleanPhone}`,
        source: 'stream-callback',
        status: 'lead',
        category: 'videography-callback',
        notes: `Returning contractor requesting scheduling callback via /stream`,
      });

      if (custErr) throw custErr;

      // Trigger Vapi outbound call for videography scheduling
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const fnUrl = `https://${projectId}.supabase.co/functions/v1/vapi-videography-outbound`;

      await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          phone: cleanPhone.length === 10 ? `+1${cleanPhone}` : `+${cleanPhone}`,
          businessName: businessName.trim(),
        }),
      });

      setSubmitted(true);
      toast.success('We\'ll call you shortly to schedule your booking!');
    } catch (err: any) {
      console.error(err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="text-center max-w-md space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold text-white">You're All Set!</h1>
          <p className="text-zinc-400 text-lg">
            Our AI scheduling assistant will call you momentarily to book your venue date.
          </p>
          <button
            onClick={() => { setSubmitted(false); setBusinessName(''); setPhone(''); }}
            className="text-sm text-zinc-500 hover:text-zinc-300 underline transition-colors"
          >
            Submit another request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-600/30">
            <Video className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Schedule Your Booking
          </h1>
          <p className="text-zinc-400 text-base max-w-xs mx-auto">
            Enter your info below and we'll call you right away to schedule your venue date.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">Business / Venue Name</label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-500" />
              <input
                type="text"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="e.g. Sunset Chapel"
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/60 focus:border-transparent transition-all text-base"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-500" />
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/60 focus:border-transparent transition-all text-base"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold text-base hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-600/25 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Requesting Callback…
              </>
            ) : (
              'Call Me to Schedule'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-600">
          Our AI assistant will call you within minutes to schedule your booking.
        </p>
      </div>
    </div>
  );
}
