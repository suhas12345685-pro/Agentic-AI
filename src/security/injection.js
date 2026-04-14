/**
 * Security — Injection Defense
 * Scans all external content for prompt injection patterns before LLM context injection.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('security:injection');

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above\s+instructions/i,
  /\[system\]\s*override/i,
  /\[system\]\s*new\s+instructions/i,
  /you\s+are\s+now\s+(?:a|an)\s+/i,
  /disregard\s+(?:all\s+)?(?:previous|prior|above)/i,
  /forget\s+(?:all\s+)?(?:previous|prior|your)\s+instructions/i,
  /do\s+not\s+follow\s+(?:any|your)\s+(?:previous|prior)\s+instructions/i,
  /act\s+as\s+(?:if\s+)?(?:you\s+are|you're)\s+/i,
  /pretend\s+(?:you\s+are|to\s+be|that)\s+/i,
  /new\s+system\s+prompt/i,
  /override\s+(?:system|safety|security)/i,
  /jailbreak/i,
  /DAN\s+mode/i,
];

/**
 * Scan text for prompt injection attempts.
 * @param {string} text - The text to scan
 * @returns {{ safe: boolean, matched: string[] }} Scan result
 */
export function scanForInjection(text) {
  const matched = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      matched.push(pattern.source);
    }
  }

  if (matched.length > 0) {
    log.warn(`Injection attempt detected: ${matched.length} pattern(s) matched`);
  }

  return { safe: matched.length === 0, matched };
}

/**
 * Sanitize external content by removing detected injection patterns.
 */
export function sanitize(text) {
  let cleaned = text;
  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[BLOCKED]');
  }
  return cleaned;
}
