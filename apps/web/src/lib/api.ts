export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const FRIENDLY: Record<string, string> = {
  QR_EXPIRED: 'This QR code has expired. Scan the code currently on your instructor\'s screen.',
  ATTENDANCE_ALREADY_RECORDED: 'Your attendance for this class has already been recorded.',
  NOT_ENROLLED: 'You are not enrolled in this course.',
  SESSION_CLOSED: 'This attendance session has closed.',
  INVALID_QR: 'This QR code is not valid. Scan the code on your instructor\'s screen.',
  NETWORK: 'We could not reach the server. Check your connection and try again.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.'
};

export function friendlyError(code?: string) {
  return FRIENDLY[code ?? ''] ?? FRIENDLY.NETWORK;
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return FRIENDLY[error.code] ?? error.message;
  if (error instanceof Error && error.message) return error.message;
  return friendlyError();
}

type ApiClientOptions = { apiUrl: string; getToken: () => Promise<string | undefined> };
let client: ApiClientOptions | undefined;

export function configureApi(options: ApiClientOptions) {
  client = options;
}

async function request(path: string, init: { method?: string; body?: unknown } = {}) {
  if (!client) throw new Error('API client is not configured.');
  const token = await client.getToken();
  let response: Response;
  try {
    response = await fetch(`${client.apiUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });
  } catch {
    throw new ApiError(0, 'NETWORK', friendlyError('NETWORK'));
  }
  if (!response.ok) {
    let code = response.status === 401 ? 'UNAUTHENTICATED' : 'HTTP_ERROR';
    let message = response.status === 401 ? 'Your session has ended. Please sign in again.' : friendlyError('INTERNAL_ERROR');
    try {
      const data = await response.json() as { error?: { code?: string; message?: string } };
      if (data.error?.code) code = data.error.code;
      if (data.error?.message) message = data.error.message;
    } catch { /* non-JSON error body */ }
    throw new ApiError(response.status, code, message);
  }
  return response;
}

export async function api<T>(path: string, init?: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown }): Promise<T> {
  const response = await request(path, init);
  return await response.json() as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  return await (await request(path)).blob();
}
