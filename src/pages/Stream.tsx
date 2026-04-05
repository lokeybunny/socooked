import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Phone, Building2, Loader2, CheckCircle, Video, MapPin, CalendarIcon, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const TIME_OPTIONS: string[] = [];
for (let h = 8; h <= 21; h++) {
  for (const m of ['00', '30']) {
    const hh = String(h).padStart(2, '0');
    TIME_OPTIONS.push(`${hh}:${m}`);
  }
}
const fmt12 = (t: string) =>
  new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

export default function Stream() {
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [eventDate, setEventDate] = useState<Date | undefined>();
  const [eventTime, setEventTime] = useState('');
  const [bookingAddress, setBookingAddress] = useState('');
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
    if (!eventDate) {
      toast.error('Please select an event date');
      return;
    }
    if (!eventTime) {
      toast.error('Please select an event time');
      return;
    }
    if (!bookingAddress.trim()) {
      toast.error('Please enter the booking address');
      return;
    }

    const formattedPhone = cleanPhone.length === 10 ? `+1${cleanPhone}` : `+${cleanPhone}`;
    const eventDateStr = format(eventDate, 'MM/dd/yyyy');

    setSubmitting(true);
    try {
      await supabase
        .from('customers')
        .delete()
        .eq('phone', formattedPhone)
        .eq('source', 'videography-landing');

      const { error: custErr } = await supabase.from('customers').insert({
        full_name: businessName.trim(),
        phone: formattedPhone,
        source: 'videography-landing',
        status: 'lead',
        category: 'videography-callback',
        notes: `Returning contractor — scheduling callback via /stream\nEvent Date: ${eventDateStr}\nEvent Time: ${fmt12(eventTime)}\nBooking Address: ${bookingAddress.trim()}`,
        meta: {
          event_date: eventDateStr,
          event_time: eventTime,
          booking_address: bookingAddress.trim(),
        },
      });

      if (custErr) throw custErr;

      const { error: fnErr } = await supabase.functions.invoke('vapi-videography-outbound', {
        body: {
          action: 'trigger_call',
          phone: formattedPhone,
          full_name: businessName.trim(),
          event_type: 'venue booking',
          message: `Event on ${eventDateStr} at ${fmt12(eventTime)}, address: ${bookingAddress.trim()}`,
        },
      });

      if (fnErr) console.warn('Vapi trigger warning:', fnErr);

      setSubmitted(true);
      toast.success("We'll call you shortly to confirm your booking!");
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
            Our AI scheduling assistant will call you momentarily to confirm your venue date.
          </p>
          <button
            onClick={() => { setSubmitted(false); setBusinessName(''); setPhone(''); setEventDate(undefined); setEventTime(''); setBookingAddress(''); }}
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
            Enter your event details below and we'll call you right away to confirm.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Business Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">Business / Venue Name</label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
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

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
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

          {/* Event Date & Time row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Date */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Event Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "w-full flex items-center gap-2 pl-3 pr-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-left text-base transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/60",
                      eventDate ? 'text-white' : 'text-zinc-600'
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 text-zinc-500 shrink-0" />
                    {eventDate ? format(eventDate, 'MMM d, yyyy') : 'Select date'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-700" align="start">
                  <Calendar
                    mode="single"
                    selected={eventDate}
                    onSelect={setEventDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Event Time</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <select
                  value={eventTime}
                  onChange={e => setEventTime(e.target.value)}
                  className={cn(
                    "w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-base focus:outline-none focus:ring-2 focus:ring-purple-500/60 focus:border-transparent transition-all appearance-none",
                    eventTime ? 'text-white' : 'text-zinc-600'
                  )}
                >
                  <option value="" className="text-zinc-600">Time</option>
                  {TIME_OPTIONS.map(t => (
                    <option key={t} value={t} className="text-white">{fmt12(t)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Booking Address */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">Booking Address</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                value={bookingAddress}
                onChange={e => setBookingAddress(e.target.value)}
                placeholder="123 Main St, Las Vegas, NV 89101"
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
          Our AI assistant will call you within minutes to confirm your booking details.
        </p>
      </div>
    </div>
  );
}
