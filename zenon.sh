#!/usr/bin/env bash
# =============================================================================
# Zenon AI Engine — CLI wrapper (Linux / macOS)
# Usage:
#   ./zenon.sh                           # default: assist mode
#   ./zenon.sh --mode correct            # auto-fix & commit
#   ./zenon.sh --mode objective          # implement goal from zenon_objective.md
#   ./zenon.sh --mode objective --objective path/to/my_goal.md
#   ./zenon.sh --mode assist --exclude "test/,fixtures/"
#   ./zenon.sh --mode trainer --topic "Ruby on Rails 7.0"
#   ./zenon.sh --mode reviewer           # review local unstaged/staged git diff
#   ./zenon.sh --mode reviewer --diff "HEAD~1" # review last commit
#   ./zenon.sh --mode analyzer           # show consumption stats and quotas
#   ./zenon.sh --mode analyzer --reset-stats # reset consumption statistics
#   ./zenon.sh --mode helper --topic "¿cómo funciona la autenticación?"
#   ./zenon.sh --mode updater            # auto-update docs relative to code changes
#   ./zenon.sh --mode updater --docs "README.md" # update specific documentation files
# =============================================================================
set -euo pipefail

# Resolve the directory where this script lives (supporting symlinks)
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"
ZENON_JS="$SCRIPT_DIR/src/zenon.js"

# Verify if zenon.js exists
if [ ! -f "$ZENON_JS" ]; then
  echo "" >&2
  echo -e "\033[0;31m❌ [zenon.sh] Error: 'zenon.js' not found at: $ZENON_JS\033[0m" >&2
  echo "   If you copied 'zenon.sh' to this repository, that is not necessary." >&2
  echo "   You can run Zenon from this directory by calling it directly at its original location:" >&2
  echo -e "     \033[0;36m/path/to/Zenon/zenon.sh --mode assist\033[0m" >&2
  echo "   Or add the Zenon directory to your PATH, or symlink the script." >&2
  echo "" >&2
  exit 1
fi

# Source a local .env file if it exists (for local API keys)
ENV_FILE="$SCRIPT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  # Export each non-comment, non-empty line
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  echo "[zenon.sh] Loaded environment from .env"
fi

# Validate Node.js availability
if ! command -v node &> /dev/null; then
  echo "[zenon.sh] ❌ Node.js is not installed or not on PATH." >&2
  echo "           Install Node.js >= 18 from https://nodejs.org" >&2
  exit 1
fi

NODE_VER=$(node --version)
echo "[zenon.sh] Node.js $NODE_VER detected"
echo "[zenon.sh] Launching Zenon AI Engine..."
echo ""

# Forward all CLI arguments to zenon.js
node "$ZENON_JS" "$@"
