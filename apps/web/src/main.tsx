import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from '@/app';
import { configureApi } from '@/lib/api';
import { amplifyAdapter } from '@/lib/auth/amplify-adapter';
import type { AuthAdapter } from '@/lib/auth/types';
import { isLocalMode, loadConfig } from '@/lib/config';
import { Providers } from '@/providers';
import './styles.css';

async function createAdapter(config: Awaited<ReturnType<typeof loadConfig>>): Promise<AuthAdapter> {
  if (isLocalMode) {
    const { createLocalAdapter } = await import('@/lib/auth/local-adapter');
    return createLocalAdapter(config.apiUrl);
  }
  const { Amplify } = await import('aws-amplify');
  Amplify.configure({ Auth: { Cognito: { userPoolId: config.userPoolId, userPoolClientId: config.userPoolClientId, loginWith: { email: true } } } });
  return amplifyAdapter;
}

async function boot(root: HTMLElement) {
  try {
    const config = await loadConfig();
    const adapter = await createAdapter(config);
    configureApi({ apiUrl: config.apiUrl, getToken: () => adapter.getToken() });
    createRoot(root).render(
      <StrictMode>
        <BrowserRouter>
          <Providers adapter={adapter}><App /></Providers>
        </BrowserRouter>
      </StrictMode>
    );
  } catch {
    root.textContent = 'CloudAttend could not start. Please refresh the page or try again later.';
  }
}

const root = document.getElementById('root');
if (root) void boot(root);
