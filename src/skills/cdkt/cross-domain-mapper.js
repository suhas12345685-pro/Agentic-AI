/**
 * Cross-Domain Mapper
 *
 * Given a problem statement, scores every registered domain for relevance,
 * then identifies structural analogies — patterns that appear in two or more
 * domains and can serve as conceptual bridges.
 *
 * Scoring uses three tiers:
 *   1. Keyword overlap     (fast, zero-cost, always runs)
 *   2. Principle matching  (semantic similarity via keyword expansion)
 *   3. LLM reranking       (optional, called only for the top-N candidates)
 */

import { routeQuery } from '../../brain/llm-router.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cdkt:mapper');

const RERANK_PROMPT = `You are an interdisciplinary knowledge mapper.
Given a problem and a list of knowledge domains, rank the top 5 most relevant domains.
For each, explain in one sentence WHY it is relevant.
Also identify up to 3 cross-domain analogies — structural patterns that appear in multiple fields.

Output JSON:
{
  "ranked_domains": [
    { "id": "<domain_id>", "relevance_score": 0-100, "why": "<sentence>" }
  ],
  "analogies": [
    { "pattern": "<name>", "appears_in": ["<id>", "<id>"], "description": "<one sentence>" }
  ]
}`;

/* Canonical pattern library — pre-defined structural analogies */
const UNIVERSAL_PATTERNS = [
  {
    pattern: 'Feedback Loop',
    appears_in: ['biology', 'physics', 'engineering', 'economics', 'psychology'],
    description: 'A system output feeds back to modify its own input, enabling self-regulation.',
    keywords: ['feedback', 'control', 'regulation', 'homeostasis', 'equilibrium', 'loop'],
  },
  {
    pattern: 'Emergence',
    appears_in: ['biology', 'physics', 'economics', 'computer-science', 'mathematics'],
    description: 'Complex global behaviour arising from simple local interactions.',
    keywords: ['emergence', 'complex', 'network', 'swarm', 'collective', 'self-organise'],
  },
  {
    pattern: 'Optimisation Under Constraint',
    appears_in: ['economics', 'engineering', 'mathematics', 'biology', 'computer-science'],
    description: 'Maximising or minimising an objective subject to resource limits.',
    keywords: ['optimise', 'constraint', 'trade-off', 'efficient', 'minimise', 'maximise'],
  },
  {
    pattern: 'Modularity',
    appears_in: ['biology', 'engineering', 'computer-science', 'economics'],
    description: 'Decomposing a system into independent, composable units with clear interfaces.',
    keywords: ['modular', 'component', 'interface', 'decompose', 'isolate', 'encapsulate'],
  },
  {
    pattern: 'Phase Transition',
    appears_in: ['physics', 'economics', 'mathematics', 'psychology'],
    description: 'A sudden qualitative shift in system state triggered by crossing a threshold.',
    keywords: ['threshold', 'tipping point', 'phase', 'transition', 'critical', 'collapse', 'crisis'],
  },
  {
    pattern: 'Natural Selection / Evolutionary Search',
    appears_in: ['biology', 'computer-science', 'economics', 'mathematics'],
    description: 'Iteratively selecting, recombining, and mutating candidate solutions.',
    keywords: ['evolution', 'selection', 'genetic', 'mutation', 'fitness', 'iteration', 'survival'],
  },
  {
    pattern: 'Redundancy for Resilience',
    appears_in: ['biology', 'engineering', 'computer-science', 'economics'],
    description: 'Duplicating critical components so failure of one does not halt the whole.',
    keywords: ['redundancy', 'backup', 'resilience', 'fault-tolerant', 'replication', 'diversity'],
  },
  {
    pattern: 'Abstraction Hierarchy',
    appears_in: ['computer-science', 'philosophy', 'mathematics', 'engineering'],
    description: 'Hiding low-level detail behind progressively higher-level interfaces.',
    keywords: ['abstraction', 'layer', 'interface', 'hide', 'encapsulate', 'hierarchy', 'model'],
  },
  {
    pattern: 'Incentive Alignment',
    appears_in: ['economics', 'psychology', 'engineering', 'biology'],
    description: 'Designing reward structures so individual agents pursue collective goals.',
    keywords: ['incentive', 'reward', 'align', 'motivation', 'game theory', 'mechanism design'],
  },
  {
    pattern: 'Scale-Free Power Laws',
    appears_in: ['mathematics', 'physics', 'biology', 'economics', 'computer-science'],
    description: 'A small number of nodes / events account for a disproportionately large share of impact.',
    keywords: ['power law', 'pareto', 'long tail', 'scale-free', 'hub', 'fat tail', '80/20'],
  },
];

/* ------------------------------------------------------------------ *
 * CrossDomainMapper
 * ------------------------------------------------------------------ */

export class CrossDomainMapper {
  /**
   * @param {import('./domain-registry.js').DomainRegistry} registry
   */
  constructor(registry) {
    this.registry = registry;
  }

  /**
   * Score all domains for relevance to the problem.
   * Returns an array sorted by score descending.
   *
   * @param {string} problem
   * @returns {{ domain: object, score: number, matchedKeywords: string[] }[]}
   */
  scoreRelevance(problem) {
    const tokens = this._tokenise(problem);
    const results = [];

    for (const domain of this.registry.list()) {
      const matches = new Set();

      const allText = [
        domain.description,
        ...domain.core_principles,
        ...domain.methodologies,
        ...domain.key_concepts,
      ].map(s => s.toLowerCase());

      for (const token of tokens) {
        for (const text of allText) {
          if (text.includes(token)) { matches.add(token); break; }
        }
      }

      // Weight: key_concepts most valuable, principles second, other text last
      let score = 0;
      for (const m of matches) {
        const inConcepts = domain.key_concepts.some(c => c.toLowerCase().includes(m));
        const inPrinciples = domain.core_principles.some(p => p.toLowerCase().includes(m));
        score += inConcepts ? 3 : inPrinciples ? 2 : 1;
      }

      results.push({ domain, score, matchedKeywords: [...matches] });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Find universal patterns that are relevant to the problem.
   * @param {string} problem
   * @returns {object[]}
   */
  findPatterns(problem) {
    const tokens = this._tokenise(problem);
    return UNIVERSAL_PATTERNS
      .map(p => {
        const hits = p.keywords.filter(kw => tokens.some(t => t.includes(kw) || kw.includes(t)));
        return { ...p, relevanceScore: hits.length, matchedKeywords: hits };
      })
      .filter(p => p.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Build a "bridge map" for a given problem:
   * - Top-N most relevant domains
   * - Applicable universal patterns
   * - Known pairwise analogies between top domains
   *
   * @param {string} problem
   * @param {{ topN?: number }} opts
   */
  buildBridgeMap(problem, { topN = 5 } = {}) {
    const scored = this.scoreRelevance(problem).slice(0, topN);
    const patterns = this.findPatterns(problem);

    const topIds = scored.map(s => s.domain.id);
    const pairwiseAnalogies = [];

    for (let i = 0; i < topIds.length; i++) {
      for (let j = i + 1; j < topIds.length; j++) {
        const bridges = this.registry.getAnalogiesBetween(topIds[i], topIds[j]);
        if (bridges.length) {
          pairwiseAnalogies.push({ from: topIds[i], to: topIds[j], bridges });
        }
      }
    }

    return {
      problem,
      topDomains: scored,
      universalPatterns: patterns,
      pairwiseAnalogies,
      timestamp: Date.now(),
    };
  }

  /**
   * Optional LLM reranking for higher accuracy.
   * Upgrades the bridge map with LLM-ranked domain relevance and LLM-detected analogies.
   *
   * @param {string} problem
   * @param {object} bridgeMap  Output of buildBridgeMap()
   */
  async enrichWithLLM(problem, bridgeMap) {
    log.info('Running LLM enrichment for bridge map');

    const domainList = bridgeMap.topDomains
      .map(s => `${s.domain.id}: ${s.domain.name} — ${s.domain.description}`)
      .join('\n');

    const prompt =
      `Problem: ${problem}\n\n` +
      `Candidate domains:\n${domainList}\n\n` +
      `Universal patterns already detected: ${bridgeMap.universalPatterns.map(p => p.pattern).join(', ') || 'none'}`;

    try {
      const raw = await routeQuery(prompt, RERANK_PROMPT);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in LLM response');

      const llmData = JSON.parse(jsonMatch[0]);

      return {
        ...bridgeMap,
        llmRankedDomains: llmData.ranked_domains ?? [],
        llmAnalogies: llmData.analogies ?? [],
        llmEnriched: true,
      };
    } catch (err) {
      log.error(`LLM enrichment failed: ${err.message}`);
      return { ...bridgeMap, llmEnriched: false };
    }
  }

  _tokenise(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 3);
  }
}

export { UNIVERSAL_PATTERNS };
export default CrossDomainMapper;
