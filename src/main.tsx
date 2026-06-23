import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import './styles/global.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/700.css';
import '@fontsource/archivo/800.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { queryClient } from './lib/queryClient';
import { persistOptions } from './lib/queryPersister';
import { ErrorBoundary } from './components/error/ErrorBoundary';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary title="The page ran into a problem">
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <App />
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
