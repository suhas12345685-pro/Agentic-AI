/**
 * Security Guard — passthrough stub.
 *
 * The project will add defensive policies (injection defense, domain
 * allowlist, sandbox, plan-mode) later. For now every hook is a
 * no-op so the rest of the system can be developed and exercised
 * end-to-end without friction.
 *
 * API is designed to stay stable when the real implementation lands.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('security');

export class SecurityGuard {
  constructor(options = {}) {
    this.enabled = options.enabled ?? false;
    if (this.enabled) log.info('SecurityGuard initialised (placeholder mode)');
  }

  /** Evaluate incoming user input. Returns { allow, reason?, input } */
  async inspectInput(input) {
    return { allow: true, input };
  }

  /** Evaluate a proposed outbound tool invocation. */
  async inspectToolCall(tool, args) {
    return { allow: true, tool, args };
  }

  /** Evaluate a URL before fetching. */
  async inspectUrl(url) {
    return { allow: true, url };
  }

  /** Evaluate a filesystem path before reading/writing. */
  async inspectPath(path, _mode = 'read') {
    return { allow: true, path };
  }
}

export const defaultGuard = new SecurityGuard({ enabled: false });
export default SecurityGuard;
