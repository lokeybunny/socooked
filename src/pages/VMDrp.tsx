import { AppLayout } from "@/components/layout/AppLayout";
import VMDropPanel from "@/components/phone/VMDropPanel";

export default function VMDrp() {
  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in max-w-[1400px] mx-auto">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">VMDrp</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Ringless voicemail drops powered by Drop.co
          </p>
        </div>
        <VMDropPanel />
      </div>
    </AppLayout>
  );
}
