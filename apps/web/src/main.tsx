import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import './styles.css';
import App from './App';
import { AuthProvider } from './lib/auth';
import { queryClient } from './lib/query';
import { usePreferences } from './lib/preferences';
import { ErrorBoundary } from './components/ErrorBoundary';

function Application() {
  const theme = usePreferences((state) => state.theme);
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MotionConfig reducedMotion="user">
            <BrowserRouter>
              <App />
            </BrowserRouter>
            <Toaster richColors closeButton theme={theme} position="bottom-center" />
          </MotionConfig>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');
createRoot(root).render(
  <StrictMode>
    <Application />
  </StrictMode>,
);
