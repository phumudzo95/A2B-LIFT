#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-preview}"
PLATFORM="${2:-android}"
ACCOUNT="${3:-current}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DEFAULT_PAMOL_PROJECT_ID="f282a582-7512-48d6-b563-13aa571d9115"

case "$ACCOUNT" in
  pascal)
    export EXPO_PUBLIC_EAS_OWNER="pascal225"
    if [[ -z "${EXPO_PUBLIC_EAS_PROJECT_ID_PASCAL:-}" ]]; then
      echo "ERROR: EXPO_PUBLIC_EAS_PROJECT_ID_PASCAL is required for pascal account builds."
      echo "Set it first, then re-run this command."
      exit 1
    fi
    export EXPO_PUBLIC_EAS_PROJECT_ID="$EXPO_PUBLIC_EAS_PROJECT_ID_PASCAL"
    ;;
  pamol)
    export EXPO_PUBLIC_EAS_OWNER="pamol-digital"
    export EXPO_PUBLIC_EAS_PROJECT_ID="${EXPO_PUBLIC_EAS_PROJECT_ID:-$DEFAULT_PAMOL_PROJECT_ID}"
    ;;
  current)
    # Use currently exported environment variables or app.config.js defaults.
    ;;
  *)
    echo "ERROR: Unknown account '$ACCOUNT'. Use one of: current, pamol, pascal"
    exit 1
    ;;
esac

echo "Starting EAS cloud build"
echo "Project directory: $PROJECT_DIR"
echo "Profile: $PROFILE"
echo "Platform: $PLATFORM"
echo "EAS owner: ${EXPO_PUBLIC_EAS_OWNER:-from app.config.js default}"
echo "EAS project id: ${EXPO_PUBLIC_EAS_PROJECT_ID:-from app.config.js default}"

eas build \
  --platform "$PLATFORM" \
  --profile "$PROFILE" \
  --non-interactive \
  --project-dir "$PROJECT_DIR"
