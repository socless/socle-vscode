#!/usr/bin/env bash
# README screenshots of the staged Socle extension in a headless VS Code, in one theme.
#
#   ./mill stage
#   SOCLE_ROOT=/path/to/socle e2e/shots.sh out/stage.dest <dark|light> <outDir>
#
# Same VS Code launch as run.sh (read its header: SOCLE_ROOT is a scratch Socle clone at the
# pinned release's tag), with the theme set, the story in shots.js and the CDP driver shots.mjs.
# Writes <outDir>/schematic-<theme>.png, fsm-<theme>.png, waves-<theme>.png and the hero's frames
# in <outDir>/frames-hero-<theme>/. Simulate needs Verilator on PATH.
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: $0 <stageDir> <dark|light> <outDir>" >&2
  exit 2
fi
stage=$(cd "$1" && pwd)
theme=$2
mkdir -p "$3"
out=$(cd "$3" && pwd)
e2e=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "${SOCLE_ROOT:?set SOCLE_ROOT to a Socle checkout (see run.sh)}" && pwd)
case "$theme" in
  dark) colorTheme="Default Dark Modern" ;;
  light) colorTheme="Default Light Modern" ;;
  *) echo "theme: dark or light" >&2; exit 2 ;;
esac
command -v verilator >/dev/null || { echo "shots: Simulate needs verilator on PATH" >&2; exit 2; }

find_electron() {
  if [[ -n "${SOCLE_E2E_ELECTRON:-}" ]]; then echo "$SOCLE_E2E_ELECTRON"; return; fi
  local cli bin
  if cli=$(command -v code) && cli=$(readlink -f "$cli"); then
    bin=$(dirname "$cli")
    for c in "$bin/../code" "$bin/../../../MacOS/Electron" "$bin/../../../MacOS/Code"; do
      if [[ -f "$c" && -x "$c" ]]; then readlink -f "$c"; return; fi
    done
  fi
  echo /usr/share/code/code
}
electron=$(find_electron)
[[ -x "$electron" ]] || { echo "shots: VS Code binary $electron not found; set SOCLE_E2E_ELECTRON" >&2; exit 2; }

tmp=$(mktemp -d "${TMPDIR:-/tmp}/socle-shots.XXXXXX")
mkdir -p "$tmp/user-data/User" "$tmp/extensions"
cat >"$tmp/user-data/User/settings.json" <<EOF
{
  "window.newWindowDimensions": "fullscreen",
  "workbench.colorTheme": "$colorTheme",
  "workbench.startupEditor": "none",
  "workbench.secondarySideBar.defaultVisibility": "hidden",
  "chat.commandCenter.enabled": false,
  "editor.minimap.enabled": false,
  "socle.waveViewer": "surfer-panel"
}
EOF
cdp_port=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
cleanup() {
  if pgrep -f "$tmp" >/dev/null 2>&1; then pkill -f "$tmp" || true; sleep 1; fi
  if command -v trash >/dev/null 2>&1; then trash "$tmp"; else echo "shots: left temp dir $tmp"; fi
}
trap cleanup EXIT
for v in $(compgen -e | grep -E '^(ELECTRON_|VSCODE_)' || true); do unset "$v"; done

node "$e2e/shots.mjs" "$tmp" "$cdp_port" "$theme" "$out" >"$out/driver-$theme.log" 2>&1 &
status=0
SOCLE_E2E_DIR="$tmp" SOCLE_SHOTS_THEME="$theme" xvfb-run -a -s "-screen 0 1600x1000x24" "$electron" \
  --remote-debugging-port="$cdp_port" \
  --user-data-dir "$tmp/user-data" \
  --extensions-dir "$tmp/extensions" \
  --disable-extensions \
  --disable-workspace-trust \
  --skip-welcome \
  --skip-release-notes \
  --extensionDevelopmentPath="$stage" \
  --extensionTestsPath="$e2e/shots.js" \
  "$repo" || status=$?
echo "shots: driver log:"; cat "$out/driver-$theme.log" || true
if [[ $status -ne 0 ]]; then
  echo "shots: FAILED (exit $status); Socle language server output:"
  find "$tmp/user-data/logs" -name '*Socle*.log' -print -exec cat {} \; 2>/dev/null || true
fi
exit $status
