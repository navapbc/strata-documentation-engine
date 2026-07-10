---
paths:
  - "skills/**"
---

# Sub-agent model tiers

Which Claude model to give a sub-agent when a skill dispatches one via the `Agent`/Task tool.
Auto-loaded by Claude Code when you edit anything under `skills/`. Choose by the kind of work the
sub-agent does. This rule covers model choice only, not effort level.

- **Tier 1, Opus.** Sub-agents that reason at length, hold large context, ask probing questions,
  debate, or make thoughtful judgment calls. Examples: a product-versus-engineering debate,
  reviewing a draft against its sources, adjudicating whether a change is warranted.
- **Tier 2, Sonnet.** Sub-agents doing everyday, well-scoped work: synthesis, drafting from an
  already-decided set of inputs, routine transforms.
- **Tier 3, Haiku.** Sub-agents that only execute an already-decided plan, following instructions
  authored by a higher tier. No open-ended reasoning.

In practice: `review-draft` keeps its parallel reviewers on a cheap tier and its adjudication in a
more capable model; `refine-issue` runs its debate, review, and adjudication roles on Opus and its
planner on Sonnet. Neither skill sets effort.
