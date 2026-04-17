/**
 * Domain Registry
 *
 * Canonical store of knowledge domains. Each domain captures:
 *   - core_principles  : invariant laws / patterns that always hold
 *   - methodologies    : how practitioners in that field approach problems
 *   - key_concepts     : vocabulary / entities that carry transferable meaning
 *   - analogies        : known bridges to other fields
 *
 * Domains are pre-seeded at construction and can be extended at runtime.
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('cdkt:domain-registry');

/* ------------------------------------------------------------------ *
 * Seed data — eight foundational domains
 * ------------------------------------------------------------------ */

const SEED_DOMAINS = [
  {
    id: 'biology',
    name: 'Biology',
    description: 'The study of living systems, adaptation, and emergent complexity.',
    core_principles: [
      'Natural selection favours traits that maximise reproductive fitness',
      'Systems self-regulate through feedback loops (homeostasis)',
      'Complexity emerges from simple, iterated interactions',
      'Specialisation and modularity enable division of labour',
      'Redundancy increases resilience against failure',
    ],
    methodologies: ['evolutionary optimisation', 'controlled experiment', 'systems ecology', 'phylogenetic analysis'],
    key_concepts: ['evolution', 'adaptation', 'symbiosis', 'metabolism', 'emergence', 'niche', 'ecosystem', 'gene expression'],
    analogies: [
      { target: 'computer-science', bridge: 'genetic algorithms mirror natural selection' },
      { target: 'economics', bridge: 'market niches mirror ecological niches' },
      { target: 'engineering', bridge: 'biomimicry applies biological structures to design' },
    ],
  },
  {
    id: 'physics',
    name: 'Physics',
    description: 'The study of matter, energy, forces, and the fundamental laws of the universe.',
    core_principles: [
      'Systems seek minimum-energy states (entropy / thermodynamics)',
      'Every action has an equal and opposite reaction',
      'Information is conserved — it cannot be created or destroyed',
      'Wave–particle duality: phenomena have complementary descriptions',
      'Complex behaviour arises from a small set of universal constants',
    ],
    methodologies: ['mathematical modelling', 'controlled experiment', 'dimensional analysis', 'symmetry analysis'],
    key_concepts: ['entropy', 'equilibrium', 'resonance', 'phase transition', 'feedback', 'conservation', 'emergence', 'field'],
    analogies: [
      { target: 'economics', bridge: 'market equilibrium mirrors thermodynamic equilibrium' },
      { target: 'computer-science', bridge: 'information entropy mirrors Shannon entropy' },
      { target: 'psychology', bridge: 'cognitive dissonance mirrors unstable energy states' },
    ],
  },
  {
    id: 'economics',
    name: 'Economics',
    description: 'The study of resource allocation, incentives, and emergent market behaviour.',
    core_principles: [
      'Agents respond rationally to incentives',
      'Scarcity forces trade-offs and opportunity costs',
      'Markets aggregate distributed information into prices',
      'Comparative advantage makes specialisation universally beneficial',
      'Externalities create divergence between private and social optima',
    ],
    methodologies: ['game theory', 'econometrics', 'mechanism design', 'agent-based modelling'],
    key_concepts: ['incentive', 'supply-demand', 'equilibrium', 'network effects', 'diminishing returns', 'externality', 'moat', 'arbitrage'],
    analogies: [
      { target: 'biology', bridge: 'firms in markets mirror organisms in ecosystems' },
      { target: 'physics', bridge: 'market crashes mirror phase transitions' },
      { target: 'psychology', bridge: 'loss aversion explains irrational economic behaviour' },
    ],
  },
  {
    id: 'computer-science',
    name: 'Computer Science',
    description: 'The study of computation, algorithms, data structures, and information systems.',
    core_principles: [
      'Abstraction hides complexity behind a clean interface',
      'Algorithms trade time, space, and correctness',
      'Modularity enables composability and independent scaling',
      'Caching and memoisation trade space for time',
      'Distributed systems must handle consistency, availability, and partition tolerance',
    ],
    methodologies: ['algorithmic analysis', 'formal verification', 'test-driven development', 'divide-and-conquer'],
    key_concepts: ['recursion', 'abstraction', 'concurrency', 'cache', 'state machine', 'graph', 'optimisation', 'latency'],
    analogies: [
      { target: 'biology', bridge: 'neural networks mirror brain architecture' },
      { target: 'physics', bridge: 'quantum computing exploits superposition' },
      { target: 'economics', bridge: 'algorithmic trading mirrors market microstructure' },
    ],
  },
  {
    id: 'psychology',
    name: 'Psychology',
    description: 'The study of mind, behaviour, cognition, and social dynamics.',
    core_principles: [
      'Behaviour is shaped by reinforcement and punishment (operant conditioning)',
      'Humans use heuristics and suffer predictable cognitive biases',
      'Social context profoundly influences individual decision-making',
      'Motivation follows a hierarchy from survival to self-actualisation',
      'Priming and framing alter perception without changing facts',
    ],
    methodologies: ['randomised controlled trials', 'ethnography', 'psychometrics', 'cognitive modelling'],
    key_concepts: ['bias', 'heuristic', 'motivation', 'priming', 'schema', 'social proof', 'loss aversion', 'flow state'],
    analogies: [
      { target: 'economics', bridge: 'behavioural economics applies cognitive biases to markets' },
      { target: 'computer-science', bridge: 'UX design applies cognitive load theory to interfaces' },
      { target: 'biology', bridge: 'fight-or-flight mirrors evolutionary threat responses' },
    ],
  },
  {
    id: 'engineering',
    name: 'Engineering',
    description: 'The disciplined application of science and mathematics to design reliable systems.',
    core_principles: [
      'Design for failure — assume components will break',
      'Safety margins quantify the gap between rated capacity and operating load',
      'Feedback control corrects deviations from a desired setpoint',
      'Modularity isolates failures and enables independent replacement',
      'Iterate rapidly: prototype → test → measure → refine',
    ],
    methodologies: ['systems engineering', 'failure mode analysis (FMEA)', 'root-cause analysis', 'agile prototyping'],
    key_concepts: ['redundancy', 'tolerance', 'feedback loop', 'constraint', 'trade-off', 'specification', 'throughput', 'bottleneck'],
    analogies: [
      { target: 'biology', bridge: 'immune system redundancy mirrors engineering fault tolerance' },
      { target: 'computer-science', bridge: 'microservices mirror modular mechanical assemblies' },
      { target: 'economics', bridge: 'supply-chain optimisation mirrors production engineering' },
    ],
  },
  {
    id: 'philosophy',
    name: 'Philosophy',
    description: 'The study of foundational questions about knowledge, existence, ethics, and reason.',
    core_principles: [
      'Epistemic humility: distinguish what we know from what we assume',
      'First-principles reasoning deconstructs problems to their irreducible axioms',
      'Ethics evaluates actions by consequences, duties, or virtues',
      'Dialectical thinking resolves contradictions through synthesis',
      'The map is not the territory — models simplify reality',
    ],
    methodologies: ['Socratic dialogue', 'thought experiments', 'logical analysis', 'phenomenology'],
    key_concepts: ['epistemology', 'ontology', 'determinism', 'axiom', 'dialectic', 'paradigm', 'falsifiability', 'ethics'],
    analogies: [
      { target: 'computer-science', bridge: 'formal logic underpins type theory and proof systems' },
      { target: 'physics', bridge: 'philosophy of science defines how physics generates knowledge' },
      { target: 'psychology', bridge: 'existential psychology applies philosophical identity to therapy' },
    ],
  },
  {
    id: 'mathematics',
    name: 'Mathematics',
    description: 'The study of abstract structures, patterns, proof, and quantitative relationships.',
    core_principles: [
      'Proof by contradiction: assume the negation to find a logical impossibility',
      'Abstraction identifies structure that is invariant across instances',
      'Most real-world phenomena can be modelled with differential equations',
      'Dimensional analysis constrains the space of valid physical laws',
      'Power laws and scale-free distributions dominate complex systems',
    ],
    methodologies: ['deductive proof', 'induction', 'simulation', 'graph theory', 'statistical inference'],
    key_concepts: ['invariant', 'symmetry', 'optimisation', 'probability', 'topology', 'complexity class', 'power law', 'fractal'],
    analogies: [
      { target: 'physics', bridge: 'Lie groups describe the symmetries of physical laws' },
      { target: 'computer-science', bridge: 'category theory unifies programming language semantics' },
      { target: 'economics', bridge: 'game theory is applied mathematics of strategic interaction' },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * DomainRegistry
 * ------------------------------------------------------------------ */

export class DomainRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this._domains = new Map();
    this._seedDefaults();
  }

  _seedDefaults() {
    for (const d of SEED_DOMAINS) this._domains.set(d.id, { ...d });
    log.info(`Seeded ${this._domains.size} domains`);
  }

  /**
   * Register or overwrite a domain.
   * @param {object} domain  Must include: id, name, description, core_principles, methodologies, key_concepts
   */
  register(domain) {
    if (!domain?.id || !domain?.name) throw new TypeError('domain must have id and name');
    this._domains.set(domain.id, {
      analogies: [],
      core_principles: [],
      methodologies: [],
      key_concepts: [],
      ...domain,
    });
    log.info(`Registered domain: ${domain.id}`);
  }

  get(id) { return this._domains.get(id) ?? null; }

  list() { return [...this._domains.values()]; }

  /**
   * Find domains whose concepts or principles contain the given keyword.
   * Returns domains sorted by match count (descending).
   */
  search(keyword) {
    const kw = keyword.toLowerCase();
    const scored = [];

    for (const d of this._domains.values()) {
      let score = 0;
      if (d.description.toLowerCase().includes(kw)) score += 3;
      for (const c of d.key_concepts)    if (c.toLowerCase().includes(kw)) score += 2;
      for (const p of d.core_principles) if (p.toLowerCase().includes(kw)) score += 1;
      for (const m of d.methodologies)   if (m.toLowerCase().includes(kw)) score += 1;
      if (score > 0) scored.push({ domain: d, score });
    }

    return scored.sort((a, b) => b.score - a.score).map(s => s.domain);
  }

  /** Return all analogies that bridge two specific domains. */
  getAnalogiesBetween(idA, idB) {
    const a = this._domains.get(idA);
    if (!a) return [];
    return (a.analogies ?? []).filter(an => an.target === idB);
  }

  /** Compact representation for LLM prompts. */
  summarise(id) {
    const d = this._domains.get(id);
    if (!d) return null;
    return [
      `Domain: ${d.name}`,
      `Description: ${d.description}`,
      `Core principles:\n${d.core_principles.map(p => `  • ${p}`).join('\n')}`,
      `Methodologies: ${d.methodologies.join(', ')}`,
      `Key concepts: ${d.key_concepts.join(', ')}`,
    ].join('\n');
  }
}

export default DomainRegistry;
