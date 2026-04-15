/**
 * Web Search Skill
 * Queries the Brave Search API, falls back to DuckDuckGo's free JSON
 * endpoint when no Brave key is configured.
 *
 * Exposes a single async function — `search(query, opts)` — that
 * returns a formatted string suitable for direct LLM consumption, plus
 * `rawSearch()` for the underlying result array.
 */

import axios from 'axios';
import { config } from '../../utils/config.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('skill:web-search');

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const DDG_ENDPOINT = 'https://api.duckduckgo.com/';

export async function rawSearch(query, { count = 5 } = {}) {
  if (!query || !query.trim()) return [];

  if (config.skills.braveApiKey) {
    try {
      const res = await axios.get(BRAVE_ENDPOINT, {
        params: { q: query, count },
        headers: { 'X-Subscription-Token': config.skills.braveApiKey },
        timeout: 10000,
      });
      const results = res.data?.web?.results ?? [];
      return results.map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
        source: 'brave',
      }));
    } catch (err) {
      log.error(`Brave search failed: ${err.message}`);
    }
  }

  // DuckDuckGo fallback — no key required, limited coverage
  try {
    const res = await axios.get(DDG_ENDPOINT, {
      params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 },
      timeout: 10000,
    });
    const data = res.data || {};
    const related = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
    const out = [];
    if (data.AbstractText) {
      out.push({
        title: data.Heading || query,
        url: data.AbstractURL || '',
        snippet: data.AbstractText,
        source: 'duckduckgo',
      });
    }
    for (const item of related.slice(0, count)) {
      if (item.Text && item.FirstURL) {
        out.push({
          title: item.Text.split(' - ')[0],
          url: item.FirstURL,
          snippet: item.Text,
          source: 'duckduckgo',
        });
      }
    }
    return out;
  } catch (err) {
    log.error(`DuckDuckGo fallback failed: ${err.message}`);
    return [];
  }
}

export async function search(query, opts = {}) {
  const results = await rawSearch(query, opts);
  if (!results.length) return `No results found for "${query}".`;
  return results
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
    .join('\n\n');
}

export default { search, rawSearch };
