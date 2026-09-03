import { DEFAULT_API_PORT, MANAGEMENT_API_PREFIX } from './constants';

/** Vite / preview ports serve only the UI; they are not the Management API. */
const FRONTEND_ONLY_PORTS = new Set(['5173', '4173']);

export const normalizeApiBase = (input: string): string => {
  let base = (input || '').trim();
  if (!base) return '';
  base = base.replace(/\/?v0\/management\/?$/i, '');
  base = base.replace(/\/+$/i, '');
  if (!/^https?:\/\//i.test(base)) {
    base = `http://${base}`;
  }
  return base;
};

export const computeApiUrl = (base: string): string => {
  const normalized = normalizeApiBase(base);
  if (!normalized) return '';
  return `${normalized}${MANAGEMENT_API_PREFIX}`;
};

export const resolveApiBaseFromLocation = (location: {
  protocol: string;
  hostname: string;
  port: string;
}): string => {
  const protocol = location.protocol || 'http:';
  const hostname = location.hostname || '127.0.0.1';
  const port = location.port || '';

  if (FRONTEND_ONLY_PORTS.has(port)) {
    const backendHost =
      hostname === 'localhost' || hostname === '::1' ? '127.0.0.1' : hostname;
    return normalizeApiBase(`${protocol}//${backendHost}:${DEFAULT_API_PORT}`);
  }

  const normalizedPort = port ? `:${port}` : '';
  return normalizeApiBase(`${protocol}//${hostname}${normalizedPort}`);
};

export const detectApiBaseFromLocation = (): string => {
  try {
    return resolveApiBaseFromLocation(window.location);
  } catch (error) {
    console.warn('Failed to detect api base from location, fallback to default', error);
    return normalizeApiBase(`http://127.0.0.1:${DEFAULT_API_PORT}`);
  }
};
