import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Check, Loader2, X, CalendarDays, ChevronLeft, ChevronRight, Clock,
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  addMonths, subMonths, getDay, startOfDay, isBefore,
} from 'date-fns';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

interface Booking {
  id: string;
  guest_name: string;
  guest_email: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: string;
  room_code: string | null;
  meeting_id: string | null;
}

interface Slot {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export default function ManageBooking() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [rescheduled, setRescheduled] = useState(false);

  // Reschedule state
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId) return;
    Promise.all([
      supabase.from('bookings').select('*').eq('id', bookingId).single(),
      supabase.from('availability_slots').select('day_of_week, start_time, end_time').eq('is_active', true),
      supabase.from('bookings').select('booking_date, start_time, end_time').eq('status', 'confirmed'),
    ]).then(([bRes, sRes, bkRes]) => {
      if (bRes.data) setBooking(bRes.data as Booking);
      setSlots((sRes.data as Slot[]) || []);
      setBookings(bkRes.data || []);
      setLoading(false);
    });
  }, [bookingId]);

  const availableDays = useMemo(() => new Set(slots.map(s => s.day_of_week)), [slots]);
  const monthDays = useMemo(() => eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) }), [currentMonth]);
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
    const dur = booking?.duration_minutes || 30;
    const times: string[] = [];
    for (const slot of daySlots) {
      const [sh, sm] = slot.start_time.split(':').map(Number);
      const [eh] = slot.end_time.split(':').map(Number);
      let cursor = sh * 60 + sm;
      const endMin = eh * 60;
      while (cursor + dur <= endMin) {
        const hh = String(Math.floor(cursor / 60)).padStart(2, '0');
        const mm = String(cursor % 60).padStart(2, '0');
        const timeStr = `${hh}:${mm}`;
        const slotEnd = cursor + dur;
        const conflict = dayBookings.some(b => {
          const [bh, bm] = b.start_time.split(':').map(Number);
          const [beh, bem] = b.end_time.split(':').map(Number);
          return cursor < beh * 60 + bem && slotEnd > bh * 60 + bm;
        });
        if (!conflict) times.push(timeStr);
        cursor += 30;
      }
    }
    return times;
  };

  const timeSlots = selectedDate ? getTimeSlotsForDate(selectedDate) : [];

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      const res = await supabase.functions.invoke('book-meeting', {
        body: { action: 'cancel', booking_id: bookingId },
      });
      if (res.error) throw new Error(res.error.message);
      setCancelled(true);
      toast.success('Meeting cancelled successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReschedule = async () => {
    if (!selectedDate || !selectedTime) return;
    setActionLoading(true);
    try {
      const res = await supabase.functions.invoke('book-meeting', {
        body: {
          action: 'reschedule',
          booking_id: bookingId,
          new_date: format(selectedDate, 'yyyy-MM-dd'),
          new_time: selectedTime,
        },
      });
      if (res.error) throw new Error(res.error.message);
      setRescheduled(true);
      setRescheduleOpen(false);
      toast.success('Meeting rescheduled!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reschedule');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <X className="h-7 w-7 text-destructive mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Booking Not Found</h1>
          <p className="text-sm text-muted-foreground">This booking link may be invalid or expired.</p>
          <Button onClick={() => window.location.href = '/letsmeet'}>Book a New Meeting</Button>
        </Card>
      </div>
    );
  }

  if (cancelled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <X className="h-7 w-7 text-destructive mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Meeting Cancelled</h1>
          <p className="text-sm text-muted-foreground">Your meeting has been cancelled. A confirmation email has been sent.</p>
          <Button onClick={() => window.location.href = '/letsmeet'}>Book a New Meeting</Button>
        </Card>
      </div>
    );
  }

  if (rescheduled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <Check className="h-7 w-7 text-emerald-500" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Meeting Rescheduled!</h1>
          <p className="text-sm text-muted-foreground">Your meeting has been rescheduled. Check your email for the updated details.</p>
          <Button onClick={() => window.location.href = '/'}>Back to Home</Button>
        </Card>
      </div>
    );
  }

  if (booking.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <X className="h-7 w-7 text-muted-foreground mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Meeting Already Cancelled</h1>
          <p className="text-sm text-muted-foreground">This meeting was previously cancelled.</p>
          <Button onClick={() => window.location.href = '/letsmeet'}>Book a New Meeting</Button>
        </Card>
      </div>
    );
  }

  const fmtDate = new Date(`${booking.booking_date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const fmtTime = new Date(`2000-01-01T${booking.start_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 space-y-5">
        <div className="text-center space-y-2">
          <CalendarDays className="h-7 w-7 text-primary mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Manage Your Meeting</h1>
          <p className="text-sm text-muted-foreground">Hi {booking.guest_name}, here are your meeting details.</p>
        </div>

        <div className="bg-muted rounded-lg p-4 space-y-1">
          <p className="text-sm"><strong>📅</strong> {fmtDate}</p>
          <p className="text-sm"><strong>🕐</strong> {fmtTime} (Las Vegas / PST)</p>
          <p className="text-sm"><strong>⏱</strong> {booking.duration_minutes} minutes</p>
        </div>

        {booking.room_code && (
          <Button className="w-full" onClick={() => window.open(`https://stu25.com/meet/${booking.room_code}`, '_blank')}>
            Join Meeting
          </Button>
        )}

        <div className="flex gap-2">
          <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1">
                <Clock className="h-4 w-4 mr-1" /> Reschedule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Reschedule Meeting</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Month nav */}
                <div className="flex items-center justify-between">
                  <Button size="icon" variant="ghost" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-semibold">{format(currentMonth, 'MMMM yyyy')}</span>
                  <Button size="icon" variant="ghost" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-7 text-center">
                  {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                    <span key={d} className="text-[10px] font-medium text-muted-foreground py-1">{d}</span>
                  ))}
                </div>
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

                {selectedDate && timeSlots.length > 0 && (
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

                {selectedDate && timeSlots.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center">No available times.</p>
                )}

                <Button className="w-full" disabled={!selectedTime || actionLoading} onClick={handleReschedule}>
                  {actionLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Rescheduling...</> : 'Confirm Reschedule'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="flex-1">
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel Meeting?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will cancel your meeting on {fmtDate} at {fmtTime}. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Meeting</AlertDialogCancel>
                <AlertDialogAction onClick={handleCancel} disabled={actionLoading}>
                  {actionLoading ? 'Cancelling...' : 'Yes, Cancel'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <Button variant="ghost" className="w-full" onClick={() => window.location.href = '/'}>
          Back to Home
        </Button>
      </Card>
    </div>
  );
}
