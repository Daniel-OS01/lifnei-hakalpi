#!/usr/bin/env bash
# Starts the site with docker compose and checks what Dokploy relies on: the health endpoint, the pages,
# cache headers and gzip. Every failure is printed as a GitHub annotation, so it is readable from the PR.
# Usage: scripts/compose-smoke.sh [base-url]   (default http://localhost:8080; leaves the stack running)
set -uo pipefail
BASE="${1:-http://localhost:8080}"
fails=0
note() { printf '::error title=compose smoke::%s\n' "$(printf '%s' "$1" | sed ':a;N;$!ba;s/\n/%0A/g')"; }
check() {   # check <description> <command...>
  local what="$1"; shift
  local out
  if out=$("$@" 2>&1); then echo "ok   $what"; else echo "FAIL $what"; note "$what"$'\n'"$out"; fails=$((fails + 1)); fi
}

if ! up=$(docker compose up -d --build --wait --wait-timeout 120 2>&1); then
  note "docker compose up failed"$'\n'"$(printf '%s' "$up" | tail -n 30)"$'\n'"--- ps"$'\n'"$(docker compose ps -a 2>&1)"$'\n'"--- logs"$'\n'"$(docker compose logs --no-color --tail 40 2>&1)"
  exit 1
fi
echo "ok   docker compose up (healthy)"

election=$(node -p "require('./config/site.json').currentElection")
asset=$(curl -fsS "$BASE/" | grep -o 'assets/[^"]*\.js' | head -1)

check "/healthz answers ok" sh -c "curl -fsS '$BASE/healthz' | grep -qx ok"
check "/ serves the page" sh -c "curl -fsS '$BASE/' | grep -q '<html'"
check "site.json for $election" curl -fsS -o /dev/null "$BASE/data/elections/$election/site.json"
check "HTML is not cached" sh -c "curl -fsSI '$BASE/' | tr -d '\r' | grep -i '^cache-control: no-cache'"
check "hashed asset found in the page ($asset)" test -n "$asset"
check "hashed assets are immutable" sh -c "curl -fsSI '$BASE/$asset' | tr -d '\r' | grep -i '^cache-control:.*immutable'"
check "assets are served gzipped" sh -c "curl -fsS -o /dev/null -D - -H 'Accept-Encoding: gzip' '$BASE/$asset' | tr -d '\r' | grep -i '^content-encoding: gzip'"
check "security headers present" sh -c "curl -fsSI '$BASE/' | tr -d '\r' | grep -i '^content-security-policy:'"

if [ "$fails" -gt 0 ]; then
  note "headers seen for / and the asset"$'\n'"$(curl -sSI "$BASE/" 2>&1)"$'\n'"---"$'\n'"$(curl -sSI -H 'Accept-Encoding: gzip' "$BASE/$asset" 2>&1)"
  echo "compose smoke: $fails check(s) failed"; exit 1
fi
echo "compose smoke: all checks passed"
