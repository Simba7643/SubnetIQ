import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui';
export function PwaStatus() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="pwa-banner no-print" role="status">
      <span>
        {needRefresh ? 'An updated workspace is ready.' : 'Calculators are ready for offline use.'}
      </span>
      {needRefresh && (
        <Button variant="secondary" onClick={() => void updateServiceWorker(true)}>
          Update now
        </Button>
      )}
      <Button
        variant="ghost"
        onClick={() => {
          setNeedRefresh(false);
          setOfflineReady(false);
        }}
      >
        Dismiss
      </Button>
    </div>
  );
}
