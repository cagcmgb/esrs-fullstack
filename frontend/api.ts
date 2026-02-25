import type { User } from './types';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export class ApiError extends Error {
  status: number;
  details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function getToken() {
  return localStorage.getItem('esrs.token');
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('esrs.token', token);
  else localStorage.removeItem('esrs.token');
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    ...(options.headers as any)
  };

  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers
  });

  const contentType = res.headers.get('content-type') ?? '';

  if (!res.ok) {
    let payload: any = null;

    if (contentType.includes('application/json')) {
      payload = await res.json().catch(() => null);
    } else {
      payload = await res.text().catch(() => null);
    }

    throw new ApiError(
      payload?.error ?? res.statusText,
      res.status,
      payload?.details ?? payload
    );
  }

  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }

  return (await res.text()) as any;
}

export async function login(
  usernameOrEmail: string,
  password: string
): Promise<{ token: string; user: User }> {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ usernameOrEmail, password })
  });
}

export async function getMe(): Promise<User> {
  return apiFetch('/auth/me');
}
