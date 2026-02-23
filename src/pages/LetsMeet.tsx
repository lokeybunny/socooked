import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Clock, CalendarDays, Check, Loader2, Video, Phone,
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth,
  isSameDay, addMonths, subMonths, getDay, isAfter, startOfDay, isBefore,
} from 'date-fns';

interface Slot {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface Booking {
  booking_date: string;
  start_time: string;
  end_time: string;
}

const DURATIONS = [15, 30, 60];

export default function LetsMeet() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [meetingType, setMeetingType] = useState<'video' | 'phone'>('video');
  const [duration, setDuration] = useState(30);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState<{ room_url: string; date: string; time: string; booking_id?: string } | null>(null);

  useEffect(() => {
    supabase.from('availability_slots').select('day_of_week, start_time, end_time').eq('is_active', true).then(({ data }) => setSlots((data as Slot[]) || []));
    supabase.from('bookings').select('booking_date, start_time, end_time').eq('status', 'confirmed').then(({ data }) => setBookings((data as Booking[]) || []));
  }, []);

  const availableDays = useMemo(() => new Set(slots.map(s => s.day_of_week)), [slots]);

  const monthDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const firstDayOffset = getDay(startOfMonth(currentMonth));

  const isDateAvailable = (date: Date) => {
    if (isBefore(date, startOfDay(new Date()))) return false;
    return availableDays.has(getDay(date));
  };

  const getTimeSlotsForDate = (date: Date): string[] => {
    const dow = getDay(date);
    const daySlots = slots.filter(s => s.day_of_week === dow);
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayBookings = bookings.filter(b => b.booking_date === dateStr);

    const times: string[] = [];
    for (const slot of daySlots) {
      const [sh, sm] = slot.start_time.split(':').map(Number);
      const [eh] = slot.end_time.split(':').map(Number);
      let cursor = sh * 60 + sm;
      const endMin = eh * 60;

      while (cursor + duration <= endMin) {
        const hh = String(Math.floor(cursor / 60)).padStart(2, '0');
        const mm = String(cursor % 60).padStart(2, '0');
        const timeStr = `${hh}:${mm}`;

        // Check conflicts
        const slotEnd = cursor + duration;
        const conflict = dayBookings.some(b => {
          const [bh, bm] = b.start_time.split(':').map(Number);
          const [beh, bem] = b.end_time.split(':').map(Number);
          const bStart = bh * 60 + bm;
          const bEnd = beh * 60 + bem;
          return cursor < bEnd && slotEnd > bStart;
        });

        if (!conflict) times.push(timeStr);
        cursor += 30; // 30 min increments
      }
    }
    return times;
  };

  const timeSlots = selectedDate ? getTimeSlotsForDate(selectedDate) : [];

  const handleBook = async () => {
    if (!selectedDate || !selectedTime || !name || !email) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (meetingType === 'phone' && !phone) {
      toast.error('Phone number is required for phone call meetings');
      return;
    }
    setSubmitting(true);
    try {
      const res = await supabase.functions.invoke('book-meeting', {
        body: {
          guest_name: name,
          guest_email: email,
          guest_phone: phone,
          booking_date: format(selectedDate, 'yyyy-MM-dd'),
          start_time: selectedTime,
          duration_minutes: duration,
          meeting_type: meetingType,
        },
      });

      if (res.error) throw new Error(res.error.message);
      const data = res.data;
      if (!data.success) throw new Error(data.error || 'Booking failed');

      setBooked({
        room_url: data.room_url,
        date: format(selectedDate, 'EEEE, MMMM d, yyyy'),
        time: new Date(`2000-01-01T${selectedTime}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        booking_id: data.booking?.id,
      });
      toast.success('Meeting booked! Check your email for confirmation.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to book');
    } finally {
      setSubmitting(false);
    }
  };

  if (booked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <Check className="h-7 w-7 text-emerald-500" />
          </div>
          <h1 className="text-xl font-bold text-foreground">You're All Set!</h1>
          <p className="text-sm text-muted-foreground">Your meeting has been confirmed.</p>
          <div className="bg-muted rounded-lg p-4 text-left space-y-1">
            <p className="text-sm"><strong>📅</strong> {booked.date}</p>
            <p className="text-sm"><strong>🕐</strong> {booked.time} (Las Vegas / PST)</p>
            <p className="text-sm"><strong>⏱</strong> {duration} minutes</p>
            <p className="text-sm"><strong>{meetingType === 'phone' ? '📞' : '🎥'}</strong> {meetingType === 'phone' ? 'Phone Call' : 'Video Call'}</p>
          </div>
          <p className="text-xs text-muted-foreground">A confirmation email has been sent to your inbox.</p>
          {meetingType === 'video' ? (
            <Button className="w-full" onClick={() => window.open(booked.room_url, '_blank')}>
              Open Meeting Room
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">We'll call you at the scheduled time.</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => window.location.href = '/'}>
              Back to Home
            </Button>
            {booked.booking_id && (
              <Button variant="outline" className="flex-1" onClick={() => window.location.href = `/manage-booking/${booked.booking_id}`}>
                Manage Booking
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Book a Meeting</h1>
          <p className="text-sm text-muted-foreground mt-1">Choose a date and time that works for you.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Left: Calendar + Duration */}
          <Card className="p-4 space-y-4">
            {/* Meeting type selector */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Meeting Type</Label>
              <div className="flex gap-2">
                <Button size="sm" variant={meetingType === 'video' ? 'default' : 'outline'} onClick={() => setMeetingType('video')}>
                  <Video className="h-3.5 w-3.5 mr-1" /> Video Call
                </Button>
                <Button size="sm" variant={meetingType === 'phone' ? 'default' : 'outline'} onClick={() => setMeetingType('phone')}>
                  <Phone className="h-3.5 w-3.5 mr-1" /> Phone Call
                </Button>
              </div>
            </div>

            {/* Duration selector */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Duration</Label>
              <div className="flex gap-2">
                {DURATIONS.map(d => (
                  <Button key={d} size="sm" variant={duration === d ? 'default' : 'outline'} onClick={() => { setDuration(d); setSelectedTime(null); }}>
                    {d} min
                  </Button>
                ))}
              </div>
            </div>

            {/* Month nav */}
            <div className="flex items-center justify-between">
              <Button size="icon" variant="ghost" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold text-foreground">{format(currentMonth, 'MMMM yyyy')}</span>
              <Button size="icon" variant="ghost" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 text-center">
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <span key={d} className="text-[10px] font-medium text-muted-foreground py-1">{d}</span>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDayOffset }).map((_, i) => <div key={`e${i}`} />)}
              {monthDays.map(day => {
                const available = isDateAvailable(day);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                return (
                  <button
                    key={day.toISOString()}
                    disabled={!available}
                    onClick={() => { setSelectedDate(day); setSelectedTime(null); }}
                    className={`h-9 w-full rounded-md text-sm transition-colors ${
                      isSelected
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : available
                          ? 'hover:bg-accent text-foreground'
                          : 'text-muted-foreground/40 cursor-not-allowed'
                    }`}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Right: Time slots + form */}
          <Card className="p-4 space-y-4">
            {!selectedDate ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4 mr-2" /> Select a date to see available times
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">{format(selectedDate, 'EEEE, MMMM d')}</p>

                {timeSlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No available times for this day.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto">
                    {timeSlots.map(t => (
                      <button
                        key={t}
                        onClick={() => setSelectedTime(t)}
                        className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          selectedTime === t
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground hover:bg-accent'
                        }`}
                      >
                        {new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </button>
                    ))}
                  </div>
                )}

                {selectedTime && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <div>
                      <Label className="text-xs">Name *</Label>
                      <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" className="h-9 mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Email *</Label>
                      <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="h-9 mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Phone {meetingType === 'phone' ? '*' : ''}</Label>
                      <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" className="h-9 mt-1" required={meetingType === 'phone'} />
                    </div>
                    <Button className="w-full" onClick={handleBook} disabled={submitting}>
                      {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Booking...</> : 'Book Meeting'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-4">All times are in Las Vegas (PST) timezone.</p>
      </div>
    </div>
  );
}
