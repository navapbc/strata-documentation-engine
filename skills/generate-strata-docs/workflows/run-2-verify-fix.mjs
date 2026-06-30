export const meta = {
  name: 'strata-docs-verify-fix',
  description: 'Per doc: adversarially verify against the source, adjudicate findings, fix confirmed issues, re-verify',
  phases: [{ title: 'Verify' }, { title: 'Adjudicate' }, { title: 'Fix' }],
}

// Some Workflow runtimes deliver the `args` parameter as a JSON string rather than a
// parsed object; normalize so `_args.*` resolves whether args arrives as object or string.
const _args = typeof args === 'string' ? JSON.parse(args) : (args || {})

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          claim: { type: 'string' }, issue: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          evidence: { type: 'string' }, suggested_fix: { type: 'string' },
        },
        required: ['claim', 'issue', 'severity', 'suggested_fix'],
      },
    },
  },
  required: ['findings'],
}

const ADJ_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          claim: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'rejected'] },
          why: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          suggested_fix: { type: 'string' },
        },
        required: ['claim', 'verdict', 'why', 'severity'],
      },
    },
  },
  required: ['verdicts'],
}

const FIX_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    fixed: { type: 'boolean' },
    changes: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
  required: ['fixed', 'changes'],
}

const docs = _args.docs || []
const MAX_ROUNDS = _args.max_rounds || 2

function verify(doc, round) {
  return agent([
    'You are the adversarial verification agent for the generate-strata-docs skill.',
    `Read your instructions at ${_args.refs_dir}/agents/verifier.md and follow them exactly.`,
    `Doc to verify: ${doc.path}. Source checkout: ${doc.src_dir}.`,
    `Write findings to docs/.verification/${doc.id}.findings.md (round ${round}).`,
    'Return the findings array (empty if the doc is fully supported by the source).',
  ].join('\n'), { label: `verify:${doc.id}:r${round}`, phase: 'Verify', agentType: 'general-purpose', model: round === 1 ? 'opus' : 'haiku', effort: round === 1 ? 'low' : 'high', schema: FINDINGS_SCHEMA })
}

function adjudicate(doc, findings) {
  return agent([
    'You are the adjudication agent for the generate-strata-docs skill.',
    `Read your instructions at ${_args.refs_dir}/agents/adjudicator.md and follow them exactly.`,
    `Doc: ${doc.path}. Source checkout: ${doc.src_dir}.`,
    'Confirm or reject each finding by checking the source. Findings (JSON):',
    JSON.stringify(findings, null, 2),
    'Return verdicts (one per finding).',
  ].join('\n'), { label: `adjudicate:${doc.id}`, phase: 'Adjudicate', agentType: 'general-purpose', model: 'opus', effort: 'low', schema: ADJ_SCHEMA })
}

function fix(doc, confirmed) {
  return agent([
    'You are the fixer agent for the generate-strata-docs skill.',
    `Read your instructions at ${_args.refs_dir}/agents/fixer.md and follow them exactly.`,
    `Edit ${doc.path} to correct ONLY these confirmed findings, grounded in the source at ${doc.src_dir}:`,
    JSON.stringify(confirmed, null, 2),
    'Keep frontmatter valid. Return fixed, changes, and an optional note.',
  ].join('\n'), { label: `fix:${doc.id}`, phase: 'Fix', agentType: 'general-purpose', model: 'opus', effort: 'low', schema: FIX_SCHEMA })
}

const results = await parallel(docs.map((doc) => async () => {
  let round = 1
  while (round <= MAX_ROUNDS) {
    const v = await verify(doc, round)
    if (!v || !v.findings.length) return { id: doc.id, status: 'ok', rounds: round }
    const adj = await adjudicate(doc, v.findings)
    const confirmed = (adj?.verdicts || []).filter((x) => x.verdict === 'confirmed')
    if (!confirmed.length) return { id: doc.id, status: 'ok', rounds: round, note: 'all findings rejected' }
    await fix(doc, confirmed)
    round += 1
  }
  const finalV = await verify(doc, round)
  const residual = finalV?.findings?.length || 0
  return { id: doc.id, status: residual ? 'needs-review' : 'ok', rounds: round, residual }
}))

return { results: results.filter(Boolean) }
