import { useLocation } from 'react-router-dom';
import type { CalculationResult } from '@subnetiq/shared';
import { PageHeader } from '@/components/ui';
import { ChatPanel } from '@/features/assistant/ChatPanel';
export default function AssistantPage() {
  const location = useLocation();
  const calculation = (location.state as { calculation?: CalculationResult } | null)?.calculation;
  return (
    <div className="page">
      <PageHeader
        eyebrow="A SECOND SET OF EYES"
        title="Think through your network."
        description="Explore a concept, discuss a calculation, or work through a plan one question at a time."
      />
      <ChatPanel initialCalculation={calculation} />
    </div>
  );
}
