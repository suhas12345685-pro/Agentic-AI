/**
 * Knowledge Synthesizer
 *
 * Takes a problem + bridge map (from CrossDomainMapper) and synthesises a
 * unified, actionable solution by:
 *
 *   1. Extracting the most applicable principles from each relevant domain
 *   2. Mapping those principles onto the problem context
 *   3. Generating an innovation hypothesis — a novel approach that explicitly
 *      borrows structure from at least two domains
 *   4. Producing a scored, ranked list of solution strategies
 *
 * All LLM calls use targeted prompts so the model can't drift into
 * generic advice — every output must cite the domain it borrows from.
 */

import { routeQuery } from '../../brain/llm-router.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cdkt:synthesizer');

/* ------------------------------------------------------------------ *
 * Prompt templates
 * ------------------------------------------------------------------ */

const PRINCIPLE_EXTRACTION_PROMPT = `You are an interdisciplinary problem-solving assistant.
Given a problem and a knowledge domain, identify the 2-3 principles from that domain
that are MOST applicable to the problem. For each principle, write a concrete "transfer statement"
— a one-sentence restatement of the principle applied to the specific problem.

Output JSON array:
[
  { "principle": "<original principle>", "transfer": "<how it applies to this problem>" }
]

Be specific. Do not give generic advice.`;

const SYNTHESIS_PROMPT = `You are an interdisciplinary innovation engine.
You have extracted domain principles that apply to the problem below.
Your task: synthesise a novel solution strategy that EXPLICITLY integrates
insights from at least 2 domains. Label every borrowed idea with its source domain.

Structure your output as JSON:
{
  "strategy_name": "<short name>",
  "core_insight": "<one sentence — the key cross-domain idea>",
  "approach": "<3-5 sentences describing the approach>",
  "domain_contributions": [
    { "domain": "<name>", "contribution": "<what this field contributes>" }
  ],
  "innovation_hypothesis": "<bold prediction about what makes this approach novel>",
  "risks": ["<risk>"],
  "confidence": 0-100
}`;

const RANKING_PROMPT = `You are an expert evaluator.
Score each solution strategy below for a given problem on:
  - Feasibility (0-100): Can it be executed with realistic resources?
  - Impact (0-100): How significantly does it address the root problem?
  - Novelty (0-100): How much does it depart from conventional approaches?
  - Interdisciplinary depth (0-100): How meaningfully does it integrate multiple fields?

Output JSON array matching the strategies:
[{ "strategy_name": "...", "feasibility": 0, "impact": 0, "novelty": 0, "interdisciplinary_depth": 0, "composite_score": 0 }]`;

/* ------------------------------------------------------------------ *
 * KnowledgeSynthesizer
 * ------------------------------------------------------------------ */

export class KnowledgeSynthesizer {
  /**
   * @param {import('./domain-registry.js').DomainRegistry} registry
   */
  constructor(registry) {
    this.registry = registry;
  }

  /**
   * Main synthesis pipeline.
   *
   * @param {string} problem
   * @param {object} bridgeMap   Output of CrossDomainMapper.buildBridgeMap()
   * @param {{ maxDomains?: number, generateAlternatives?: number }} opts
   * @returns {Promise<SynthesisReport>}
   */
  async synthesise(problem, bridgeMap, { maxDomains = 4, generateAlternatives = 2 } = {}) {
    log.info(`Synthesising solution for: "${problem.slice(0, 80)}"`);

    const topDomains = (bridgeMap.topDomains ?? []).slice(0, maxDomains);
    if (topDomains.length === 0) {
      log.warn('No domains in bridge map — cannot synthesise');
      return this._emptyReport(problem);
    }

    // Step 1: Extract applicable principles from each domain in parallel
    const principleExtracts = await Promise.all(
      topDomains.map(({ domain }) => this._extractPrinciples(problem, domain))
    );

    // Step 2: Build enriched context for the synthesis call
    const enrichedContext = topDomains.map((s, i) => ({
      domain: s.domain,
      matchedKeywords: s.matchedKeywords,
      applicablePrinciples: principleExtracts[i],
    }));

    // Step 3: Generate primary synthesis strategy
    const primaryStrategy = await this._generateStrategy(problem, enrichedContext, bridgeMap);

    // Step 4: Generate alternative strategies (different domain combinations)
    const alternatives = [];
    for (let i = 0; i < Math.min(generateAlternatives, topDomains.length - 1); i++) {
      const subset = [...enrichedContext];
      // Rotate domain emphasis for each alternative
      subset.push(subset.shift());
      const alt = await this._generateStrategy(problem, subset, bridgeMap, i + 1);
      alternatives.push(alt);
    }

    const allStrategies = [primaryStrategy, ...alternatives].filter(Boolean);

    // Step 5: Score and rank all strategies
    const ranked = await this._rankStrategies(problem, allStrategies);

    return {
      problem,
      topDomains: topDomains.map(s => ({ id: s.domain.id, name: s.domain.name, score: s.score })),
      universalPatterns: (bridgeMap.universalPatterns ?? []).map(p => p.pattern),
      enrichedContext,
      strategies: ranked,
      primaryStrategy: ranked[0] ?? primaryStrategy,
      timestamp: Date.now(),
    };
  }

  /**
   * Extract the 2-3 most applicable principles from a domain for a problem.
   * @returns {{ principle: string, transfer: string }[]}
   */
  async _extractPrinciples(problem, domain) {
    const domainSummary = this.registry.summarise(domain.id);
    const prompt =
      `Problem: ${problem}\n\n` +
      `Domain context:\n${domainSummary}`;

    try {
      const raw = await routeQuery(prompt, PRINCIPLE_EXTRACTION_PROMPT);
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      return JSON.parse(jsonMatch[0]).slice(0, 3);
    } catch (err) {
      log.error(`Principle extraction failed for ${domain.id}: ${err.message}`);
      return domain.core_principles.slice(0, 2).map(p => ({ principle: p, transfer: p }));
    }
  }

  /**
   * Generate a synthesis strategy that integrates multiple domain insights.
   * @param {string} problem
   * @param {object[]} enrichedContext
   * @param {object} bridgeMap
   * @param {number} [variant=0]  Variant index — used to nudge the LLM toward a different emphasis
   */
  async _generateStrategy(problem, enrichedContext, bridgeMap, variant = 0) {
    const contextText = enrichedContext
      .map(ec => {
        const principles = ec.applicablePrinciples
          .map(p => `  • [${ec.domain.name}] ${p.transfer}`)
          .join('\n');
        return `${ec.domain.name}:\n${principles || '  (no specific principles extracted)'}`;
      })
      .join('\n\n');

    const patternText = (bridgeMap.universalPatterns ?? [])
      .slice(0, 3)
      .map(p => `• ${p.pattern}: ${p.description}`)
      .join('\n');

    const variantHint = variant > 0
      ? `\nVariant ${variant}: emphasise a different primary domain than the previous strategy.`
      : '';

    const prompt =
      `Problem: ${problem}\n\n` +
      `Domain principles applicable to this problem:\n${contextText}\n\n` +
      `Universal cross-domain patterns detected:\n${patternText || 'none'}\n\n` +
      `Synthesise a novel solution strategy that explicitly integrates multiple domains.${variantHint}`;

    try {
      const raw = await routeQuery(prompt, SYNTHESIS_PROMPT);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');
      return { ...JSON.parse(jsonMatch[0]), variant };
    } catch (err) {
      log.error(`Strategy generation failed (variant ${variant}): ${err.message}`);
      return null;
    }
  }

  /**
   * Score and rank strategies, computing a composite score.
   */
  async _rankStrategies(problem, strategies) {
    if (strategies.length === 0) return [];
    if (strategies.length === 1) {
      return [{ ...strategies[0], composite_score: strategies[0].confidence ?? 70 }];
    }

    const strategyList = strategies
      .map((s, i) => `Strategy ${i + 1}: ${s?.strategy_name ?? 'Unnamed'}\n${s?.approach ?? ''}`)
      .join('\n\n');

    const prompt = `Problem: ${problem}\n\nStrategies to rank:\n${strategyList}`;

    try {
      const raw = await routeQuery(prompt, RANKING_PROMPT);
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON');

      const scores = JSON.parse(jsonMatch[0]);
      return strategies.map((s, i) => {
        const sc = scores[i] ?? {};
        const composite = sc.composite_score ??
          Math.round(((sc.feasibility ?? 70) + (sc.impact ?? 70) + (sc.novelty ?? 60) + (sc.interdisciplinary_depth ?? 60)) / 4);
        return { ...s, ...sc, composite_score: composite };
      }).sort((a, b) => b.composite_score - a.composite_score);
    } catch (err) {
      log.error(`Ranking failed: ${err.message}`);
      return strategies.map(s => ({ ...s, composite_score: s?.confidence ?? 60 }));
    }
  }

  _emptyReport(problem) {
    return {
      problem,
      topDomains: [],
      universalPatterns: [],
      enrichedContext: [],
      strategies: [],
      primaryStrategy: null,
      timestamp: Date.now(),
    };
  }
}

export default KnowledgeSynthesizer;
