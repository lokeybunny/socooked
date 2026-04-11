import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWorkerHealth } from '@/lib/studio/hooks';
import { Cpu, Activity, Layers, Clock, Server } from 'lucide-react';

export function StudioSettings() {
  const { health, loading } = useWorkerHealth();

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Backend Status */}
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardContent className="p-5 space-y-4">
          <h3 className="font-semibold flex items-center gap-2"><Cpu className="w-4 h-4 text-violet-400" /> GPU Backend Status</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Checking...</p>
          ) : health ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${health.online ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-sm">{health.online ? 'Online' : 'Offline'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm">{health.hardware_tier}</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm">Queue: {health.queue_depth}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm">{health.last_success ? `Last: ${new Date(health.last_success).toLocaleString()}` : 'No recent jobs'}</span>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm">Modes: </span>
                {health.supported_modes.map(m => <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>)}
                {health.supported_modes.length === 0 && <span className="text-xs text-muted-foreground">None reported</span>}
              </div>
              {!health.online && (
                <p className="col-span-2 text-xs text-muted-foreground">{health.message}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Unable to check</p>
          )}
        </CardContent>
      </Card>

      {/* Configuration Info */}
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardContent className="p-5 space-y-3">
          <h3 className="font-semibold">Backend Configuration</h3>
          <p className="text-sm text-muted-foreground">
            To connect Warren Studio to your Wan2.2 GPU worker, configure these environment variables in your backend:
          </p>
          <div className="space-y-2">
            <div className="bg-muted/30 rounded p-3">
              <code className="text-xs text-violet-400">STUDIO_WORKER_URL</code>
              <p className="text-[10px] text-muted-foreground mt-1">Base URL of your GPU inference server (e.g., https://your-gpu-server.com)</p>
            </div>
            <div className="bg-muted/30 rounded p-3">
              <code className="text-xs text-violet-400">STUDIO_WORKER_API_KEY</code>
              <p className="text-[10px] text-muted-foreground mt-1">Auth key for your worker's REST API (optional, depends on your setup)</p>
            </div>
          </div>
          <div className="bg-muted/30 rounded p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Expected Worker Endpoints:</p>
            <p><code>POST /jobs</code> — Submit a generation job</p>
            <p><code>GET /jobs/:id</code> — Check job status</p>
            <p><code>POST /jobs/:id/cancel</code> — Cancel a queued job</p>
            <p><code>GET /health</code> — Worker health check</p>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card className="border-border/50 bg-card/30">
        <CardContent className="p-5">
          <h3 className="font-semibold mb-2">About Warren Studio</h3>
          <p className="text-sm text-muted-foreground">
            Warren Studio is a cinematic AI video generation platform designed to work with the Wan2.2 model stack.
            It provides a premium creator-focused interface while your own GPU worker handles the actual inference.
          </p>
          <div className="mt-3 text-xs text-muted-foreground space-y-1">
            <p>• Frontend: React + Tailwind + shadcn/ui</p>
            <p>• Backend: Supabase Edge Functions (orchestration)</p>
            <p>• Database: Supabase (job queue, presets, settings)</p>
            <p>• Inference: Your Wan2.2 GPU server via REST</p>
            <p>• Storage: Supabase Storage for inputs &amp; outputs</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
