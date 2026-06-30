---
id: documentai-api-overview
title: DocumentAI API capability overview
source: documentai-api
doc_type: guide
tags: [documentai, sidecar, capability, document-processing, aws, bedrock]
related: [documentai-api-using-the-template]
component_keys: [documentai-api]
integrates_with: [template-infra]
summary: A deployable Strata capability — a document-processing sidecar that classifies and extracts data from uploaded documents using AWS Bedrock Data Automation.
source_ref:
  repo: https://github.com/navapbc/strata-template-documentai-api
  ref: a8170b5ad1dedf652b65e93949c410a941a1d5e4
  paths:
    - README.md
    - code.json
    - template/{{app_name}}/README.md.jinja
    - template/docs/{{app_name}}/diagrams/architecture.mmd
    - template/{{app_name}}/src/documentai_api/config/constants.py
verified: ok
last_documented: 2026-06-29
---

# DocumentAI API capability overview

## What it is

The DocumentAI API is a **deployable Strata capability**: a document-processing service
that identifies and extracts structured data from uploaded document files. Unlike most
Strata templates (which scaffold an app you then build out), this one ships as a nearly
complete application intended for use almost out of the box — the upstream README describes
it as "more of a complete application intended for use almost out of the box."

It is distributed as a [copier](https://copier.readthedocs.io/)-based application template
(`navapbc/strata-template-documentai-api`) that you install into a project with the
`nava-platform` CLI, then deploy alongside your application's infrastructure. See
[Using / deploying the DocumentAI template](documentai-api-using-the-template.md).

## The problem it solves

Government service applications routinely need to accept uploaded documents (W-2s, pay
stubs, legal records, training certificates) and pull data out of them. Doing this well
requires document classification, quality checks, data extraction, and reliable async
processing — work that is awkward to embed directly in a host application. The DocumentAI
API packages that work as a standalone service so a host app can simply upload a file and
poll for results.

The supported document **categories** are defined in
`src/documentai_api/config/constants.py` (`DocumentCategory`): `income`, `expenses`,
`legal_documents`, and `employment_training`. Supported upload formats (`FileValidation`)
are PDF, JPEG, PNG, and TIFF.

## How it fits the Strata ecosystem

The DocumentAI API is designed to run as a **sidecar service deployed beside a host
application** rather than as a standalone product. Per the upstream deployment guide
(`template-only-docs/deployment.md`), it is provisioned through the
[Strata AWS infrastructure template](https://github.com/navapbc/template-infra): you enable
the infra template's **Document Data Extraction** module (`enable_document_data_extraction = true`),
wire the service's S3-triggered processing jobs to that module's input/output buckets, and
provision a DynamoDB table for tracking. Because the infra template owns the AWS resources,
this capability `integrates_with` `template-infra`.

It is **not** itself a Strata-SDK Rails app and does not consume the Strata Ruby SDK; it is a
Python/FastAPI service. It composes with a host app at the infrastructure and API level, not
through shared SDK code.

## Architecture at a glance

The system is event-driven, grounded in `template/docs/{{app_name}}/diagrams/architecture.mmd`
and the application README:

- **API layer** — an Application Load Balancer in front of an ECS-hosted FastAPI app exposes
  the upload and status endpoints.
- **Processing** — document uploads land in an **S3 input bucket**; an S3 event triggers the
  `document_processor` job, which invokes **AWS Bedrock Data Automation (BDA)** for
  classification/extraction; BDA writes results to an **S3 output bucket**, which triggers the
  `bda_result_processor` job to parse the output and update a **DynamoDB** table that the API
  reads from when a caller polls for status.

## When to reach for it

Reach for the DocumentAI API when a Strata application needs to:

- accept user-uploaded documents and confirm/classify their type, and
- extract structured fields from them asynchronously, and
- do so as a separately deployable, independently scalable service rather than inline code in
  the host app.

If you only need a generic app scaffold (not document processing), use the relevant
application template instead.
