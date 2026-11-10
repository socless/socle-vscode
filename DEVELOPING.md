# Developing Socle for VS Code

The extension is Scala.js (CommonJS), built with Mill 1.1.6 (`./mill`). It needs Java 21 or newer
and Node 20 (with npm/npx) on the PATH.

```bash
./mill test     # unit tests (the pure logic, on Node)
./mill stage    # out/stage.dest: the extension directory
./mill vsix     # out/vsix.dest/socle-<version>.vsix
```

## The bundled language server

The extension runs the Socle language server, a jar inside the vsix. `build.mill` pins the Socle
release it comes from:
- `V.socle` is the version;
- `V.socleLspSha256` is the sha256 of that release's `socle-lsp-<version>.jar`, as listed in its
  `SHA256SUMS`.

`./mill serverJar` downloads the jar from `socless/socle` by HTTPS, and falls back to
`gh release download` (a logged-in `gh`) when that fails. A jar whose sha256 differs fails the
build.

To bump the server:
1. Set `V.socle` to the new release, and `V.socleLspSha256` to the sha256 from
   `gh release download v<new> --repo socless/socle --pattern SHA256SUMS`.
2. Run the e2e against that release.
3. Note the new server version in the changelog.

To try a server that is not released yet, point `SOCLE_LSP_JAR` at a local jar (for example
`out/socle-lsp/assembly.dest/out.jar` of a Socle checkout) before `./mill stage` or `./mill vsix`.

The extension talks to the server through LSP and the `socle/*` methods listed in Socle's
`docs/lsp-protocol.md`.

## End-to-end test

`e2e/run.sh` drives the staged extension in a headless VS Code (`xvfb-run`): it views and simulates
the example's ChiselSim tests, clicks in the panel and checks the Surfer tab. Its workspace is a
Socle checkout. Use a scratch clone at the pinned tag, not one you work in, because the language
server runs Mill there.

```bash
git clone --branch v0.25.2 git@github.com:socless/socle.git /tmp/socle
./mill stage
SOCLE_ROOT=/tmp/socle e2e/run.sh out/stage.dest
```

It needs VS Code (`SOCLE_E2E_ELECTRON` to name its binary), `xvfb-run` and Verilator on the PATH.
It is not run in CI.

## README screenshots

`docs/media/` holds the README's images, dark and light: the hero GIF (the schematic following the
cursor through the RV pipeline, a click on a box opening its code, TrafficFsm's state diagram) and
three stills (schematic, FSM diagram, waveforms). To retake them after a UI change:

```bash
SOCLE_ROOT=/path/to/socle tools/screenshots.sh
```

`SOCLE_ROOT` is a scratch Socle clone at the pinned tag, as for the end-to-end test. It stages the
extension and runs `e2e/shots.sh` once per theme: the same headless VS Code as `e2e/run.sh`, the
story in `e2e/shots.js`, and `e2e/shots.mjs` clicking in the panel and taking the screenshots over
CDP. The hero GIF is made from lossless frames (ffmpeg). `tools/check-media.sh` then checks each
file exists, the stills are 1920 px wide and the GIFs at most 3 MB. Simulate needs Verilator on
PATH. Commit the new images.

## CI and releases

- **CI:** runs the unit tests and builds the vsix (bundling the pinned server) on pull requests
  and by hand.
- **Releases:** a `v*` tag runs `release.yml`, which checks the version and the notes, builds the
  vsix and publishes it as a GitHub release, then on the
  [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=socless.socle)
  and on [Open VSX](https://open-vsx.org/extension/socless/socle) (for VSCodium), both under the
  `socless` publisher. Both use trusted publishing (OIDC), so no token is stored: the Marketplace
  publisher `socless` and the Open VSX namespace `socless` each trust this repository's
  `release.yml` (no environment). Open VSX is published only when the repository variable
  `OPENVSX_PUBLISH` is `true`. To cut one:
  1. Set `V.publishVer` to the version.
  2. Add the `## [<version>]` section to `CHANGELOG.md`.
  3. Commit, push, then tag `v<version>` (signed) and push the tag.
  4. Bump `V.publishVer` to the next `-SNAPSHOT`.
