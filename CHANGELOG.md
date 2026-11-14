# Changelog

Notable changes to Socle for VS Code, in the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format, with
[Semantic Versioning](https://semver.org/). Each release names the Socle
release whose language server it bundles. Up to 0.22.0 the extension shipped
with Socle itself (see the [Socle changelog](https://github.com/socless/socle/blob/main/CHANGELOG.md)).

## [Unreleased]

## [0.30.0] - 2026-11-14

Bundles the language server of Socle 0.29.0.

### Changed

- The bundled server, from Socle 0.28.0: a CHIRRTL statement the parser does not know or cannot
  read is counted in the design's warnings instead of being dropped, View design warns when the
  test uses a Chisel other than the tested 7.16, and selecting or hovering `io.a` or `core1` no
  longer lights `io.ab` or `core10`.
- The bundled server, from Socle 0.29.0: the Details view gives every module constructor argument
  its value (`nCores = 2`), not only those of `val` parameters (the others read `<unreadable>`).

## [0.29.0] - 2026-11-11

Bundles the language server of Socle 0.27.0.

### Added

- The Hierarchy view shows generator copies as the schematic folds them: one `<name> × <n>` row,
  which selects the folded box in the schematic and lists the copies under it; selecting a copy
  reveals it under its group. The Details view of a folded box gives its copy count. Needs the
  language server of Socle 0.27.0 or later (an older one sends no fold groups: every copy is a row).

## [0.28.0] - 2026-11-10

Bundles the language server of Socle 0.26.0.

### Added

- The `socle.firtoolOpts` setting (default `-preserve-values=named`): the firtool options
  Simulate compiles the design with, so the ports and instances firtool would remove are in
  the trace. Empty turns it off. A server older than Socle 0.26.0 ignores it.

### Changed

- The bundled server, from Socle 0.26.0: Simulate keeps the names firtool would remove
  (`socle.firtoolOpts`).

## [0.27.3] - 2026-11-10

Bundles the language server of Socle 0.25.2.

### Changed

- The bundled server, from Socle 0.25.2: View design and Simulate run on the test module's own
  JDK when it pins one, a `test` module that is not a `TestModule` keeps its fork settings,
  FunSuite tests inside a `def` get their lens, and a workspace opened above or below its
  `build.mill` works. Lenses follow branch switches made outside the editor. Waveforms of a
  design whose top `io` bundle is empty follow the schematic, and a keyboard click after a
  pan is no longer swallowed.

## [0.27.2] - 2026-11-10

Bundles the language server of Socle 0.25.1.

### Changed

- The bundled server, from Socle 0.25.1: the panel fits a narrow editor group, with no
  scrollbars around the page.

## [0.27.1] - 2026-11-09

Bundles the language server of Socle 0.25.0.

### Changed

- Simulate opens the Surfer tab in a group below the Socle panel, so the waveforms sit under
  the schematic instead of beside it.
- A click on a box or a wire in the panel opens its code in a code group, never as a tab over
  the panel or the Surfer tab; the Socle side bar's links do the same.
- The README shows a demo GIF and screenshots of the extension, dark and light.

## [0.27.0] - 2026-11-06

Bundles the language server of Socle 0.25.0.

### Changed

- The bundled server, from Socle 0.25.0, draws the code's own `when` and `switch` blocks as
  boxes, colours registers by clock domain, and adds Previous / Next module buttons, a
  hierarchy tree that follows the open module, and a double-click that opens every module with
  content.

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
