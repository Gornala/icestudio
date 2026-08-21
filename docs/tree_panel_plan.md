# Tree Panel — Implementation Plan

Branch: `tree_View`

## Motivation

Graphical and textual views are two projections of the same logic, each blind
where the other sees:

|            | graphical canvas                        | textual / tree                                                       |
| ---------- | --------------------------------------- | -------------------------------------------------------------------- |
| **strong** | flow of information, what connects to what | hierarchy, per-module companion files (code, testbench, formal, readme) |
| **weak**   | no place to show companion files         | connectivity is invisible                                            |

The tree panel adds the missing projection **without replacing the canvas**: a
top-down overlay that lists the design hierarchy and, per module, shows whether
it has a testbench, a simulation and a formal analysis — so untested corners of
a design become visible at a glance.

Scope rule: **the panel never adds new blocks or wires.** It can edit existing
code, and it can add a _missing_ testbench or formal proof. Structure stays a
canvas-only concern.

---

## What already exists (reuse inventory)

Everything below is already in the tree and should be reused rather than
rewritten.

### Hierarchy walking

`app/scripts/controllers/design.js:490` — `buildDepNodes(depBlocks, depth)`
already recurses through `common.allDependencies[block.type].design.graph.blocks`
and produces flattened `{id, type, label, depth, hasChildren, expanded}` nodes.
`$scope.lp.toggleNode` (`design.js:523`) does splice-based expand/collapse on a
flat array. This is ~80% of the tree model.

### Panel precedent

`$scope.lp` (`design.js:433`) + `#left-panel` markup in `app/views/design.html:26`
+ styles at `app/styles/design.css:1712`. Toggle tab, resize handle, tab bar,
node rows, hover-highlight into the canvas (`graph.lpClearHighlight`,
`lpGetCellIds`) — the whole pattern is established and should be mirrored.

### Per-block artifacts on disk

`BUILD_DIR/blocks/<blockId>/` holds, written by the code editor:

| file                   | written by                          |
| ---------------------- | ----------------------------------- |
| `module.v`             | `code-editor.js:522,536,1085`       |
| `testbench.v`          | `code-editor.js:1086,1494`          |
| `sim.vcd`, `sim_output.txt` | sim run, `code-editor.js:1135,1198` |
| `formal.md`            | `code-editor.js:873`                |
| `waveform_state.json`  | `code-editor.js:1046`               |

`BUILD_DIR` = `<projectdir>/ice-build/<projectname>` once the project has been
saved (`utils.filepath2buildpath`, `project.js:213/438/523`); before that it is
a temp dir. **This is the status source of truth.**

### Existing status flags

`nw.App.dataPath/block-status.json`, keyed by `sourcePath || blockId`, fields
`{V, F, T, B}` — written by `code-editor.js:32` and `graph/fileIO.js:713`, read
by the collection manager plugin (`collectionManager2/js/events.js:131`).
Global (not per project), and only populated for blocks pushed to a collection.
Secondary signal at best.

### The editor itself

`app/resources/viewers/code-editor/` — 5.7k lines: ace, verify, iverilog sim,
VCD waveform viewer with markers, formal runner, Claude panel. Launched from
`graph/interactions.js:640-755` as an NW window with a `?config=` JSON blob and
`mode` in `{full, formal, testbench}`.

### Formal output semantics

`formal_verify/formal_verify.py:565` writes `<file>.formal.md` — a static
**analysis** report (registers, wires, dataflow, path coverage), not an
SVA/SymbiYosys proof. Its `## Issues` section (line 425) emits
`OK / CRITICAL / WARNING / INFO` lines with emoji severity markers, which is
parseable into a traffic light.

---

## Architecture

```
+- toolbar ------------------------------------------------+
+- #tree-panel  (overlay, covers canvas, z-index > paper) --+
|  +----------------+------------------------------------+ |
|  | tree           | editor pane                        | |
|  | (35%, resize)  | <iframe src=code-editor.html       | |
|  |                |        ?config=...&embedded=1>     | |
|  | v uart   T S F I|  [Code] [Testbench] [Formal]      | |
|  |   * tx   T S F |                                    | |
|  |   > fifo T S F I|                                   | |
|  | * top_glue - - -|                                   | |
|  +----------------+------------------------------------+ |
+----------------------------------------------------------+
```

**Overlay, not replacement.** The JointJS paper stays mounted underneath; the
panel is `position:absolute; inset:<toolbar> 0 0 0`. Pan/zoom and selection
state survive untouched.

## Decisions taken

**1. Write protection removed outright.** Submodules used to be read-only until
you clicked a padlock. That is gone: entering a submodule is entering an
editable design. The padlock, the "Read only" footer strip, the four
"this submodule is write-protected" dialogs in the Board menu, and the guards
blocking the code editor and deeper navigation are all deleted.

What replaced it:

- `common.isEditingSubmodule` now simply means "the paper is showing a
  submodule", derived from breadcrumb depth in `syncSubmoduleDepth()`. Every
  remaining reader of that flag (virtual-port defaults in `blockforms.js` and
  `port-forms.js`, the footer banners) wanted that meaning all along.
- The save-back that used to happen when you re-locked the padlock now runs on
  every navigation away, via `common.commitSubmoduleEdits()`. Only the
  displayed graph can hold uncommitted changes, so committing the deepest level
  covers multi-level jumps too.
- Footer banner visibility was tied to `appEnable(false)`, which no longer
  happens — it moved to `updateSubmoduleBanners()`, driven by depth.
- Saving from inside a submodule now saves the whole project instead of
  refusing. `project.refreshDependencies()` recollects the dependency set from
  the retained top-level graph, since `update()` deliberately leaves
  `design.graph` alone at that depth.
- "Save as" inside a submodule was ambiguous and used to guess from the lock
  state; it now asks: *Export submodule* or *Save whole design*. The
  `project.save(filepath, cb, asSubmoduleExport)` flag replaces the old
  reliance on `subModuleActive`, which also fixes a latent bug — the submodule's
  package metadata used to overwrite the project's on any save from that depth.

**2. Two levels of testing, not one.** A submodule gets both:

- its code blocks tested individually (per-block `testbench.v`, unchanged), and
- an **integration testbench** over the whole compiled submodule — the `I`
  badge.

`icestudioSubmoduleTestbenchConfig(depType)` compiles any dependency on its own
via `compiler.generate('verilog' | 'testbench', …)` and opens it in the existing
testbench editor. This existed before only for the submodule you had navigated
*into*, and every level shared one `project_tb` directory; it is now keyed per
dependency type, so each module keeps its own testbench and VCD.

Keyed by **type**, not instance, on purpose: editing a submodule propagates to
every instance, so its integration testbench belongs to the module.

**3. "Formal proof" is formal *analysis*.** `formal_verify.py` is a static
analyser, not a prover — it reports registers, dataflow, path coverage and an
issue list with `OK / INFO / WARNING / CRITICAL` severities. The panel calls it
what it is, runs it across every code module at once via **Analyse all**, and
turns the issue counts into the `F` light.

---

## What is built

| file | role |
| --- | --- |
| `app/scripts/services/tree-model.js` | recursive hierarchy walk over `project.design` + `common.allDependencies`; cycle guard; reproduces the editor's `assembleVerilog()` byte-for-byte |
| `app/scripts/services/tree-status.js` | scans `BUILD_DIR/blocks/*`, derives the T/S/F/I lights, rolls submodules up from their children |
| `app/scripts/services/tree-panel.js` | the panel: tree rendering, selection, embedded editor, Analyse all, testbench creation |
| `app/styles/tree-panel.css` | panel styling |
| `app/views/design.html` | `#tree-panel` markup + toolbar button (`fa-sitemap`, next to the git timeline one) |

Supporting changes:

- `interactions.js` — `icestudioReceiveCodeSave` / `icestudioGetCode` now fall
  back to patching `common.allDependencies` when the block is not on the paper,
  so nested code is editable from the tree. `icestudioCodeEditorConfig()` is the
  single config builder, shared with the canvas buttons.
- `code-editor.js` — an `embedded` flag. `nw.Window.get()` returns the *host*
  window inside an iframe, so all geometry handling is skipped; the close-dialog
  path is replaced by `window.iceCodeEditorFlush(cb)`, which the panel calls
  before pointing the iframe at another block. Sim and formal runs call back
  into `parent.iceTreePanel.refresh()`.

### The lights

Per code module: **T** testbench · **S** simulation · **F** formal analysis.
Per submodule: those three rolled up from its children, plus **I** integration.

| | green | amber | red | grey |
| --- | --- | --- | --- | --- |
| **T** | testbench has content past the auto-generated marker | header only | — | absent |
| **S** | `sim.vcd` newer than a `module.v` that matches the current code | stale, or code changed since | errors in `sim_output.txt` | never run |
| **F** | report is current and has no CRITICAL | stale, or WARNINGs present | CRITICAL present | never run |
| **I** | module compiled and simulated as a whole, current | testbench exists but never run, or stale | integration sim failed | no integration testbench |

Two things make the lights honest rather than decorative:

- **Staleness is content-based.** `tree-model.js` rebuilds the exact `module.v`
  the editor would have written and compares it with the one on disk. Green
  means "this artifact describes the code that is in the design *now*", never
  "this was tested once".
- **Untested ranks worse than stale in the roll-up** (`ORDER = [OK, STALE,
  NONE, BAD]`). One untested child must never let its parent read green — that
  is the entire point of the view.

---

## Not built yet

- Hovering a tree row does not highlight the corresponding cell on the canvas
  underneath (the `lp` panel's highlight helpers are there to reuse).
- Generate frames are skipped by the walk; only submodules and code blocks are
  listed.
- No "show only untested" filter or coverage sort.
- README / documentation column.

## Risks

- **Unsaved project → temp `BUILD_DIR`.** The panel shows a banner and still
  works, but artifacts written there are lost on exit.
- **Dependency ids are content hashes** (`utils.dependencyID`) but are assigned
  once and carried, not recomputed on edit — which is what makes
  `blocks/<depType>` a stable home for an integration testbench. Anything that
  starts re-hashing dependencies on save would silently orphan those artifacts.
- Two instances of the same module share one status, by design.
