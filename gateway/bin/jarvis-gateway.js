#!/usr/bin/env node

/**
 * JARVIS Gateway CLI Launcher
 * Launch with: jarvis gateway (any capitalization)
 *
 * After `npm install -g .` in the gateway/ directory,
 * this command opens http://localhost:4747 in the default browser.
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function launch() {
  console.log('\n  JARVIS Gateway — Starting...\n');

  // Start the backend server
  const serverPath = resolve(__dirname, '..', 'backend', 'server.js');
  await import(serverPath);

  // Open browser
  try {
    const open = (await import('open')).default;
    const port = process.env.GATEWAY_PORT || 4747;
    await open(`http://localhost:${port}`);
    console.log(`  Browser opened at http://localhost:${port}\n`);
  } catch {
    console.log('  Could not auto-open browser. Navigate to http://localhost:4747\n');
  }
}

launch().catch(err => {
  console.error('Gateway launch failed:', err.message);
  process.exit(1);
});
