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
git clone --branch v0.23.0 git@github.com:socless/socle.git /tmp/socle
./mill stage
SOCLE_ROOT=/tmp/socle e2e/run.sh out/stage.dest
```

It needs VS Code (`SOCLE_E2E_ELECTRON` to name its binary), `xvfb-run` and Verilator on the PATH.
It is not run in CI.

## CI and releases

- **CI:** runs the unit tests and builds the vsix (bundling the pinned server) on pull requests
  and by hand.
- **Releases:** a `v*` tag runs `release.yml`, which checks the version and the notes, builds the
  vsix and publishes it as a GitHub release. To cut one:
  1. Set `V.publishVer` to the version.
  2. Add the `## [<version>]` section to `CHANGELOG.md`.
  3. Commit, push, then tag `v<version>` (signed) and push the tag.
  4. Bump `V.publishVer` to the next `-SNAPSHOT`.
