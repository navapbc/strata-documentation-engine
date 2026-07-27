# strata-qa/Dockerfile
#
# Build context is the REPO ROOT, not strata-qa/:
#   docker build -f strata-qa/Dockerfile --platform linux/arm64 -t strata-qa-lambda .
#
# arm64 is confirmed viable: @cursor/sdk-linux-arm64@1.0.24 publishes, so Graviton
# (cheaper) is available. Keep the arch consistent between this file and deploy.sh.
#
# Two stages, because `npm prune` in a later layer cannot shrink an earlier one:
# a single-stage build ships the devDependency tree (typescript, tsx, vitest and
# their esbuild/rollup binaries) plus the npm cache forever, whatever the final
# layer deletes. The builder keeps those; the runtime image never sees them.
FROM public.ecr.aws/lambda/nodejs:22 AS builder

WORKDIR /build
# Dependency layer first so source-only edits don't reinstall node_modules.
COPY strata-qa/package.json strata-qa/package-lock.json ./
RUN npm ci
COPY strata-qa/tsconfig.json ./
COPY strata-qa/src ./src
RUN npm run build

FROM public.ecr.aws/lambda/nodejs:22

# Provenance only. docsVersion is computed separately (see graph.ts).
ARG GIT_SHA=unknown
ENV STRATA_QA_GIT_SHA=${GIT_SHA}

WORKDIR ${LAMBDA_TASK_ROOT}

# Production dependencies only, and no npm cache left behind.
COPY strata-qa/package.json strata-qa/package-lock.json ./strata-qa/
RUN cd strata-qa && npm ci --omit=dev && npm cache clean --force

COPY --from=builder /build/dist ./strata-qa/dist

# The runtime environment. deploy.sh deliberately does NOT restate these — the
# image is their single source of truth, so a local `docker run` and the deployed
# function agree. Only per-deploy values (the secret id, the agent timeout) come
# from the function's environment.
#
# The agent runtime needs a writable HOME, and Lambda's filesystem is read-only
# except /tmp — so both HOME and the JSONL log dir must live there.
ENV HOME=/tmp
# Deliberately NOT ${LAMBDA_TASK_ROOT}: DOCS_ROOT becomes the retrieval agent's
# cwd (handler.ts -> runQa -> local.cwd), and the task root also holds the ~45MB
# production node_modules this image installs. At ~190k tokens per question
# (NOTES.md), search space the agent can wander into is the main cost driver, so
# the corpus gets a directory of its own containing nothing else. .dockerignore
# trims the corpus itself for the same reason.
ENV DOCS_ROOT=/opt/qa-root
ENV QA_LOG_DIR=/tmp/qa

# Last, and deliberately: the baked doc corpus is what changes most often in a
# documentation engine, and nothing below it needs rebuilding when it does. A
# doc-only redeploy re-pushes this layer alone.
COPY docs /opt/qa-root/docs

# The handler the Runtime Interface Client resolves, relative to LAMBDA_TASK_ROOT.
# A local RIE probe can override it to inspect the image instead.
CMD ["strata-qa/dist/lambda/handler.handler"]
