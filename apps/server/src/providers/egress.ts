import { URL } from 'node:url';
import { AppError } from '../core/errors.js';

/**
 * Validate that a provider endpoint is safe to connect to.
 * Blocks localhost, loopback, private/routable IPs, link-local, and .local TLD.
 */
const FORBIDDEN_HOST_RE =
  /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|::1|fe80:|fc00:|fd00:)/;

const FORBIDDEN_TLD_RE = /\.local$/i;
const FORBIDDEN_NAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', 'host.docker.internal']);

export function validateEndpoint(raw: string | null): string | null {
  if (!raw) return null;
  
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError('PROVIDER_AUTH', 'Invalid provider endpoint URL', {
      reason: `"${raw}" is not a valid URL.`,
      affected: 'provider',
      remediation: ['open_settings'],
      retryable: false,
    });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError('PROVIDER_AUTH', 'Provider endpoint must use http or https', {
      reason: `Protocol "${url.protocol}" is not allowed.`,
      affected: 'provider',
      remediation: ['open_settings'],
      retryable: false,
    });
  }

  const hostname = url.hostname.toLowerCase();

  if (FORBIDDEN_NAMES.has(hostname)) {
    throw new AppError('PROVIDER_AUTH', 'Provider endpoint targets a restricted host', {
      reason: `"${raw}" resolves to a local/loopback address.`,
      affected: 'provider',
      remediation: ['open_settings'],
      retryable: false,
    });
  }

  if (FORBIDDEN_HOST_RE.test(hostname)) {
    throw new AppError('PROVIDER_AUTH', 'Provider endpoint targets a private network address', {
      reason: `"${raw}" is a private/loopback/link-local address.`,
      affected: 'provider',
      remediation: ['open_settings'],
      retryable: false,
    });
  }

  if (FORBIDDEN_TLD_RE.test(hostname)) {
    throw new AppError('PROVIDER_AUTH', 'Provider endpoint targets a .local host', {
      reason: `"${raw}" uses the .local TLD which resolves on the local network.`,
      affected: 'provider',
      remediation: ['open_settings'],
      retryable: false,
    });
  }

  return raw;
}