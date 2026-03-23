#!/usr/bin/env bash
# Deploy the A2B LIFT admin dashboard to Netlify production.
# Usage: bash deploy-admin.sh

set -e

SITE_ID="056552d0-c39d-4995-bfa9-60bb561d5934"
DEPLOY_DIR=".netlify-deploy"

echo "🔄 Syncing admin template..."
mkdir -p "$DEPLOY_DIR"
cp server/templates/admin.html "$DEPLOY_DIR/index.html"
cp a2b-admin.html "$DEPLOY_DIR/a2b-admin.html" 2>/dev/null || true

echo "🚀 Deploying to Netlify..."
npx netlify-cli deploy \
  --dir "$DEPLOY_DIR" \
  --site "$SITE_ID" \
  --auth "$NETLIFY_AUTH_TOKEN" \
  --prod \
  --message "Admin dashboard deploy $(date '+%Y-%m-%d %H:%M')"

echo "✅ Done! Live at: https://peaceful-mousse-459c85.netlify.app"
