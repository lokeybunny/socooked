import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Clock, Plus, Trash2, Copy, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Slot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export default function Calendly() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  const bookingUrl = `${window.location.origin}/letsmeet`;

  const loadSlots = async () => {
    const { data } = await supabase
      .from('availability_slots')
      .select('*')
      .order('day_of_week')
      .order('start_time');
    setSlots((data as Slot[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadSlots(); }, []);

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

        {/* Days */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-3">
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
    </AppLayout>
  );
}
