---
id: documentai-api-overview
title: DocumentAI API capability overview
source: documentai-api
doc_type: guide
tags: [documentai, capability, separately-deployable, document-processing, aws, bedrock]
related: [documentai-api-using-the-template]
component_keys: [documentai-api]
integrates_with: [template-infra]
summary: A deployable Strata capability — a separately deployable, independently scalable document-processing service that classifies uploaded documents and extracts their data using AWS Bedrock Data Automation.
source_ref:
  repo: https://github.com/navapbc/strata-template-documentai-api
  ref: 753ad50eba97fa5a3489370b7b5d3831c4e0105f
  paths:
    - README.md
    - code.json
    - template-only-docs/deployment.md
    - template/{{app_name}}/README.md.jinja
    - template/docs/{{app_name}}/diagrams/architecture.mmd
    - template/{{app_name}}/src/documentai_api/config/constants.py
    - template/{{app_name}}/src/documentai_api/app.py
    - template/{{app_name}}/src/documentai_api/utils/ddb.py
    - template/{{app_name}}/src/documentai_api/utils/schemas.py
    - template/{{app_name}}/src/documentai_api/utils/bda_invoker.py
    - template/{{app_name}}/src/documentai_api/utils/document_detector.py
    - template/{{app_name}}/src/documentai_api/jobs/document_processor/main.py
last_documented: 2026-09-04
verified: ok
---

# DocumentAI API capability overview

## What it is

The DocumentAI API is a **deployable Strata capability**: a document-processing service that
identifies and extracts structured data from uploaded document files. Unlike some other Strata
templates (which scaffold an app you then build out), this one ships as a nearly complete
application — the repository README describes it as "more of a complete application intended for
use almost out of the box." Its `code.json` metadata records it as `"status": "Production"`,
Python, internally maintained by Nava (`strata@navapbc.com`), and Apache 2.0 licensed.

It is distributed as a [copier](https://copier.readthedocs.io/)-based application template
(`navapbc/strata-template-documentai-api`) that you install into a project with the
`nava-platform` CLI, then deploy alongside your application's infrastructure. See
[Using and deploying the DocumentAI template](documentai-api-using-the-template.md) for the
install and deploy path.

## The problem it solves

Government service applications routinely need to accept uploaded documents — W-2s, pay stubs,
legal records, training certificates — and pull data out of them. Doing that well means document
classification, quality checks, field extraction, and reliable asynchronous processing: work that
is awkward to embed directly in a host application. The DocumentAI API packages it as a standalone
service, so a host app uploads a file and polls for results.

The document **categories** a caller may declare on upload are the `DocumentCategory` values in
`src/documentai_api/config/constants.py`: `income`, `expenses`, `legal_documents`, and
`employment_training`. Accepted upload formats (`FileValidation.SUPPORTED_CONTENT_TYPES`) are PDF,
JPEG, PNG, and TIFF — and the content type is sniffed from the file's bytes with `libmagic` rather
than trusted from the request, so a mislabelled upload is rejected with a 400.

The *extraction schemas* are a separate thing from those categories: `GET /v1/schemas` reports the
document types of the custom blueprints configured on your Bedrock Data Automation project, and
`GET /v1/schemas/{document_type}` returns that type's fields
(`src/documentai_api/utils/schemas.py`), so what the service can extract is configuration, not
code.

## How it fits the Strata ecosystem

The DocumentAI API is designed to run as a **separately deployable, independently scalable
document-processing service** provisioned beside a host application. Per the template's deployment
guide (`template-only-docs/deployment.md`), it is provisioned through the
[Strata AWS infrastructure template](https://github.com/navapbc/template-infra): you enable that
template's **Document Data Extraction** module (`enable_document_data_extraction = true`), wire
this service's two S3-triggered jobs to the module's input and output buckets, and add a DynamoDB
table for tracking. Because the infra template owns the AWS resources, this capability
`integrates_with` `template-infra`.

It is **not** a Strata-SDK Rails app and does not consume the Strata Ruby SDK — it is a
Python/FastAPI service. It composes with a host app at the infrastructure and HTTP-API level, not
through shared SDK code.

## Architecture at a glance

The system is event-driven. Grounded in `template/docs/{{app_name}}/diagrams/architecture.mmd`
and the application README:

- **API layer** — an Application Load Balancer fronts an ECS-hosted FastAPI app that exposes the
  upload and status endpoints and reads and writes DynamoDB.
- **Processing** — uploads land in an **S3 input bucket**; an S3 event triggers the
  `document_processor` job, which invokes **AWS Bedrock Data Automation (BDA)** for
  classification and extraction. BDA writes results to an **S3 output bucket**, whose events
  trigger the `bda_result_processor` job to parse the output and update the **DynamoDB** table
  the API reads when a caller polls for status.

Two details worth knowing before you read the code: the diagram and README call the second job
"BDA Output Processor", but the actual entry point, job directory, and deploy-time task command
are all named `bda_result_processor`. And `document_processor` does real preprocessing before it
calls BDA — quality and blur analysis, grayscale conversion for every image upload (with oversized
images, still above 5 MB after conversion, additionally rendered to PDF), and trimming
PDFs longer than five pages (`MULTIPAGE_DETECTION_MAX_PAGES` in
`src/documentai_api/utils/document_detector.py`) rather than rejecting them.

Every state is recorded on the DynamoDB record as a `ProcessStatus` (`constants.py`), and a
caller has to handle more than `success`: `failed`, `no_document_detected`,
`no_custom_blueprint_matched`, `blurry_document_detected`, `password_protected`, and
`not_implemented` are all real answers. Note that `ProcessStatus.is_completed` counts only
`success`, `failed`, `no_document_detected`, and `no_custom_blueprint_matched` as terminal, while a
blurry or password-protected document gets its final API response written to the record straight
away. So `GET /v1/documents/{job_id}` returns that answer immediately, but a synchronous
`wait=true` upload of the same document polls to its timeout and is then rewritten as `failed`.
Polling the status endpoint is the more predictable integration. That pre-BDA triage happens in
`insert_initial_ddb_record` (`src/documentai_api/utils/ddb.py`), which profiles the file and picks
the initial status before BDA is ever invoked. Two switches there are hard-coded rather than configurable: multi-page
*rejection* is off (`is_multipage_detection_enabled = False`, with a TODO to read it from SSM), so
the `multipage` status is currently unreachable and long PDFs are trimmed instead; and sampling is
set to 100% (`bda_percentage = 1.0`, also TODO'd for SSM), so the `not_sampled` status is likewise
unreachable today.

## When to reach for it

Reach for the DocumentAI API when a Strata application needs to:

- accept user-uploaded documents and confirm or classify their type, and
- extract structured fields from them asynchronously, and
- do so as a separately deployable, independently scalable service rather than as inline code in
  the host app.

If you only need a generic application scaffold and not document processing, use the relevant
application template instead. If your extraction targets are not covered by a BDA blueprint you
can configure, the service will return `no_custom_blueprint_matched` rather than fabricate
fields — plan blueprint work as part of adopting it.
