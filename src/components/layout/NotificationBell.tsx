import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

export function NotificationBell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [hasNew, setHasNew] = useState(false);
  const lastSeenRef = useRef<string | null>(null);

  useEffect(() => {
    lastSeenRef.current = localStorage.getItem('notifications_last_seen');

    const checkNew = async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      if (data?.[0] && (!lastSeenRef.current || data[0].created_at > lastSeenRef.current)) {
        setHasNew(true);
      }
    };
    checkNew();

    const channel = supabase
      .channel('header_notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () => {
        if (location.pathname !== '/notifications') {
          setHasNew(true);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (location.pathname === '/notifications') {
      setHasNew(false);
      localStorage.setItem('notifications_last_seen', new Date().toISOString());
      lastSeenRef.current = new Date().toISOString();
    }
  }, [location.pathname]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 relative"
      onClick={() => navigate('/notifications')}
    >
      <Bell className="h-4 w-4" />
      {hasNew && (
        <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-destructive border-2 border-background animate-pulse" />
      )}
    </Button>
  );
}
