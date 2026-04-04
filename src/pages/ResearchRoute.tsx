import Research from "./Research";
import { ResearchLoopProvider } from "@/hooks/useResearchLoop";
import { LeadLoopProvider } from "@/hooks/useLeadLoop";
import { YelpLoopProvider } from "@/hooks/useYelpLoop";
import { GMapsLoopProvider } from "@/hooks/useGMapsLoop";

export default function ResearchRoute() {
  return (
    <ResearchLoopProvider>
      <LeadLoopProvider>
        <YelpLoopProvider>
          <GMapsLoopProvider>
            <Research />
          </GMapsLoopProvider>
        </YelpLoopProvider>
      </LeadLoopProvider>
    </ResearchLoopProvider>
  );
}
