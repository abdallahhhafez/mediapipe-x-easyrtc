const BASE = '/api';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * sessionStorage, not localStorage. A refresh still keeps a night-shift nurse
 * signed in, but the session is scoped to the tab — so a station and a patient
 * kiosk can be open side by side without one signing the other out, and a
 * token is not left behind on a shared workstation after the tab closes.
 */
export const tokenStore = {
  get: () => sessionStorage.getItem('vitalwatch.token'),
  set: (t) => sessionStorage.setItem('vitalwatch.token', t),
  clear: () => sessionStorage.removeItem('vitalwatch.token'),
};

async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(BASE + path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }

  const token = tokenStore.get();
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) tokenStore.clear();
    throw new ApiError(res.status, data?.error || 'Something went wrong', data?.details);
  }
  return data;
}

export const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};
