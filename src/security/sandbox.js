/**
 * Security — Sandbox
 * Restricts file operations to the sandbox directory.
 */

import { resolve, relative } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('security:sandbox');

/**
 * Ensure the sandbox directory exists.
 */
export function initSandbox() {
  const dir = resolve(config.security.sandboxDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    log.info(`Sandbox directory created: ${dir}`);
  }
  return dir;
}

/**
 * Check if a path is within the sandbox.
 */
export function isInSandbox(filePath) {
  const sandboxDir = resolve(config.security.sandboxDir);
  const resolved = resolve(filePath);
  const rel = relative(sandboxDir, resolved);
  const inside = !rel.startsWith('..') && !resolve(rel).startsWith(resolve('..'));

  if (!inside) {
    log.warn(`Path outside sandbox blocked: ${filePath}`);
  }

  return inside;
}

/**
 * Get a safe path within the sandbox.
 */
export function sandboxPath(filename) {
  const sandboxDir = resolve(config.security.sandboxDir);
  return resolve(sandboxDir, filename);
}
