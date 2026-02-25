#!/usr/bin/env bash
#
# setup-gcp-project.sh — Create a Google Cloud Platform project for AgentCloak
#
# Interactive wizard that creates the GCP project, enables the Gmail API,
# configures the OAuth consent screen, creates OAuth 2.0 credentials, and
# generates a .env file with auto-generated secrets.
# Prompts for each value with sensible defaults — press Enter to accept.
#
# Prerequisites:
#   - gcloud CLI installed (https://cloud.google.com/sdk/docs/install)
#   - Logged in: gcloud auth login
#   - A billing account linked (required for enabling APIs)
#
# Usage:
#   ./scripts/setup-gcp-project.sh
#
set -euo pipefail

# ─── Helpers ────────────────────────────────────────────────────────────────

# Prompt with a default value. Empty input accepts the default.
prompt() {
  local label="$1" default="$2" result
  read -rp "  $label [$default]: " result
  echo "${result:-$default}"
}

# ─── Preflight checks ──────────────────────────────────────────────────────

if ! command -v gcloud &>/dev/null; then
  echo "Error: gcloud CLI is not installed."
  echo "Install it from https://cloud.google.com/sdk/docs/install"
  exit 1
fi

ACCOUNT=$(gcloud config get-value account 2>/dev/null || true)
if [[ -z "$ACCOUNT" ]]; then
  echo "Error: Not logged in. Run: gcloud auth login"
  exit 1
fi

# ─── Interactive prompts ────────────────────────────────────────────────────

DEFAULT_PROJECT_ID="agentcloak-$(head -c 4 /dev/urandom | xxd -p)"

echo ""
echo "============================================"
echo "  AgentCloak — GCP Project Setup"
echo "============================================"
echo ""
echo "  GCP Account: $ACCOUNT"
echo ""
echo "Press Enter to accept the default shown in [brackets]."
echo ""

PROJECT_NAME=$(prompt "Project name" "AgentCloak")
PROJECT_ID=$(prompt "Project ID" "$DEFAULT_PROJECT_ID")
REDIRECT_URI=$(prompt "OAuth redirect URI" "http://localhost:3000/auth/callback")
SUPPORT_EMAIL=$(prompt "Consent screen support email" "$ACCOUNT")

echo ""
echo "  ── Summary ──────────────────────────────"
echo "  Project name:  $PROJECT_NAME"
echo "  Project ID:    $PROJECT_ID"
echo "  Redirect URI:  $REDIRECT_URI"
echo "  Support email: $SUPPORT_EMAIL"
echo "  ─────────────────────────────────────────"
echo ""
read -rp "  Continue? [Y/n] " confirm
if [[ "${confirm,,}" == "n" ]]; then
  echo "Aborted."
  exit 0
fi

# ─── 1. Create the project ─────────────────────────────────────────────────

echo ""
echo ">>> Step 1/6: Creating project '$PROJECT_ID' ..."

if gcloud projects describe "$PROJECT_ID" &>/dev/null; then
  echo "    Project already exists — reusing it."
else
  gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME"
  echo "    Created."
fi

gcloud config set project "$PROJECT_ID"

# ─── 2. Link billing (required for enabling APIs) ──────────────────────────

echo ""
echo ">>> Step 2/6: Checking billing ..."

BILLING_ACCOUNT=$(gcloud billing accounts list \
  --filter="open=true" \
  --format="value(ACCOUNT_ID)" \
  --limit=1 2>/dev/null || true)

if [[ -z "$BILLING_ACCOUNT" ]]; then
  echo "    Warning: No billing account found."
  echo "    You may need to link one manually at:"
  echo "    https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
else
  CURRENT_BILLING=$(gcloud billing projects describe "$PROJECT_ID" \
    --format="value(billingAccountName)" 2>/dev/null || true)

  if [[ -z "$CURRENT_BILLING" || "$CURRENT_BILLING" == "billingAccounts/" ]]; then
    gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
    echo "    Linked billing account: $BILLING_ACCOUNT"
  else
    echo "    Billing already linked."
  fi
fi

# ─── 3. Enable required APIs ───────────────────────────────────────────────

echo ""
echo ">>> Step 3/6: Enabling APIs ..."

gcloud services enable gmail.googleapis.com
echo "    Gmail API — enabled."

gcloud services enable people.googleapis.com
echo "    People API — enabled."

# ─── 4. Configure the OAuth consent screen ──────────────────────────────────

echo ""
echo ">>> Step 4/6: Configuring OAuth consent screen ..."

ACCESS_TOKEN=$(gcloud auth print-access-token)
BRAND_NAME=""
CONSENT_URL="https://console.cloud.google.com/apis/credentials/consent?project=$PROJECT_ID"

# Check if OAuth brand already exists
EXISTING_BRANDS=$(curl -sf \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://oauth2.googleapis.com/v1/projects/$PROJECT_ID/brands" 2>/dev/null || echo "{}")

BRAND_NAME=$(echo "$EXISTING_BRANDS" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

if [[ -n "$BRAND_NAME" ]]; then
  echo "    Consent screen already configured."
else
  # Try to create the brand via API first
  BRAND_RESPONSE=$(curl -s \
    -X POST \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"applicationTitle\": \"$PROJECT_NAME\",
      \"supportEmail\": \"$SUPPORT_EMAIL\"
    }" \
    "https://oauth2.googleapis.com/v1/projects/$PROJECT_ID/brands")

  BRAND_NAME=$(echo "$BRAND_RESPONSE" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

  if [[ -n "$BRAND_NAME" ]]; then
    echo "    Consent screen created via API (Testing mode)."
  fi
fi

# Whether the brand was created via API or already existed, the user still
# needs to configure scopes and add test users in the console. Pause here.
SCOPES_URL="https://console.cloud.google.com/auth/scopes?project=$PROJECT_ID"
STEP=1

echo ""
echo "    ┌─────────────────────────────────────────────────────────────┐"
echo "    │  Manual step required: configure the consent screen        │"
echo "    └─────────────────────────────────────────────────────────────┘"
echo ""
echo "    If you haven't already created the OAuth consent screen app,"
echo "    open this URL first:"
echo ""
echo "      $CONSENT_URL"
echo ""
echo "    $((STEP)). Click 'Continue'"; ((STEP++))
echo "    $((STEP)). Enter App name: $PROJECT_NAME"; ((STEP++))
echo "    $((STEP)). Enter User support email: $SUPPORT_EMAIL"; ((STEP++))
echo "    $((STEP)). Select 'External' under Audience, then click 'Next'"; ((STEP++))
echo "    $((STEP)). Enter your email as the Contact email address"; ((STEP++))
echo "    $((STEP)). Check the agreement box and click 'Continue'"; ((STEP++))
echo "    $((STEP)). Click 'Create'"; ((STEP++))
echo ""
echo "    If the consent screen app already exists, skip to the next part."
echo ""
echo "    ── Add OAuth Scopes ──────────────────────────────────────────"
echo ""
echo "    Open the Scopes page:"
echo "      $SCOPES_URL"
echo ""
echo "    $((STEP)). Click 'Add or Remove Scopes'"; ((STEP++))
echo "    $((STEP)). Scroll down to 'Manually add scopes' and paste this:"; ((STEP++))
echo ""
echo "         openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile,https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.compose"
echo ""
echo "   $((STEP)). Click 'Add to Table', then click 'Update', then click 'Save'"; ((STEP++))
echo ""
echo "    ── Add Test Users ────────────────────────────────────────────"
echo ""
echo "   $((STEP)). Add the Gmail address(es) you want to access through AgentCloak"; ((STEP++))
echo "   $((STEP)). Click 'Save and Continue' through remaining pages"
echo ""
read -rp "    Press Enter when done (or 's' to skip) ... " consent_done

if [[ "${consent_done,,}" == "s" ]]; then
  echo "    Skipped — you can finish consent screen setup later."
fi

# Re-fetch brand and validate
echo ""
echo "    Verifying consent screen ..."
ACCESS_TOKEN=$(gcloud auth print-access-token)
EXISTING_BRANDS=$(curl -sf \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://oauth2.googleapis.com/v1/projects/$PROJECT_ID/brands" 2>/dev/null || echo "{}")
BRAND_NAME=$(echo "$EXISTING_BRANDS" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

if [[ -n "$BRAND_NAME" ]]; then
  echo "    Consent screen found."
  echo ""
  echo "    Note: Google does not expose configured scopes via API, so we"
  echo "    cannot verify them automatically. If you see auth errors later,"
  echo "    check that all 5 scopes were added at:"
  echo "      $SCOPES_URL"
else
  echo "    Warning: Consent screen not found. Credential creation will be skipped."
  echo "    You can finish setup later at: $CONSENT_URL"
fi

# ─── 5. Create OAuth 2.0 credentials ───────────────────────────────────────

echo ""
echo ">>> Step 5/6: Creating OAuth 2.0 credentials ..."

# Extract origin from redirect URI (e.g., http://localhost:3000)
ORIGIN=$(echo "$REDIRECT_URI" | sed -E 's|(https?://[^/]+).*|\1|')

CREDS_MANUAL=false
CLIENT_ID=""
CLIENT_SECRET=""

if [[ -z "$BRAND_NAME" ]]; then
  echo "    Skipped — consent screen must be configured first."
  CREDS_MANUAL=true
else
  CRED_RESPONSE=$(curl -sf \
    -X POST \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"client_id\": {
        \"application_type\": \"WEB\",
        \"redirect_uris\": [\"$REDIRECT_URI\"],
        \"js_origins\": [\"$ORIGIN\"],
        \"display_name\": \"$PROJECT_NAME Web\"
      }
    }" \
    "https://oauth2.googleapis.com/v1/$BRAND_NAME/clients" 2>/dev/null || echo "{}")

  CLIENT_ID=$(echo "$CRED_RESPONSE" | grep -o '"clientId":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
  CLIENT_SECRET=$(echo "$CRED_RESPONSE" | grep -o '"clientSecret":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

  if [[ -n "$CLIENT_ID" && -n "$CLIENT_SECRET" ]]; then
    echo "    Credentials created."
  else
    CREDS_MANUAL=true
  fi
fi

if [[ "$CREDS_MANUAL" == true ]]; then
  CLIENT_ID="${CLIENT_ID:-<your-client-id>}"
  CLIENT_SECRET="${CLIENT_SECRET:-<your-client-secret>}"
  echo ""
  echo "    Could not create credentials automatically."
  echo "    Create them manually:"
  echo "      1. Open https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
  echo "      2. Click 'Create Credentials' > 'OAuth client ID'"
  echo "      3. Application type: Web application"
  echo "      4. Name: $PROJECT_NAME Web"
  echo "      5. Authorized JavaScript origins: $ORIGIN"
  echo "      6. Authorized redirect URIs: $REDIRECT_URI"
  echo "      7. Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the .env file"
fi

# ─── 6. Generate .env file ──────────────────────────────────────────────────

echo ""
echo ">>> Step 6/6: Generating .env file ..."

# Resolve project root (one level up from scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

# Auto-generate secrets
SESSION_SECRET=$(openssl rand -hex 32)
DATABASE_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Derive BASE_URL from redirect URI
BASE_URL=$(echo "$REDIRECT_URI" | sed -E 's|(https?://[^/]+).*|\1|')

# Extract port from BASE_URL (default 3000)
PORT=$(echo "$BASE_URL" | grep -oE ':[0-9]+$' | tr -d ':')
PORT="${PORT:-3000}"

if [[ -f "$ENV_FILE" ]]; then
  echo ""
  echo "    .env already exists at $ENV_FILE"
  read -rp "    Overwrite it? [y/N] " overwrite
  if [[ "${overwrite,,}" != "y" ]]; then
    echo "    Skipped — .env not modified."
    echo ""
    echo "    Generated values (add manually):"
    echo "      SESSION_SECRET=$SESSION_SECRET"
    echo "      DATABASE_ENCRYPTION_KEY=$DATABASE_ENCRYPTION_KEY"
    echo "      GOOGLE_CLIENT_ID=$CLIENT_ID"
    echo "      GOOGLE_CLIENT_SECRET=$CLIENT_SECRET"
    echo "      GOOGLE_REDIRECT_URI=$REDIRECT_URI"
    echo ""

    echo "============================================"
    echo "  GCP setup complete!"
    echo "============================================"
    exit 0
  fi
fi

cat > "$ENV_FILE" <<EOF
# Generated by setup-gcp-project.sh on $(date -u +"%Y-%m-%d %H:%M:%S UTC")

# Google OAuth credentials
GOOGLE_CLIENT_ID=$CLIENT_ID
GOOGLE_CLIENT_SECRET=$CLIENT_SECRET
GOOGLE_REDIRECT_URI=$REDIRECT_URI

# Server config
BASE_URL=$BASE_URL
PORT=$PORT

# Session secret (auto-generated, 64 hex chars)
SESSION_SECRET=$SESSION_SECRET

# Session lifetime (optional — defaults to 7 days in ms)
# SESSION_MAX_AGE=604800000

# Database (optional — defaults to data/agentcloak.db)
# DATABASE_PATH=data/agentcloak.db

# Database encryption key (auto-generated, 64 hex chars)
# Requires better-sqlite3-multiple-ciphers instead of standard better-sqlite3.
# Uncomment to enable encryption at rest:
# DATABASE_ENCRYPTION_KEY=$DATABASE_ENCRYPTION_KEY

# Formspree contact form endpoint (optional — landing page contact form)
# VITE_FORMSPREE_URL=https://formspree.io/f/your-form-id

# Google OAuth invite-only mode (optional — shows invite-only badges on OAuth options)
# Set to "true" while Google OAuth app is in testing mode. Remove when going to production.
# VITE_GOOGLE_OAUTH_INVITE_ONLY=true
EOF

echo "    Written to $ENV_FILE"

# ─── Done ───────────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo "  Setup complete!"
echo "============================================"
echo ""
echo "Generated .env with:"
echo "  SESSION_SECRET       — auto-generated (64 hex chars)"
echo "  DATABASE_ENCRYPTION_KEY — auto-generated (commented out, uncomment to enable)"
if [[ "$CREDS_MANUAL" == true ]]; then
  echo "  GOOGLE_CLIENT_ID     — placeholder (replace after manual credential creation)"
  echo "  GOOGLE_CLIENT_SECRET — placeholder (replace after manual credential creation)"
else
  echo "  GOOGLE_CLIENT_ID     — from GCP"
  echo "  GOOGLE_CLIENT_SECRET — from GCP"
fi
echo "  GOOGLE_REDIRECT_URI  — $REDIRECT_URI"
echo ""
echo "Console links:"
echo "  Credentials:    https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
echo "  Consent screen: https://console.cloud.google.com/apis/credentials/consent?project=$PROJECT_ID"
echo "  Gmail API:      https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=$PROJECT_ID"
echo ""
echo "Next steps:"
echo "  pnpm install        # if you haven't already"
echo "  pnpm build && pnpm dev"
echo ""
echo "Notes:"
echo "  - The OAuth app starts in 'Testing' mode. Only users you add as"
echo "    test users on the consent screen can authenticate."
echo "  - To add test users: open the consent screen link above and add"
echo "    email addresses under 'Test users'."
echo "  - To go to production: submit for Google verification at the"
echo "    consent screen page."
