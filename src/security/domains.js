/**
 * Security — Domain Allowlist
 * Restricts URL fetching to pre-approved domains.
 */

import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('security:domains');

/**
 * Check if a URL is within the allowed domains.
 * @param {string} url - The URL to check
 * @returns {boolean} Whether the URL is allowed
 */
export function isAllowedUrl(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const allowed = config.security.allowedDomains.some(domain => {
      const d = domain.trim().toLowerCase();
      return hostname === d || hostname.endsWith(`.${d}`);
    });

    if (!allowed) {
      log.warn(`Blocked URL outside allowlist: ${hostname}`);
    }

    return allowed;
  } catch {
    log.warn(`Invalid URL blocked: ${url}`);
    return false;
  }
}

/**
 * Fetch a URL only if it's in the allowlist.
 */
export async function safeFetch(url, options = {}) {
  if (!isAllowedUrl(url)) {
    throw new Error(`URL not in allowlist: ${url}`);
  }

  const { default: axios } = await import('axios');
  return axios.get(url, { timeout: 10000, ...options });
}
