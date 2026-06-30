---
id: rules-engine-catala-new-project-example
title: "Example: scaffolding a new Catala rules-engine project"
source: strata-template-rules-engine-catala
doc_type: example
tags: [catala, example, copier, nava-platform, scaffold, paidleave, fastapi]
related: [rules-engine-catala-using-the-template, rules-engine-catala-overview]
summary: A concrete walk-through of installing the Catala rules-engine template, the prompts answered, the resulting project tree, and the shipped paidleave leave-balance rule and its endpoint.
source_ref:
  repo: https://github.com/navapbc/strata-template-rules-engine-catala
  ref: 60d6db4a50d50efc31b93f9aa2572bab77bb8cec
  paths:
    - README.md
    - copier.yml
    - template/{{app_name}}/README.md.jinja
    - template/{{app_name}}/Makefile.jinja
    - template/{{app_name}}/catala/src/paidleave.catala_en
    - template/{{app_name}}/catala/tests/paidleave_test.catala_en
    - template/{{app_name}}/src/modules/paidleave.py
    - template/{{app_name}}/tests/test_api.py
verified: ok
last_documented: 2026-06-29
---

# Example: scaffolding a new Catala rules-engine project

This walks through installing the Catala rules-engine template into a project and what you get
back. Commands are grounded in the upstream `README.md` and `copier.yml`; the variable values
below are an illustrative choice for an app named `benefits-rules`.

## Install and answer the prompts

From the project root (`README.md` "Installation"):

```sh
nava-platform app install --template-uri https://github.com/navapbc/strata-template-rules-engine-catala . benefits-rules
```

`copier.yml` prompts for two variables; the answers used here:

| Variable         | Prompt                                      | Answer for this example |
| ---------------- | ------------------------------------------- | ----------------------- |
| `app_name`       | The name of the app                         | `benefits-rules`        |
| `app_local_port` | "The port to be used in local development of '{{ app_name }}'" (default `3001`) | `3001`                |

(`app_name` must match `^[a-z0-9\-_]+$`.)

## Resulting project structure

With `app_name = benefits-rules`, the rendered tree (`{{app_name}}` → `benefits-rules`) is
derived from the `template/{{app_name}}/` file listing (annotations from the README's directory
structure block in `template/{{app_name}}/README.md.jinja`):

```text
benefits-rules/
├── catala/
│   ├── clerk.toml                 Catala build configuration
│   ├── src/paidleave.catala_en    Catala rules (the shipped example)
│   └── tests/paidleave_test.catala_en   Catala test scenarios
├── src/
│   ├── api.py                     thin FastAPI app (auto-discovers modules)
│   ├── main.py                    uvicorn entrypoint (started via `make start` / `docker compose`, or by running src/main.py directly)
│   ├── modules/paidleave.py       FastAPI router wrapping the paidleave scope
│   └── generated/                 ships pre-populated with the Catala runtime and compiled Paidleave.py; `make catala-build` regenerates it
├── tests/test_api.py              Python API tests
├── Dockerfile
├── docker-compose.yml
├── Makefile
├── pyproject.toml
└── local.env
```

(The README's "Adding new rules" section links to `../docs/{{app_name}}/getting-started.md`,
`writing-rules-in-catala.md`, and `adding-modules.md`; those docs come from the base platform
template and are not part of this repo's `template/{{app_name}}/` tree.)

## The shipped paidleave rule

The example rule, `catala/src/paidleave.catala_en`, formalizes a paid-leave **leave-balance
determination** (citing FMLA — 29 U.S.C. § 2612 and 29 CFR Part 825). Its `LeaveBalance` scope
takes the requested leave type and periods plus historical leave already taken, and produces:

- `max_entitlement` — weeks allowed for the leave type: Medical 20, Bonding 12, Care for Family
  12, Care for Family Service Member 26.
- `leave_balance` — `max_entitlement - leave_taken_in_benefit_year`.
- `total_requested` — the sum of all requested leave-period lengths.
- `has_sufficient_leave_balance` — true only if `total_requested <= leave_balance` **and**
  `total_leave_taken_all_types + total_requested <= 26` (the overall 26-week cap).

`make catala-build` compiles this into `src/generated/Paidleave.py`.

## The generated endpoint

`src/modules/paidleave.py` wraps the compiled `leave_balance` scope in a FastAPI router mounted at
prefix `/demo`, exposing `POST /demo/leave-balance`. It maps the JSON `leave_type` string
(`medical_leave`, `bonding_leave`, `care_for_family`, `care_for_family_service_member`) to the
Catala `LeaveType_Code`, calls the rule, and returns the four outputs (unknown leave types yield
HTTP 400). A sample call:

```bash
curl -X POST http://localhost:3001/demo/leave-balance \
  -H "Content-Type: application/json" \
  -d '{
    "leave_type": "medical_leave",
    "leave_periods": [{"length_in_weeks": 4}],
    "leave_taken_in_benefit_year": 0,
    "total_leave_taken_all_types": 0
  }'
# => {"max_entitlement": 20, "leave_balance": 20, "total_requested": 4, "has_sufficient_leave_balance": true}
```

This expected response is grounded in `tests/test_api.py`
(`test_sufficient_balance_medical_leave`), which asserts exactly those values. The same test file
also covers the overall-cap rejection (`care_for_family_service_member` with 22 weeks already
taken → `has_sufficient_leave_balance: false`), an invalid leave type (HTTP 400), and disabling
the module via `DISABLED_MODULES=paidleave` (the route then 404s).

## Verifying it works

After scaffolding, the standard check from inside `benefits-rules/` is:

```bash
make catala-build   # compile Catala -> src/generated/
make test-all       # run Catala test assertions + Python API tests
```
