export const meta = {
  name: 'review-draft',
  description: 'Review one durable draft: an Opus reviewer finds issues across five dimensions, a Sonnet adjudicator confirms or rejects each, and a Sonnet reviser applies the confirmed ones',
  phases: [{ title: 'Review' }, { title: 'Adjudicate' }, { title: 'Revise' }],
}

// Some Workflow runtimes deliver the `args` parameter as a JSON string rather than a
// parsed object; normalize so `_args.*` resolves whether args arrives as object or string.
const _args = typeof args === 'string' ? JSON.parse(args) : (args || {})

const SEVERITY = ['BLOCKER', 'MAJOR', 'MINOR', 'NIT']
const DIMENSION = ['quality', 'template', 'voice', 'punctuation', 'house-style']

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          dimension: { type: 'string', enum: DIMENSION },
          location: { type: 'string' }, issue: { type: 'string' },
          suggested_fix: { type: 'string' },
          severity: { type: 'string', enum: SEVERITY },
        },
        required: ['dimension', 'location', 'issue', 'suggested_fix', 'severity'],
      },
    },
    em_dashes: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string' },
  },
  required: ['findings', 'verdict'],
}

const ADJ_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          location: { type: 'string' }, issue: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'rejected'] },
          why: { type: 'string' },
          severity: { type: 'string', enum: SEVERITY },
          suggested_fix: { type: 'string' },
        },
        required: ['location', 'issue', 'verdict', 'why', 'severity'],
      },
    },
  },
  required: ['verdicts'],
}

const REVISE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    revised_draft: { type: 'string' },
    changes: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
  required: ['revised_draft', 'changes'],
}

const draft = _args.draft || ''
const artifactType = _args.artifact_type || 'issue'
const templatePath = _args.template_path || ''

// Reviewer and adjudicator both judge template adherence; tell them where the template is.
const templateLine = templatePath
  ? `Check template adherence against the template at ${templatePath} — read it first.`
  : 'No template file was provided; check template adherence against the conventions in your instructions.'

function review() {
  return agent([
    'You are the review agent for the review-draft skill.',
    `Read your instructions at ${_args.refs_dir}/agents/reviewer.md and follow them exactly.`,
    `Artifact type: ${artifactType}.`,
    templateLine,
    'Review the draft below across all five dimensions. Run a literal em-dash check and report every hit.',
    'Draft:',
    '```',
    draft,
    '```',
    'Return the findings array (empty if the draft is clean), the em_dashes hits, and a one-paragraph verdict.',
  ].join('\n'), { label: 'review', phase: 'Review', agentType: 'general-purpose', model: 'opus', effort: 'high', schema: FINDINGS_SCHEMA })
}

function adjudicate(findings) {
  return agent([
    'You are the adjudication agent for the review-draft skill.',
    `Read your instructions at ${_args.refs_dir}/agents/adjudicator.md and follow them exactly.`,
    `Artifact type: ${artifactType}.`,
    templateLine,
    'Confirm or reject each finding by re-reading the draft (and template). Do not accept findings blindly. Draft:',
    '```',
    draft,
    '```',
    'Findings (JSON):',
    JSON.stringify(findings, null, 2),
    'Return verdicts (one per finding, in the same order).',
  ].join('\n'), { label: 'adjudicate', phase: 'Adjudicate', agentType: 'general-purpose', model: 'sonnet', effort: 'medium', schema: ADJ_SCHEMA })
}

function revise(confirmed) {
  return agent([
    'You are the reviser agent for the review-draft skill.',
    `Read your instructions at ${_args.refs_dir}/agents/reviser.md and follow them exactly.`,
    `Artifact type: ${artifactType}.`,
    'Apply ONLY these confirmed findings to the draft; change nothing else. Never introduce an em dash. Confirmed findings (JSON):',
    JSON.stringify(confirmed, null, 2),
    'Draft:',
    '```',
    draft,
    '```',
    'Return the full revised_draft (whole text, not a diff), a changes list, and an optional note.',
  ].join('\n'), { label: 'revise', phase: 'Revise', agentType: 'general-purpose', model: 'sonnet', effort: 'medium', schema: REVISE_SCHEMA })
}

phase('Review')
const r = await review()
const findings = r?.findings || []
if (!findings.length) {
  return { status: 'clean', revised_draft: draft, applied: [], rejected: [], verdict: r?.verdict || '', em_dashes: r?.em_dashes || [] }
}

phase('Adjudicate')
const verdicts = (await adjudicate(findings))?.verdicts || []
const confirmed = verdicts.filter((v) => v.verdict === 'confirmed')
const rejected = verdicts.filter((v) => v.verdict === 'rejected')
if (!confirmed.length) {
  return { status: 'no-changes', revised_draft: draft, applied: [], rejected, verdict: r?.verdict || '', em_dashes: r?.em_dashes || [] }
}

phase('Revise')
const rev = await revise(confirmed)
return { status: 'revised', revised_draft: rev?.revised_draft || draft, changes: rev?.changes || [], applied: confirmed, rejected, verdict: r?.verdict || '', em_dashes: r?.em_dashes || [], note: rev?.note }
