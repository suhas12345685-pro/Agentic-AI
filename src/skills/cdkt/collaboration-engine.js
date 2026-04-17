/**
 * Collaboration Engine
 *
 * Simulates a structured interdisciplinary council:
 *
 *   1. A "domain specialist" agent speaks for each relevant domain,
 *      contributing its field's unique perspective on the problem.
 *   2. A "devil's advocate" agent challenges every proposed insight.
 *   3. A "mediator" agent synthesises all perspectives into an
 *      Innovation Report — structured enough to drive decisions.
 *
 * This is the highest-level reasoning layer in the CDKT framework.
 * It wraps CrossDomainMapper + KnowledgeSynthesizer and adds the
 * collaborative deliberation layer on top.
 */

import { routeQuery } from '../../brain/llm-router.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cdkt:collaboration');

/* ------------------------------------------------------------------ *
 * Prompt templates
 * ------------------------------------------------------------------ */

function specialistPrompt(domainName) {
  return `You are a world-class expert in ${domainName}. A multi-disciplinary team is tackling the problem below.
Your role: contribute the most valuable insight FROM YOUR FIELD SPECIFICALLY.
Do NOT give generic advice. Draw directly on ${domainName} principles, tools, and vocabulary.
Identify one thing that practitioners in other fields consistently overlook.

Output JSON:
{
  "domain": "${domainName}",
  "core_insight": "<one powerful sentence>",
  "mechanism": "<2-3 sentences explaining the mechanism from your domain>",
  "concrete_action": "<one specific, actionable recommendation>",
  "blind_spot": "<what other fields tend to miss about this problem>",
  "confidence": 0-100
}`;
}

const DEVIL_ADVOCATE_PROMPT = `You are a rigorous devil's advocate. Review the specialist insights below.
For each, identify the single most important weakness, assumption, or failure mode.
Then propose a synthesis that addresses these weaknesses.

Output JSON:
{
  "critiques": [
    { "domain": "<domain>", "weakness": "<one-sentence critique>" }
  ],
  "strengthened_synthesis": "<paragraph: how to integrate the valid parts while mitigating the weaknesses>"
}`;

const MEDIATOR_PROMPT = `You are the mediator of an interdisciplinary innovation council.
You have received specialist insights, devil's advocate critiques, and a synthesis report.
Your task: produce the final Innovation Report.

Output JSON:
{
  "executive_summary": "<3 sentences: problem, breakthrough insight, recommended path>",
  "key_decisions": [
    { "decision": "<what to decide>", "rationale": "<why>", "domain_source": "<which fields inform this>" }
  ],
  "interdisciplinary_innovations": [
    { "innovation": "<name>", "description": "<sentence>", "fields_combined": ["<field>"] }
  ],
  "implementation_roadmap": [
    { "phase": 1, "title": "<short title>", "actions": ["<action>"], "domain_lead": "<field>" }
  ],
  "risk_matrix": [
    { "risk": "<risk>", "likelihood": "low|medium|high", "mitigation": "<from which domain>" }
  ],
  "success_metrics": ["<measurable metric>"],
  "confidence": 0-100
}`;

/* ------------------------------------------------------------------ *
 * CollaborationEngine
 * ------------------------------------------------------------------ */

export class CollaborationEngine {
  /**
   * @param {import('./domain-registry.js').DomainRegistry} registry
   * @param {import('./cross-domain-mapper.js').CrossDomainMapper} mapper
   * @param {import('./knowledge-synthesizer.js').KnowledgeSynthesizer} synthesizer
   */
  constructor(registry, mapper, synthesizer) {
    this.registry = registry;
    this.mapper = mapper;
    this.synthesizer = synthesizer;
  }

  /**
   * Run a full interdisciplinary council session.
   *
   * @param {string} problem
   * @param {{
   *   maxDomains?: number,
   *   includeDevilsAdvocate?: boolean,
   *   enrichWithLLM?: boolean
   * }} opts
   * @returns {Promise<CouncilReport>}
   */
  async conveneCouncil(problem, {
    maxDomains = 5,
    includeDevilsAdvocate = true,
    enrichWithLLM = false,
  } = {}) {
    log.info(`Council convened for: "${problem.slice(0, 80)}"`);

    // Phase 1: Map the domain landscape
    let bridgeMap = this.mapper.buildBridgeMap(problem, { topN: maxDomains });
    if (enrichWithLLM) {
      bridgeMap = await this.mapper.enrichWithLLM(problem, bridgeMap);
    }

    const selectedDomains = bridgeMap.topDomains.slice(0, maxDomains);
    log.info(`Selected domains: ${selectedDomains.map(s => s.domain.name).join(', ')}`);

    // Phase 2: Specialist agents speak in parallel
    const specialistContributions = await this._runSpecialists(problem, selectedDomains);
    log.info(`${specialistContributions.length} specialist contributions collected`);

    // Phase 3: Knowledge synthesis (runs the synthesizer pipeline)
    const synthesisReport = await this.synthesizer.synthesise(problem, bridgeMap, { maxDomains });

    // Phase 4: Devil's advocate
    let devilsAdvocate = null;
    if (includeDevilsAdvocate && specialistContributions.length > 0) {
      devilsAdvocate = await this._runDevilsAdvocate(problem, specialistContributions);
      log.info('Devil\'s advocate analysis complete');
    }

    // Phase 5: Mediator produces Innovation Report
    const innovationReport = await this._runMediator(
      problem,
      specialistContributions,
      devilsAdvocate,
      synthesisReport,
    );

    return {
      problem,
      bridgeMap,
      specialistContributions,
      devilsAdvocate,
      synthesisReport,
      innovationReport,
      selectedDomains: selectedDomains.map(s => ({ id: s.domain.id, name: s.domain.name })),
      universalPatterns: bridgeMap.universalPatterns.map(p => p.pattern),
      timestamp: Date.now(),
    };
  }

  /**
   * Each specialist agent provides insight from their domain in parallel.
   */
  async _runSpecialists(problem, selectedDomains) {
    const tasks = selectedDomains.map(async ({ domain }) => {
      const domainContext = this.registry.summarise(domain.id);
      const prompt =
        `Problem: ${problem}\n\n` +
        `Your domain's knowledge:\n${domainContext}`;

      try {
        const raw = await routeQuery(prompt, specialistPrompt(domain.name));
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON');
        return JSON.parse(jsonMatch[0]);
      } catch (err) {
        log.error(`Specialist ${domain.name} failed: ${err.message}`);
        return {
          domain: domain.name,
          core_insight: `Apply ${domain.name} principles to this problem`,
          mechanism: domain.core_principles[0] ?? '',
          concrete_action: domain.methodologies[0] ?? '',
          blind_spot: 'Cross-domain integration may be undervalued',
          confidence: 50,
        };
      }
    });

    return Promise.all(tasks);
  }

  /**
   * Devil's advocate reviews all specialist contributions.
   */
  async _runDevilsAdvocate(problem, contributions) {
    const contributionText = contributions
      .map(c => `[${c.domain}] Insight: ${c.core_insight}\nAction: ${c.concrete_action}`)
      .join('\n\n');

    const prompt = `Problem: ${problem}\n\nSpecialist insights:\n${contributionText}`;

    try {
      const raw = await routeQuery(prompt, DEVIL_ADVOCATE_PROMPT);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');
      return JSON.parse(jsonMatch[0]);
    } catch (err) {
      log.error(`Devil's advocate failed: ${err.message}`);
      return {
        critiques: contributions.map(c => ({
          domain: c.domain,
          weakness: 'Ensure assumptions are validated empirically',
        })),
        strengthened_synthesis: 'Integrate domain insights while testing assumptions iteratively.',
      };
    }
  }

  /**
   * Mediator synthesises everything into a final Innovation Report.
   */
  async _runMediator(problem, contributions, devilsAdvocate, synthesisReport) {
    const contributionText = contributions
      .map(c => `[${c.domain}]\nInsight: ${c.core_insight}\nMechanism: ${c.mechanism}\nAction: ${c.concrete_action}`)
      .join('\n\n');

    const devilText = devilsAdvocate
      ? `Devil's advocate synthesis: ${devilsAdvocate.strengthened_synthesis}`
      : '';

    const synthText = synthesisReport.primaryStrategy
      ? `Synthesis strategy: ${synthesisReport.primaryStrategy.strategy_name}\n${synthesisReport.primaryStrategy.approach}`
      : '';

    const prompt =
      `Problem: ${problem}\n\n` +
      `Specialist contributions:\n${contributionText}\n\n` +
      (devilText ? `${devilText}\n\n` : '') +
      (synthText ? `${synthText}\n\n` : '') +
      `Produce the final Innovation Report.`;

    try {
      const raw = await routeQuery(prompt, MEDIATOR_PROMPT);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');
      return JSON.parse(jsonMatch[0]);
    } catch (err) {
      log.error(`Mediator failed: ${err.message}`);
      return {
        executive_summary: `Interdisciplinary analysis of "${problem.slice(0, 60)}" complete.`,
        key_decisions: [],
        interdisciplinary_innovations: [],
        implementation_roadmap: [],
        risk_matrix: [],
        success_metrics: [],
        confidence: 50,
      };
    }
  }

  /**
   * Format a council report as a human-readable markdown string.
   * @param {CouncilReport} report
   */
  static formatReport(report) {
    const ir = report.innovationReport;
    if (!ir) return 'Council report unavailable.';

    const sections = [
      `# JARVIS Innovation Council Report`,
      `**Problem:** ${report.problem}`,
      `**Domains convened:** ${report.selectedDomains.map(d => d.name).join(', ')}`,
      `**Universal patterns:** ${(report.universalPatterns ?? []).join(', ') || 'none detected'}`,
      '',
      `## Executive Summary`,
      ir.executive_summary,
      '',
      `## Key Decisions`,
      ...(ir.key_decisions ?? []).map(d =>
        `- **${d.decision}** *(${d.domain_source})*: ${d.rationale}`),
      '',
      `## Interdisciplinary Innovations`,
      ...(ir.interdisciplinary_innovations ?? []).map(inv =>
        `- **${inv.innovation}** [${inv.fields_combined?.join(' × ')}]: ${inv.description}`),
      '',
      `## Implementation Roadmap`,
      ...(ir.implementation_roadmap ?? []).map(ph =>
        `### Phase ${ph.phase}: ${ph.title} *(lead: ${ph.domain_lead})*\n` +
        ph.actions.map(a => `- ${a}`).join('\n')),
      '',
      `## Risk Matrix`,
      ...(ir.risk_matrix ?? []).map(r =>
        `- [${r.likelihood.toUpperCase()}] ${r.risk} → ${r.mitigation}`),
      '',
      `## Success Metrics`,
      ...(ir.success_metrics ?? []).map(m => `- ${m}`),
      '',
      `**Confidence:** ${ir.confidence ?? 'N/A'}/100`,
    ];

    return sections.join('\n');
  }
}

export default CollaborationEngine;
