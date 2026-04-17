/**
 * Cross-Domain Knowledge Transfer (CDKT) Skill
 *
 * Entrypoint that assembles the four CDKT layers:
 *   DomainRegistry → CrossDomainMapper → KnowledgeSynthesizer → CollaborationEngine
 *
 * Exposes three SkillExecutor-compatible skill functions:
 *
 *   cdkt_map       — Fast bridge map: which domains apply and why
 *   cdkt_synthesise — Full synthesis: multi-domain solution strategies
 *   cdkt_council   — Premium: full interdisciplinary council + innovation report
 *
 * Also exports the component classes for direct use by other modules.
 */

import { DomainRegistry } from './domain-registry.js';
import { CrossDomainMapper } from './cross-domain-mapper.js';
import { KnowledgeSynthesizer } from './knowledge-synthesizer.js';
import { CollaborationEngine } from './collaboration-engine.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cdkt');

/* ------------------------------------------------------------------ *
 * Singleton assembly
 * ------------------------------------------------------------------ */

let _registry = null;
let _mapper = null;
let _synthesizer = null;
let _engine = null;

function getCDKT() {
  if (!_registry) {
    _registry   = new DomainRegistry();
    _mapper     = new CrossDomainMapper(_registry);
    _synthesizer = new KnowledgeSynthesizer(_registry);
    _engine     = new CollaborationEngine(_registry, _mapper, _synthesizer);
    log.info('CDKT framework initialised');
  }
  return { registry: _registry, mapper: _mapper, synthesizer: _synthesizer, engine: _engine };
}

/* ------------------------------------------------------------------ *
 * Skill functions (SkillExecutor-compatible)
 * ------------------------------------------------------------------ */

/**
 * cdkt_map — Fast, zero-LLM bridge map.
 * Args: problem string
 * Returns: JSON string describing relevant domains and patterns
 */
export async function cdktMap(args) {
  const problem = String(args).trim();
  if (!problem) return 'Error: provide a problem statement';

  const { mapper } = getCDKT();
  const bridgeMap = mapper.buildBridgeMap(problem, { topN: 5 });

  const lines = [
    `Problem: ${problem}`,
    '',
    `Top domains:`,
    ...bridgeMap.topDomains.map(s =>
      `  • ${s.domain.name} (score ${s.score}) — keywords: ${s.matchedKeywords.join(', ') || 'general relevance'}`),
    '',
    `Universal patterns detected:`,
    ...(bridgeMap.universalPatterns.length
      ? bridgeMap.universalPatterns.map(p => `  • ${p.pattern}: ${p.description}`)
      : ['  (none matched)']),
    '',
    `Cross-domain bridges:`,
    ...(bridgeMap.pairwiseAnalogies.length
      ? bridgeMap.pairwiseAnalogies.map(a =>
          `  ${a.from} ↔ ${a.to}: ${a.bridges.map(b => b.bridge).join('; ')}`)
      : ['  (none found in seed data)']),
  ];

  return lines.join('\n');
}

/**
 * cdkt_synthesise — Full synthesis pipeline.
 * Args: problem string
 * Returns: JSON string with ranked strategies
 */
export async function cdktSynthesise(args) {
  const problem = String(args).trim();
  if (!problem) return 'Error: provide a problem statement';

  const { mapper, synthesizer } = getCDKT();
  const bridgeMap = mapper.buildBridgeMap(problem, { topN: 4 });
  const report = await synthesizer.synthesise(problem, bridgeMap, {
    maxDomains: 4,
    generateAlternatives: 2,
  });

  if (!report.primaryStrategy) return 'Could not generate a synthesis strategy.';

  const ps = report.primaryStrategy;
  const lines = [
    `## Interdisciplinary Synthesis Report`,
    `**Problem:** ${problem}`,
    '',
    `**Primary Strategy:** ${ps.strategy_name ?? 'Unnamed'}`,
    `**Core Insight:** ${ps.core_insight ?? '-'}`,
    '',
    `**Approach:**`,
    ps.approach ?? '-',
    '',
    `**Domain contributions:**`,
    ...(ps.domain_contributions ?? []).map(dc =>
      `  • [${dc.domain}] ${dc.contribution}`),
    '',
    `**Innovation hypothesis:** ${ps.innovation_hypothesis ?? '-'}`,
    '',
    `**Risks:** ${(ps.risks ?? []).join(', ') || 'none listed'}`,
    `**Confidence:** ${ps.composite_score ?? ps.confidence ?? 'N/A'}/100`,
    '',
    report.strategies.length > 1
      ? `**Alternative strategies:**\n` +
        report.strategies.slice(1).map(s =>
          `  • ${s?.strategy_name ?? 'Unnamed'} (score ${s?.composite_score ?? '-'}): ${s?.core_insight ?? ''}`
        ).join('\n')
      : '',
  ];

  return lines.filter(l => l !== '').join('\n');
}

/**
 * cdkt_council — Full interdisciplinary council with Innovation Report.
 * Args: problem string  (optionally JSON: {"problem":"...", "domains": 5})
 * Returns: Formatted markdown innovation report
 */
export async function cdktCouncil(args) {
  let problem;
  let maxDomains = 5;

  try {
    const parsed = JSON.parse(String(args));
    problem = parsed.problem ?? String(args);
    maxDomains = parsed.domains ?? 5;
  } catch {
    problem = String(args).trim();
  }

  if (!problem) return 'Error: provide a problem statement';

  const { engine } = getCDKT();
  const report = await engine.conveneCouncil(problem, {
    maxDomains,
    includeDevilsAdvocate: true,
    enrichWithLLM: false,
  });

  return CollaborationEngine.formatReport(report);
}

/* ------------------------------------------------------------------ *
 * Register into a SkillExecutor
 * ------------------------------------------------------------------ */

/**
 * Register all three CDKT skills into a SkillExecutor instance.
 * Call this from the main boot sequence (index.js) after creating the executor.
 *
 * @param {import('../executor.js').SkillExecutor} executor
 */
export function registerCDKTSkills(executor) {
  executor.register('cdkt_map', cdktMap);
  executor.register('cdkt_synthesise', cdktSynthesise);
  executor.register('cdkt_council', cdktCouncil);
  log.info('CDKT skills registered: cdkt_map, cdkt_synthesise, cdkt_council');
}

/* ------------------------------------------------------------------ *
 * Direct-use API
 * ------------------------------------------------------------------ */

export {
  DomainRegistry,
  CrossDomainMapper,
  KnowledgeSynthesizer,
  CollaborationEngine,
  getCDKT,
};

export default { cdktMap, cdktSynthesise, cdktCouncil, registerCDKTSkills, getCDKT };
