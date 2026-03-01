#!/bin/bash
set -e

echo "======================================"
echo "GitHub Actions Runner Starting"
echo "======================================"
echo ""
echo "  RUNNER_REPO: $RUNNER_REPO"
echo "  RUNNER_NAME: $RUNNER_NAME"
echo "  GITHUB_PAT:  ${GITHUB_PAT:0:10}****"
echo ""

cd /home/runner

# Get a fresh registration token using the PAT (reg tokens expire in 1hr)
echo "Getting registration token from GitHub API..."
REG_TOKEN=$(curl -sf -X POST \
  -H "Authorization: token ${GITHUB_PAT}" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/${RUNNER_REPO}/actions/runners/registration-token" \
  | jq -r '.token')

if [ -z "$REG_TOKEN" ] || [ "$REG_TOKEN" = "null" ]; then
  echo "ERROR: Failed to get registration token. Check GITHUB_PAT is valid and has repo admin scope."
  exit 1
fi
echo "Got registration token."
echo ""

# Configure the runner (skip if already configured)
if [ ! -f ".credentials" ]; then
  echo "Configuring runner..."
  ./config.sh \
    --url "https://github.com/${RUNNER_REPO}" \
    --token "${REG_TOKEN}" \
    --name "${RUNNER_NAME:-laptop-runner}" \
    --runnergroup "Default" \
    --work "_work" \
    --replace \
    --unattended

  if [ ! -f ".credentials" ]; then
    echo "ERROR: config.sh completed but .credentials was not created."
    exit 1
  fi
  echo "Runner configured successfully."
else
  echo "Runner already configured, skipping registration."
fi

echo ""
echo "======================================"
echo "Listening for jobs..."
echo "======================================"

exec ./run.sh
