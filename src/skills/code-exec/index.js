/**
 * Code Execution Skill
 * Runs short snippets of Python, JavaScript (Node), or shell.
 *
 * NOTE: Sandboxing is intentionally omitted here — the caller wires
 * safety on via the security guard. This module is purely about
 * reliable execution and output capture.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('skill:code-exec');

const LANGS = {
  python: { cmd: 'python3', ext: 'py' },
  py: { cmd: 'python3', ext: 'py' },
  js: { cmd: 'node', ext: 'js' },
  javascript: { cmd: 'node', ext: 'js' },
  node: { cmd: 'node', ext: 'js' },
  bash: { cmd: 'bash', ext: 'sh' },
  sh: { cmd: 'bash', ext: 'sh' },
};

/**
 * Spawn a subprocess and collect its output.
 */
function spawnOnce(cmd, args, { timeoutMs = 60000, cwd, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout,
        stderr,
        timedOut,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + err.message, timedOut });
    });
  });
}

/**
 * Execute a code snippet in the given language.
 * @param {{ language?: string, code: string, timeoutMs?: number, env?: object }} input
 */
export async function runCode({ language = 'python', code, timeoutMs = 60000, env } = {}) {
  if (!code || typeof code !== 'string') {
    throw new TypeError('runCode: code must be a non-empty string');
  }

  const lang = LANGS[String(language).toLowerCase()];
  if (!lang) throw new Error(`Unsupported language: ${language}`);

  const dir = mkdtempSync(join(tmpdir(), 'jarvis-exec-'));
  const file = join(dir, `snippet.${lang.ext}`);
  writeFileSync(file, code);

  log.info(`Running ${language} snippet (${code.length} chars)`);

  try {
    const result = await spawnOnce(lang.cmd, [file], { timeoutMs, cwd: dir, env });
    return {
      ok: result.code === 0 && !result.timedOut,
      exitCode: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut: result.timedOut,
    };
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/**
 * Parse the string form used by the skill executor:
 *   "<language>, <code>"  or  just "<code>" (defaults to python)
 */
export function parseArgs(args) {
  if (typeof args !== 'string') return { language: 'python', code: String(args ?? '') };
  const commaIdx = args.indexOf(',');
  if (commaIdx === -1) return { language: 'python', code: args.trim() };
  const maybeLang = args.slice(0, commaIdx).trim().toLowerCase();
  if (LANGS[maybeLang]) {
    return { language: maybeLang, code: args.slice(commaIdx + 1).trim() };
  }
  return { language: 'python', code: args.trim() };
}

/** Format an execution result for LLM consumption. */
export function formatResult(r) {
  const out = [];
  if (r.stdout) out.push(`[stdout]\n${r.stdout.trim()}`);
  if (r.stderr) out.push(`[stderr]\n${r.stderr.trim()}`);
  if (r.timedOut) out.push('[timeout] execution killed after deadline');
  if (!r.stdout && !r.stderr && !r.timedOut) out.push('(no output)');
  return out.join('\n');
}

export default { runCode, parseArgs, formatResult };
