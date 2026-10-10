import { z } from 'zod';

const CognitoConfigSchema = z.object({
  region: z.string().min(1),
  apiUrl: z.string().url(),
  userPoolId: z.string().min(1),
  userPoolClientId: z.string().min(1)
});
export type RuntimeConfig = z.infer<typeof CognitoConfigSchema> & { authMode: 'cognito' | 'local' };

/** True only for `vite --mode local` / `--mode e2e`; production builds compile this to `false`. */
export const isLocalMode = import.meta.env.MODE === 'local' || import.meta.env.MODE === 'e2e';

export async function loadConfig(): Promise<RuntimeConfig> {
  if (isLocalMode) {
    return { authMode: 'local', region: 'local', apiUrl: import.meta.env.VITE_LOCAL_API_URL ?? 'http://127.0.0.1:8787', userPoolId: 'local', userPoolClientId: 'local' };
  }
  const response = await fetch('/config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('The application configuration could not be loaded.');
  return { ...CognitoConfigSchema.parse(await response.json()), authMode: 'cognito' };
}
