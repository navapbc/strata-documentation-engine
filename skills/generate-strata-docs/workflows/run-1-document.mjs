export const meta = {
  name: 'strata-docs-document',
  description: 'Document each manifest source: one agent per source writes markdown docs with frontmatter',
  phases: [{ title: 'Document', detail: 'one documenter agent per source' }],
}

// Some Workflow runtimes deliver the `args` parameter as a JSON string rather than a
// parsed object; normalize so `_args.*` resolves whether args arrives as object or string.
const _args = typeof args === 'string' ? JSON.parse(args) : (args || {})

const DOC_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    source_id: { type: 'string' },
    docs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          path: { type: 'string' },
          title: { type: 'string' },
          doc_type: { type: 'string', enum: ['guide', 'feature', 'example'] },
          related: { type: 'array', items: { type: 'string' } },
          feature_keys: { type: 'array', items: { type: 'string' } },
          demonstrates: { type: 'array', items: { type: 'string' } },
          distillation_note: { type: 'string' },
        },
        required: ['id', 'path', 'title', 'doc_type'],
      },
    },
    skipped: { type: 'boolean' },
    note: { type: 'string' },
  },
  required: ['source_id', 'docs', 'skipped'],
}

phase('Document')

const sources = _args.sources || []

// The run date stamped into every doc's `last_documented` (drives the update-mode staleness
// throttle in scripts/source_delta.py). The skill computes it once and passes it in via args —
// this is a Workflow script, so `new Date()` is unavailable here. Surface (never hide) its absence.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const runDate = DATE_RE.test(_args.run_date || '') ? _args.run_date : null
if (!runDate) {
  log(`WARNING: no valid run_date (YYYY-MM-DD) passed to Run 1 (got ${JSON.stringify(_args.run_date)}); docs will omit last_documented and the staleness throttle won't engage for them`)
}

// A real 40-char commit SHA in source_ref.ref is what update mode drift-compares against; a bare
// branch name (e.g. "main") forces a conservative full re-document every run. Surface (never hide)
// any source whose checkout SHA wasn't captured, and never pass the branch name off as the
// resolved SHA in the per-source instruction below.
const SHA_RE = /^[0-9a-f]{40}$/
for (const s of sources) {
  if (!SHA_RE.test(s.resolved_sha || '')) {
    log(`WARNING: source ${s.id} has no resolved 40-char SHA (got ${JSON.stringify(s.resolved_sha ?? s.ref)}); update-mode drift detection degraded until re-pinned`)
  }
}

const results = await parallel(
  sources.map((s) => () => {
    const sha = SHA_RE.test(s.resolved_sha || '') ? s.resolved_sha : null
    const refInstruction = sha
      ? [
          `The checkout's resolved commit SHA is: ${sha}.`,
          "In each doc's frontmatter set source_ref.ref to this resolved commit SHA (the full",
          '40-char hash, NOT the branch name) — the update mode uses it to detect when a source',
          'has drifted and needs re-documenting.',
        ]
      : [
          'WARNING: no resolved 40-char commit SHA was captured for this checkout (a setup error).',
          `Do NOT record the branch name "${s.ref}" in source_ref.ref — a bare branch ref breaks`,
          'update-mode drift detection. Resolve the actual HEAD SHA from the checkout and use it if',
          'you can; otherwise set verified: needs-review so this gap is surfaced rather than hidden.',
        ]
    const dateInstruction = runDate
      ? [
          `In each doc's frontmatter set last_documented to this run date: ${runDate} (ISO`,
          'YYYY-MM-DD). The update mode uses it to throttle re-documentation of frequently-changing',
          'sources — a drifted source is only re-documented once its docs are at least a week old.',
        ]
      : []
    return agent(
      [
        'You are a documentation agent for the generate-strata-docs skill.',
        `Read your instructions at ${_args.refs_dir}/agents/source-doc.md and follow them exactly.`,
        `Read the documentation profile at ${_args.refs_dir}/profiles/${s.type}.md.`,
        `Read the frontmatter contract at ${_args.refs_dir}/doc-frontmatter-schema.md.`,
        `Read the feature-key registry at ${_args.refs_dir}/feature-keys.md; tag docs with`,
        'feature_keys (sdk) / demonstrates (example) using ONLY keys from that registry.',
        `Read the platform-component registry at ${_args.refs_dir}/platform-components.md; tag docs with`,
        'component_keys / manages / integrates_with using ONLY ids from that registry.',
        `The source is checked out at: ${s.src_dir}`,
        s.subpaths && s.subpaths.length
          ? `Scope your reading to these subpaths: ${s.subpaths.join(', ')}.`
          : 'Document the whole source.',
        `Source: id=${s.id}, type=${s.type}, repo=${s.repo}, ref=${s.ref}.`,
        ...refInstruction,
        ...dateInstruction,
        `Write docs under docs/sources/${s.id}/ with valid frontmatter (source must equal "${s.id}").`,
        `Write a distillation log to .logs/${s.id}.distillation.md (your reasoning + per-doc notes).`,
        'If the checkout is empty or unreadable, set skipped=true with a note and write no files.',
        'Return source_id, the docs you wrote (with feature_keys/demonstrates/component_keys/manages/integrates_with/distillation_note), skipped, and an optional note.',
      ].join('\n'),
      { label: `document:${s.id}`, agentType: 'general-purpose', model: 'opus', effort: 'xhigh', schema: DOC_RESULT_SCHEMA },
    )
  }),
)

return { results: results.filter(Boolean) }
