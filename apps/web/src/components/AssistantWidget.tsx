import { lazy, Suspense } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';
const ChatPanel = lazy(() =>
  import('@/features/assistant/ChatPanel').then((module) => ({ default: module.ChatPanel })),
);
export function AssistantWidget() {
  const { pathname } = useLocation();
  if (pathname === '/assistant' || pathname.startsWith('/share/')) return null;
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className="assistant-fab no-print" aria-label="Open AI assistant">
          <Sparkles size={21} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content widget-dialog">
          <Dialog.Title className="sr-only">SubnetIQ assistant</Dialog.Title>
          <Dialog.Description className="sr-only">
            Ask a networking question. Escape closes this assistant panel.
          </Dialog.Description>
          <Suspense
            fallback={
              <div className="loading-page" style={{ minHeight: 180 }} role="status">
                <span className="spinner" />
                Opening assistant…
              </div>
            }
          >
            <ChatPanel compact />
          </Suspense>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
