# Changelog

Notable changes to Socle for VS Code, in the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format, with
[Semantic Versioning](https://semver.org/). Each release names the Socle
release whose language server it bundles. Up to 0.22.0 the extension shipped
with Socle itself (see the [Socle changelog](https://github.com/socless/socle/blob/main/CHANGELOG.md)).

## [Unreleased]

## [0.26.0] - 2026-11-04

Bundles the language server of Socle 0.24.0.

### Changed

- The bundled server, from Socle 0.24.0, brings I/O tag names in the zoomed-out overview,
  faster exports of large designs, I/O tags kept in their columns, and the same layout from
  one JVM to the next.

## [0.25.0] - 2026-11-02

Bundles the language server of Socle 0.23.0. The first release on the Visual Studio Marketplace.

### Changed

- The extension's ID is now `socless.socle` (publisher `socless`, was `socle`), the ID it has on
  the Visual Studio Marketplace and on Open VSX. A vsix installed by hand under the old ID is a
  separate extension: uninstall it.

## [0.24.0] - 2026-11-02

Bundles the language server of Socle 0.23.0.

### Changed

- The extension is now licensed under the GNU AGPL-3.0, like Socle (was MIT).
- The bundled server's embedded Surfer no longer carries the builder's local paths. The
  0.23.0 vsix, which did, is removed from its release.

## [0.23.0] - 2026-11-02

Bundles the language server of Socle 0.22.0.

### Changed

- The extension has its own repository (socless/socle-vscode) and its own
  releases. The vsix still bundles the language server: the server of the
  Socle release it pins (0.22.0), downloaded at build time and checked against
  its sha256. Settings, commands and views are unchanged.
