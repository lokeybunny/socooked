import { useEffect, useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Clock, Loader2, Video, Phone, Check, MapPin,
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth,
  isSameDay, addMonths, subMonths, getDay, isBefore, startOfDay,
} from 'date-fns';
import { cn } from '@/lib/utils';

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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: { id: string; full_name: string; email?: string; phone?: string } | null;
  onBooked?: (meetingType: 'video' | 'phone' | 'in_person') => void;
}

const is702Number = (phone?: string | null): boolean => {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  // Check for 702 area code (with or without country code 1)
  return digits.startsWith('702') || digits.startsWith('1702');
};

const DURATIONS = [15, 30, 60];

export default function MeetingSchedulerModal({ open, onOpenChange, lead, onBooked }: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [meetingType, setMeetingType] = useState<'video' | 'phone'>('video');
  const [duration, setDuration] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedDate(null);
    setSelectedTime(null);
    setBooked(false);
    supabase.from('availability_slots').select('day_of_week, start_time, end_time').eq('is_active', true).then(({ data }) => setSlots((data as Slot[]) || []));
    supabase.from('bookings').select('booking_date, start_time, end_time').eq('status', 'confirmed').then(({ data }) => setBookings((data as Booking[]) || []));
  }, [open]);

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
        const slotEnd = cursor + duration;
        const conflict = dayBookings.some(b => {
          const [bh, bm] = b.start_time.split(':').map(Number);
          const [beh, bem] = b.end_time.split(':').map(Number);
          const bStart = bh * 60 + bm;
          const bEnd = beh * 60 + bem;
          return cursor < bEnd && slotEnd > bStart;
        });
        if (!conflict) times.push(timeStr);
        cursor += 30;
      }
    }
    return times;
  };

  const timeSlots = selectedDate ? getTimeSlotsForDate(selectedDate) : [];

  const handleBook = async () => {
    if (!selectedDate || !selectedTime || !lead) return;
    setSubmitting(true);
    try {
      const res = await supabase.functions.invoke('book-meeting', {
        body: {
          guest_name: lead.full_name,
          guest_email: lead.email || '',
          guest_phone: lead.phone || '',
          booking_date: format(selectedDate, 'yyyy-MM-dd'),
          start_time: selectedTime,
          duration_minutes: duration,
          meeting_type: meetingType,
          customer_id: lead.id,
        },
      });
      if (res.error) throw new Error(res.error.message);
      const data = res.data;
      if (!data?.success) throw new Error(data?.error || 'Booking failed');

      setBooked(true);
      toast.success(`Meeting booked with ${lead.full_name} on ${format(selectedDate, 'MMM d')} at ${new Date(`2000-01-01T${selectedTime}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`);
      onBooked?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to book meeting');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime12h = (t: string) => new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Schedule Meeting — {lead?.full_name}
          </DialogTitle>
        </DialogHeader>

        {booked ? (
          <div className="text-center py-8 space-y-3">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Check className="h-7 w-7 text-emerald-500" />
            </div>
            <p className="text-lg font-semibold text-foreground">Meeting Scheduled!</p>
            <p className="text-sm text-muted-foreground">The booking is on your calendar.</p>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Meeting type + duration */}
            <div className="flex gap-4 flex-wrap">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Type</Label>
                <div className="flex gap-2">
                  <Button size="sm" variant={meetingType === 'video' ? 'default' : 'outline'} onClick={() => setMeetingType('video')}>
                    <Video className="h-3.5 w-3.5 mr-1" /> Video
                  </Button>
                  <Button size="sm" variant={meetingType === 'phone' ? 'default' : 'outline'} onClick={() => setMeetingType('phone')}>
                    <Phone className="h-3.5 w-3.5 mr-1" /> Phone
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Duration</Label>
                <div className="flex gap-1">
                  {DURATIONS.map(d => (
                    <Button key={d} size="sm" variant={duration === d ? 'default' : 'outline'} onClick={() => { setDuration(d); setSelectedTime(null); }}>
                      {d}m
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Calendar */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="text-sm font-semibold text-foreground">{format(currentMonth, 'MMMM yyyy')}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="h-4 w-4" /></Button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground font-medium">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstDayOffset }).map((_, i) => <div key={`e-${i}`} />)}
                  {monthDays.map(day => {
                    const avail = isDateAvailable(day);
                    const selected = selectedDate && isSameDay(day, selectedDate);
                    return (
                      <button
                        key={day.toISOString()}
                        disabled={!avail}
                        onClick={() => { setSelectedDate(day); setSelectedTime(null); }}
                        className={cn(
                          'h-8 w-full rounded text-xs font-medium transition-colors',
                          !avail && 'text-muted-foreground/30 cursor-not-allowed',
                          avail && !selected && 'text-foreground hover:bg-accent',
                          selected && 'bg-primary text-primary-foreground',
                        )}
                      >
                        {format(day, 'd')}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time slots */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {selectedDate ? `Available times — ${format(selectedDate, 'EEE, MMM d')}` : 'Select a date first'}
                </Label>
                {selectedDate && timeSlots.length === 0 && (
                  <p className="text-xs text-muted-foreground">No available slots for this date.</p>
                )}
                <div className="grid grid-cols-3 gap-1.5 max-h-[220px] overflow-y-auto">
                  {timeSlots.map(t => (
                    <Button
                      key={t}
                      size="sm"
                      variant={selectedTime === t ? 'default' : 'outline'}
                      className="text-xs h-8"
                      onClick={() => setSelectedTime(t)}
                    >
                      {formatTime12h(t)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Book button */}
            <Button
              className="w-full gap-2"
              disabled={!selectedDate || !selectedTime || submitting}
              onClick={handleBook}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
              Book Meeting
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
