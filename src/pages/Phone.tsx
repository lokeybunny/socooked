import { AppLayout } from '@/components/layout/AppLayout';
import { Phone as PhoneIcon } from 'lucide-react';

export default function PhonePage() {
  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Phone</h1>
            <p className="text-muted-foreground mt-1">Calls, SMS & voicemails via RingCentral.</p>
          </div>
        </div>

        <div className="glass-card overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
          <iframe
            src="https://apps.ringcentral.com/integration/ringcentral-embeddable/latest/app.html"
            width="100%"
            height="100%"
            allow="microphone; autoplay"
            style={{ border: 'none' }}
          />
        </div>
      </div>
    </AppLayout>
  );
}
