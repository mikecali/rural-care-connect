const BASE = '/api';

function getToken() {
  try { return JSON.parse(localStorage.getItem('rcc_auth'))?.token; } catch { return null; }
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  post: (path, body) => request(path, { method: 'POST', body }),
  get: (path) => request(path),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
};
