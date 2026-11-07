#!/usr/bin/env bash
# Retakes the README screenshots and demo GIF of Socle for VS Code, dark and light, into
# docs/media/ (see DEVELOPING.md). Needs xvfb-run, VS Code, ffmpeg, node and Verilator on PATH.
#
#   SOCLE_ROOT=/path/to/socle tools/screenshots.sh
#
# SOCLE_ROOT: a scratch Socle clone at the pinned release's tag, as for e2e/run.sh.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
media="$root/docs/media"
raw="$root/out/screenshots"
cd "$root"
./mill stage
mkdir -p "$media" "$raw"

# Timed frames (<ms>.png) to a GIF of at most 3 MB: 1200 px wide, else smaller.
# Each frame lasts until the next one; the last one 1 s.
to_gif() {
  local frames=$1 gif=$2 list="$1/frames.txt" prev="" prevf="" t width
  : >"$list"
  for f in $(ls "$frames"/*.png | sort); do
    t=$(basename "$f" .png); t=$((10#$t))
    [ -n "$prev" ] && printf "file '%s'\nduration %s\n" "$prevf" "$(awk -v d=$((t - prev)) 'BEGIN{printf "%.3f", d/1000}')" >>"$list"
    prev=$t; prevf=$f
  done
  printf "file '%s'\nduration 1\nfile '%s'\n" "$prevf" "$prevf" >>"$list"
  for width in 1200 1100 1000; do
    ffmpeg -loglevel error -y -f concat -safe 0 -i "$list" \
      -vf "scale=$width:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
      -fps_mode vfr "$gif"
    [ "$(stat -c %s "$gif")" -le $((3 * 1024 * 1024)) ] && return 0
  done
  return 0  # check-media.sh reports the size
}

for theme in dark light; do
  e2e/shots.sh out/stage.dest "$theme" "$raw"
  for s in schematic fsm waves; do cp "$raw/$s-$theme.png" "$media/"; done
  to_gif "$raw/frames-hero-$theme" "$media/hero-$theme.gif"
done

tools/check-media.sh "$media" hero-dark.gif hero-light.gif schematic-dark.png schematic-light.png \
  fsm-dark.png fsm-light.png waves-dark.png waves-light.png
