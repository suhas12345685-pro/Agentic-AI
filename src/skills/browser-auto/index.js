/**
 * Browser Automation Skill
 *
 * Thin wrapper around Puppeteer (dynamically imported so the core
 * doesn't depend on it at boot). Provides a small scripting language
 * for multi-step page flows that a planner can emit:
 *
 *   [
 *     { op: 'goto',    url: 'https://example.com' },
 *     { op: 'type',    selector: '#q', text: 'hello' },
 *     { op: 'click',   selector: '#submit' },
 *     { op: 'wait',    ms: 1000 },
 *     { op: 'extract', selector: 'h1', as: 'headline' }
 *   ]
 *
 * Returns { ok, data, screenshots? }.
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('skill:browser-auto');

async function loadPuppeteer() {
  try {
    return (await import('puppeteer')).default;
  } catch (err) {
    throw new Error(`Puppeteer is not installed. Run: npm install puppeteer (${err.message})`);
  }
}

export class BrowserAuto {
  constructor({ headless = 'new', defaultTimeoutMs = 30_000 } = {}) {
    this.headless = headless;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.browser = null;
  }

  async _ensure() {
    if (this.browser) return this.browser;
    const puppeteer = await loadPuppeteer();
    this.browser = await puppeteer.launch({
      headless: this.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    log.info('Puppeteer browser launched');
    return this.browser;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      log.info('Puppeteer browser closed');
    }
  }

  /**
   * Run a list of ops in a single page.
   */
  async runScript(ops) {
    if (!Array.isArray(ops) || ops.length === 0) {
      throw new TypeError('runScript: ops must be a non-empty array');
    }

    const browser = await this._ensure();
    const page = await browser.newPage();
    page.setDefaultTimeout(this.defaultTimeoutMs);

    const data = {};
    const screenshots = [];

    try {
      for (const op of ops) {
        log.info(`op: ${op.op}`);
        switch (op.op) {
          case 'goto':
            await page.goto(op.url, { waitUntil: op.waitUntil ?? 'domcontentloaded' });
            break;
          case 'click':
            await page.click(op.selector);
            break;
          case 'type':
            await page.type(op.selector, op.text ?? '');
            break;
          case 'wait':
            if (op.selector) await page.waitForSelector(op.selector);
            else await new Promise(r => setTimeout(r, op.ms ?? 500));
            break;
          case 'extract': {
            const value = await page.$eval(op.selector, el => el.textContent?.trim() ?? '');
            data[op.as || op.selector] = value;
            break;
          }
          case 'extractAll': {
            const values = await page.$$eval(op.selector, els => els.map(e => e.textContent?.trim() ?? ''));
            data[op.as || op.selector] = values;
            break;
          }
          case 'evaluate': {
            // eslint-disable-next-line no-new-func
            const fn = new Function(`return (${op.fn})`)();
            data[op.as || 'eval'] = await page.evaluate(fn);
            break;
          }
          case 'screenshot': {
            const buf = await page.screenshot({ fullPage: op.fullPage ?? false });
            screenshots.push({ step: op.as || 'screenshot', buffer: buf });
            break;
          }
          case 'title':
            data[op.as || 'title'] = await page.title();
            break;
          case 'url':
            data[op.as || 'url'] = page.url();
            break;
          case 'html':
            data[op.as || 'html'] = await page.content();
            break;
          default:
            throw new Error(`Unknown op: ${op.op}`);
        }
      }
      return { ok: true, data, screenshots };
    } catch (err) {
      log.error(`Script failed: ${err.message}`);
      return { ok: false, error: err.message, data, screenshots };
    } finally {
      await page.close();
    }
  }

  /** Convenience: fetch the rendered HTML + title of a single URL. */
  async fetchPage(url) {
    return this.runScript([
      { op: 'goto', url },
      { op: 'title', as: 'title' },
      { op: 'html', as: 'html' },
    ]);
  }
}

export default BrowserAuto;
