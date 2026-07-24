# strata-qa/Dockerfile
#
# Build context is the REPO ROOT, not strata-qa/:
#   docker build -f strata-qa/Dockerfile --platform linux/arm64 -t strata-qa-lambda:probe .
#
# arm64 is confirmed viable: @cursor/sdk-linux-arm64@1.0.24 publishes, so Graviton
# (cheaper) is available. Keep the arch consistent through Task 8.
FROM public.ecr.aws/lambda/nodejs:22

# Provenance only. docsVersion is computed separately (see note below).
ARG GIT_SHA=unknown
ENV STRATA_QA_GIT_SHA=${GIT_SHA}

WORKDIR ${LAMBDA_TASK_ROOT}

# Dependency layer first so doc-only edits don't reinstall node_modules.
COPY strata-qa/package.json strata-qa/package-lock.json ./strata-qa/
RUN cd strata-qa && npm ci

# Sources + the baked doc corpus (~900 KB).
COPY strata-qa ./strata-qa
COPY docs ./docs
RUN cd strata-qa && npm run build && npm prune --omit=dev

# The agent runtime needs a writable HOME; only /tmp is writable in Lambda.
ENV HOME=/tmp
ENV DOCS_ROOT=${LAMBDA_TASK_ROOT}
ENV QA_LOG_DIR=/tmp/qa

# Probe CMD (Task 7 confirms it). The probe in Step 4 overrides the entrypoint,
# so the not-yet-existing handler does not matter at this stage.
CMD ["strata-qa/dist/lambda/handler.handler"]
