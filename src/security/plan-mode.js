/**
 * Security — Plan Mode
 * Before executing destructive actions, sends a plan to the user for approval.
 */

import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('security:plan-mode');

const DESTRUCTIVE_ACTIONS = ['delete', 'remove', 'send_email', 'post_message', 'write_file', 'execute'];

/**
 * Check if an action requires plan mode approval.
 */
export function requiresApproval(actionName) {
  if (!config.security.planModeEnabled) return false;
  return DESTRUCTIVE_ACTIONS.some(a => actionName.toLowerCase().includes(a));
}

/**
 * Format a plan for user review.
 */
export function formatPlan(actions) {
  const lines = actions.map(a => `  \u2022 ${a.name}(${a.args || ''})`);
  return `JARVIS Plan Review:\n${lines.join('\n')}\n\nApprove? /yes or /no`;
}

/**
 * Create a plan approval request.
 */
export function createApprovalRequest(actions) {
  return {
    id: `plan_${Date.now()}`,
    actions,
    message: formatPlan(actions),
    status: 'pending',
    created_at: Date.now(),
  };
}
