#!/usr/bin/env bash
# Deploy strata-qa as a container-image Lambda with an IAM-authed Function URL.
# Prereqs: aws CLI v2 and docker. Run from the REPO ROOT — the image build context
# is the repo root, because the image needs both docs/ and strata-qa/.
#
# CURSOR_API_KEY is needed only to CREATE the secret (first deploy) or to rotate it
# with ROTATE_SECRET=1. A routine code redeploy does not need the key and will not
# touch the stored one.
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
FUNCTION_NAME="${FUNCTION_NAME:-strata-qa}"
ECR_REPO="${ECR_REPO:-strata-qa-lambda}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ARCH="${ARCH:-arm64}"                       # arm64 | x86_64
DOCKER_PLATFORM="linux/${ARCH/x86_64/amd64}"
MEMORY_MB="${MEMORY_MB:-2048}"
TIMEOUT_S="${TIMEOUT_S:-120}"
AGENT_TIMEOUT_MS="${AGENT_TIMEOUT_MS:-90000}"
# At ~190k tokens per question (NOTES.md), an endpoint with unreserved
# concurrency is an unbounded spend on the Cursor API -- and a 504 at 90s is
# exactly the response a client library retries. Cap it.
RESERVED_CONCURRENCY="${RESERVED_CONCURRENCY:-3}"
SECRET_NAME="${SECRET_NAME:-strata-qa/cursor-api-key}"
ROLE_NAME="${ROLE_NAME:-strata-qa-lambda-role}"
# Overwriting the stored key is opt-in. Unconditional writes meant a code-only
# redeploy from a shell holding a stale CURSOR_API_KEY silently replaced a working
# secret with a broken one and took the live function down — and stale keys in
# non-interactive shells are a known hazard here.
ROTATE_SECRET="${ROTATE_SECRET:-0}"

# The per-agent-call bound must fire before Lambda's hard kill. This is necessary
# but NOT sufficient on its own: runQa can make two bounded calls (ask, then the
# repair) and the handler can retry on auth, so per-call bounds do not sum to an
# invocation bound. The invocation itself is bounded in handler.ts from the Lambda
# context's remaining time, which is what actually guarantees a clean 504.
if (( AGENT_TIMEOUT_MS >= TIMEOUT_S * 1000 )); then
  echo "AGENT_TIMEOUT_MS (${AGENT_TIMEOUT_MS}) must be less than TIMEOUT_S (${TIMEOUT_S}s)" >&2
  exit 1
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
IMAGE_URI="${ECR_URI}:${IMAGE_TAG}"
GIT_SHA="$(git rev-parse HEAD)"

echo "==> ECR repo"
aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$ECR_REPO" --region "$AWS_REGION" >/dev/null

echo "==> Secret"
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  if [[ "$ROTATE_SECRET" == "1" ]]; then
    : "${CURSOR_API_KEY:?ROTATE_SECRET=1 needs CURSOR_API_KEY exported (personal or service-account key)}"
    aws secretsmanager put-secret-value --secret-id "$SECRET_NAME" \
      --secret-string "$CURSOR_API_KEY" --region "$AWS_REGION" >/dev/null
    echo "    rotated ${SECRET_NAME}"
  else
    echo "    keeping stored ${SECRET_NAME} (ROTATE_SECRET=1 to overwrite)"
  fi
else
  : "${CURSOR_API_KEY:?export CURSOR_API_KEY (personal or service-account key) to create ${SECRET_NAME}}"
  aws secretsmanager create-secret --name "$SECRET_NAME" \
    --secret-string "$CURSOR_API_KEY" --region "$AWS_REGION" >/dev/null
  echo "    created ${SECRET_NAME}"
fi
SECRET_ARN="$(aws secretsmanager describe-secret --secret-id "$SECRET_NAME" \
  --region "$AWS_REGION" --query ARN --output text)"

echo "==> IAM execution role"
if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null
fi
# Read just this one secret, nothing else.
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name read-cursor-secret \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"secretsmanager:GetSecretValue\",\"Resource\":\"${SECRET_ARN}\"}]
  }" >/dev/null
ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text)"

echo "==> Build & push image (${DOCKER_PLATFORM}, context = repo root)"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
docker build -f strata-qa/Dockerfile --platform "$DOCKER_PLATFORM" \
  --build-arg GIT_SHA="$GIT_SHA" -t "$IMAGE_URI" .
docker push "$IMAGE_URI"

# Only what the deploy knows. HOME, DOCS_ROOT, and QA_LOG_DIR are image ENVs
# (see Dockerfile) — restating them here would hardcode /var/task and let the
# image and the function config drift apart.
ENV_VARS="Variables={AGENT_TIMEOUT_MS=${AGENT_TIMEOUT_MS},CURSOR_API_KEY_SECRET_ID=${SECRET_ARN}}"

echo "==> Lambda function"
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FUNCTION_NAME" \
    --image-uri "$IMAGE_URI" --region "$AWS_REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$AWS_REGION"
  aws lambda update-function-configuration --function-name "$FUNCTION_NAME" \
    --timeout "$TIMEOUT_S" --memory-size "$MEMORY_MB" \
    --environment "$ENV_VARS" --region "$AWS_REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$AWS_REGION"
else
  # IAM role propagation can lag; retry create briefly. `&& break` hides the
  # failure from `set -e`, so track success explicitly — otherwise five failed
  # attempts fall through to `wait function-active-v2` and report a confusing
  # ResourceNotFound instead of the real error.
  created=0
  for i in 1 2 3 4 5; do
    if aws lambda create-function --function-name "$FUNCTION_NAME" \
      --package-type Image --code "ImageUri=${IMAGE_URI}" \
      --role "$ROLE_ARN" --architectures "$ARCH" \
      --timeout "$TIMEOUT_S" --memory-size "$MEMORY_MB" \
      --environment "$ENV_VARS" --region "$AWS_REGION" >/dev/null; then
      created=1
      break
    fi
    echo "   create failed (role may still be propagating); retry $i..." && sleep 10
  done
  if (( created == 0 )); then
    echo "create-function failed after 5 attempts; rerun the last command without >/dev/null to see why" >&2
    exit 1
  fi
fi
aws lambda wait function-active-v2 --function-name "$FUNCTION_NAME" --region "$AWS_REGION"

echo "==> Reserved concurrency (${RESERVED_CONCURRENCY}) — cost ceiling"
aws lambda put-function-concurrency --function-name "$FUNCTION_NAME" \
  --reserved-concurrent-executions "$RESERVED_CONCURRENCY" --region "$AWS_REGION" >/dev/null

echo "==> Function URL (AWS_IAM auth)"
aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$AWS_REGION" >/dev/null 2>&1 \
  || aws lambda create-function-url-config --function-name "$FUNCTION_NAME" \
       --auth-type AWS_IAM --region "$AWS_REGION" >/dev/null
FUNCTION_URL="$(aws lambda get-function-url-config --function-name "$FUNCTION_NAME" \
  --region "$AWS_REGION" --query FunctionUrl --output text)"

echo "==> Deployed ${GIT_SHA:0:12}. Function URL: ${FUNCTION_URL}"
echo "    Invoke with SigV4, e.g.:"
echo "    awscurl --service lambda --region ${AWS_REGION} -X POST \\"
echo "      -d '{\"question\":\"What does the nava-platform CLI wrap to install templates?\"}' \\"
echo "      ${FUNCTION_URL}"
