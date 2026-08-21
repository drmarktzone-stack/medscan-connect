import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Base44 backend origin. In the original hosting this was same-origin ('');
// here the app runs on a different origin, so calls must be absolute.
export const BASE44_SERVER_URL =
  import.meta.env.VITE_BASE44_SERVER_URL || 'https://base44.app';

//Create a client with authentication required
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: BASE44_SERVER_URL,
  requiresAuth: false,
  appBaseUrl
});
