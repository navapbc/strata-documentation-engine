---
id: rules-engine-catala-overview
title: Catala rules-engine template capability overview
source: strata-template-rules-engine-catala
doc_type: guide
tags: [rules-engine, catala, capability, fastapi, python, legislative]
related: [rules-engine-catala-using-the-template, rules-engine-catala-new-project-example]
component_keys: [strata-template-rules-engine-catala]
integrates_with: [template-infra]
summary: A deployable Strata capability — an application template that scaffolds a rules engine encoding legislative rules in Catala, compiling them to Python, and exposing them over a FastAPI REST API.
source_ref:
  repo: https://github.com/navapbc/strata-template-rules-engine-catala
  ref: 60d6db4a50d50efc31b93f9aa2572bab77bb8cec
  paths:
    - README.md
    - code.json
    - copier.yml
    - template/{{app_name}}/README.md.jinja
    - template/{{app_name}}/src/api.py
    - template/{{app_name}}/src/modules/__init__.py
    - template/{{app_name}}/catala/src/paidleave.catala_en
verified: ok
last_documented: 2026-06-29
---

# Catala rules-engine template capability overview

## What it is

The Catala rules-engine template is a **deployable Strata capability**: an application template
that scaffolds a *rules engine* — a service that encodes legislative and regulatory rules and
exposes them as evaluable API endpoints. Per the upstream `README.md`, it is "a template for
creating a rules engine using [Catala](https://catala-lang.org/), a domain-specific language
designed to faithfully translate legislative and regulatory texts into executable code."

It is distributed as a [copier](https://copier.readthedocs.io/)-based application template
(`navapbc/strata-template-rules-engine-catala`) that you install into a project with the
`nava-platform` CLI, then run and deploy as its own application. See
[Using / deploying the Catala rules-engine template](rules-engine-catala-using-the-template.md).

## The problem it solves

Government programs are governed by statute and regulation, and translating that legal text into
correct, auditable code is hard: the logic is full of exceptions and edge cases, and the
implementation tends to drift from the law it implements. Catala addresses this with *literate
programming* — rules are written directly alongside the legislative text they implement, so the
code stays traceable to its legal authority. This template packages that approach into a runnable
service: it ships the Catala compiler, a compilation pipeline from Catala to Python, and a REST
API that exposes the compiled rules, so a team can stand up a legally-grounded rules engine
without assembling that toolchain themselves. Per `README.md`, the template includes:

- Catala source files for encoding legislative rules with literate programming style
- a compilation pipeline from Catala to Python
- a REST API for exposing compiled rules as endpoints
- a Docker-based development environment with the Catala compiler pre-installed
- formatting and linting tools for the Python wrapper layer
- a CI/CD workflow for linting, typechecking, and testing

## How it works at a glance

The pipeline has three layers, grounded in the scaffolded project (`template/{{app_name}}/`):

1. **Catala rules** (`catala/src/*.catala_en`) — legislative text and the rules implementing it,
   built with `clerk` (the Catala build system) configured by `catala/clerk.toml`. The shipped
   example, `catala/src/paidleave.catala_en`, formalizes a paid-leave *leave-balance
   determination* citing FMLA (29 U.S.C. § 2612, 29 CFR Part 825).
2. **Generated Python** (`src/generated/`) — `make catala-build` compiles the Catala sources to
   Python here; this directory is excluded from linting and formatting (`pyproject.toml`).
3. **FastAPI wrapper** (`src/api.py` + `src/modules/`) — a thin FastAPI app that auto-discovers
   one router per module under `src/modules/` and includes it. `src/api.py` never needs editing
   when rules are added; `src/modules/paidleave.py` wraps the generated `leave_balance` function
   (compiled from the `LeaveBalance` Catala scope) and serves it at `POST /demo/leave-balance`.

## How it fits the Strata ecosystem

Per `README.md`, "the template application is intended to work with the infrastructure from
[template-infra](https://github.com/navapbc/template-infra)." Because the AWS infrastructure
template owns the deployment resources, this capability `integrates_with` `template-infra`.

It is a **Python/FastAPI** application and does **not** consume the Strata Ruby SDK; it composes
with the rest of a Strata system at the API and infrastructure level, not through shared SDK code.
`code.json` marks it `status: Production` with languages Python and Catala.

## When to reach for it

Reach for this template when a Strata application needs to:

- encode statutory or regulatory eligibility / benefit / determination logic in a form that
  stays traceable to the law it implements, and
- expose that logic as evaluable REST endpoints other services can call, and
- do so as a separately runnable, independently testable rules engine.

If you only need a generic application scaffold (no legislative rules), use the relevant
general-purpose application template instead.
