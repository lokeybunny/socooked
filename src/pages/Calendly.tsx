import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Clock, Plus, Trash2, Copy, ExternalLink, CalendarX, CalendarClock, User, Mail, Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Slot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface Booking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  room_code: string | null;
  status: string;
  meeting_id: string | null;
  created_at: string;
}

export default function Calendly() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');

  const bookingUrl = `${window.location.origin}/letsmeet`;

  const loadSlots = async () => {
    const { data } = await supabase
      .from('availability_slots')
      .select('*')
      .order('day_of_week')
      .order('start_time');
    setSlots((data as Slot[]) || []);
  };

  const loadBookings = async () => {
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .in('status', ['confirmed'])
      .gte('booking_date', new Date().toISOString().split('T')[0])
      .order('booking_date')
      .order('start_time');
    setBookings((data as Booking[]) || []);
  };

  useEffect(() => {
    Promise.all([loadSlots(), loadBookings()]).then(() => setLoading(false));
  }, []);

  const addSlot = async (day: number) => {
    const { error } = await supabase.from('availability_slots').insert({
      day_of_week: day,
      start_time: '09:00',
      end_time: '17:00',
      is_active: true,
    });
    if (error) { toast.error('Failed to add slot'); return; }
    toast.success('Slot added');
    loadSlots();
  };

  const updateSlot = async (id: string, updates: Partial<Slot>) => {
    await supabase.from('availability_slots').update(updates).eq('id', id);
    loadSlots();
  };

  const deleteSlot = async (id: string) => {
    await supabase.from('availability_slots').delete().eq('id', id);
    toast.success('Slot removed');
    loadSlots();
  };

  const copyLink = () => {
    navigator.clipboard.writeText(bookingUrl);
    toast.success('Booking link copied!');
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    const booking = bookings.find(b => b.id === cancelId);
    if (!booking) return;

    try {
      const res = await supabase.functions.invoke('book-meeting', {
        body: { action: 'cancel', booking_id: cancelId },
      });
      if (res.error) throw res.error;
      toast.success(`Booking with ${booking.guest_name} cancelled`);
      loadBookings();
    } catch {
      toast.error('Failed to cancel booking');
    }
    setCancelId(null);
  };

  const handleReschedule = async () => {
    if (!rescheduleBooking || !newDate || !newTime) return;

    try {
      const res = await supabase.functions.invoke('book-meeting', {
        body: {
          action: 'reschedule',
          booking_id: rescheduleBooking.id,
          new_date: newDate,
          new_time: newTime,
        },
      });
      if (res.error) throw res.error;
      toast.success(`Meeting with ${rescheduleBooking.guest_name} rescheduled`);
      loadBookings();
    } catch {
      toast.error('Failed to reschedule booking');
    }
    setRescheduleBooking(null);
    setNewDate('');
    setNewTime('');
  };

  const formatTime12 = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in max-w-3xl">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Availability Setup</h1>
          <p className="text-sm text-muted-foreground mt-1">Set your weekly availability for meetings. Clients book via your public link.</p>
        </div>

        {/* Booking link */}
        <Card className="p-4 flex items-center gap-3 justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
            <code className="text-sm truncate text-foreground">{bookingUrl}</code>
          </div>
          <Button size="sm" variant="outline" onClick={copyLink}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copy
          </Button>
        </Card>

        {/* Upcoming Bookings */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">Upcoming Bookings</h2>
          {bookings.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted-foreground">No upcoming bookings</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {bookings.map(b => (
                <Card key={b.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground">{b.guest_name}</span>
                        <Badge variant="outline" className="text-xs">{b.duration_minutes} min</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <span>{b.guest_email}</span>
                        {b.guest_phone && (
                          <>
                            <Phone className="h-3 w-3 ml-2" />
                            <span>{b.guest_phone}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>
                          {format(parseISO(b.booking_date), 'EEE, MMM d, yyyy')} · {formatTime12(b.start_time)} – {formatTime12(b.end_time)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRescheduleBooking(b);
                          setNewDate(b.booking_date);
                          setNewTime(b.start_time.slice(0, 5));
                        }}
                      >
                        <CalendarClock className="h-3.5 w-3.5 mr-1" /> Reschedule
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => setCancelId(b.id)}
                      >
                        <CalendarX className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Days */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Weekly Availability</h2>
            {DAYS.map((day, i) => {
              const daySlots = slots.filter(s => s.day_of_week === i);
              return (
                <Card key={i} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-foreground">{day}</h3>
                    <Button size="sm" variant="ghost" onClick={() => addSlot(i)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                  </div>
                  {daySlots.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No availability set</p>
                  ) : (
                    <div className="space-y-2">
                      {daySlots.map(slot => (
                        <div key={slot.id} className="flex items-center gap-3">
                          <Switch
                            checked={slot.is_active}
                            onCheckedChange={(v) => updateSlot(slot.id, { is_active: v })}
                          />
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              type="time"
                              value={slot.start_time.slice(0, 5)}
                              onChange={(e) => updateSlot(slot.id, { start_time: e.target.value })}
                              className="w-28 h-8 text-sm"
                            />
                            <span className="text-muted-foreground text-sm">to</span>
                            <Input
                              type="time"
                              value={slot.end_time.slice(0, 5)}
                              onChange={(e) => updateSlot(slot.id, { end_time: e.target.value })}
                              className="w-28 h-8 text-sm"
                            />
                          </div>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteSlot(slot.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancel Dialog */}
      <AlertDialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the meeting and notify the guest via email and Telegram. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Cancel Booking</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reschedule Dialog */}
      <Dialog open={!!rescheduleBooking} onOpenChange={() => setRescheduleBooking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Meeting</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {rescheduleBooking && (
              <p className="text-sm text-muted-foreground">
                Meeting with <span className="font-medium text-foreground">{rescheduleBooking.guest_name}</span>
              </p>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">New Date</label>
              <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">New Time</label>
              <Input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleBooking(null)}>Cancel</Button>
            <Button onClick={handleReschedule} disabled={!newDate || !newTime}>Reschedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
