# Personal Agent Benchmark Lab

Agent entry for the public inner repository. Product setup is in `README.md`. The browser app starts at `index.html`, which loads `src/main.tsx`.

## Commands

- `npm ci` installs from the committed `package-lock.json`. Do not regenerate the lockfile unless a dependency change requires it.
- `npm run typecheck` runs `tsc --noEmit -p tsconfig.app.json`.
- `npm run lint` runs ESLint.
- `npm run build` runs the Vite production build.
- `npm run dev` starts the local Vite server. There is no `test` script.
- Do not deploy Supabase, run paid or live model calls, or copy private transcripts into this repository.

## Current work

Activation branch `gdl22/activation-001`. The candidate receipt is private, at `C:\Users\Roy Harden\OneDrive\PJ-OD\SoftwareFactory\.agent-work\parts89\GDL22-agent-benchmark-lab\REPORT.md`.

<!-- xexport-auto:begin -->
## Chat autosave

Export at session start, after each completed batch or child handoff, before final
reporting, and at the next available execution step when the last verified export
is older than 10 minutes (configurable). On a user status request, refresh if stale.

    xexport current --source <claude|codex|cursor|grok|antigravity> --session-id "<exact own session id>" \
        --format html --mode append --out "C:\Users\Roy Harden\OneDrive\PJ-OD\SoftwareFactory\.chatexports"

- Session id: `CODEX_THREAD_ID` (Codex), `CURSOR_CONVERSATION_ID` (Cursor),
  `CLAUDE_CODE_SESSION_ID` (Claude Code), `GROK_SESSION_ID` (Grok),
  `ANTIGRAVITY_CONVERSATION_ID` (Antigravity). Do not use recency when an ID is absent.
- Verify the returned session ID on every result, including "Up to date"; exit 0
  alone is insufficient. On missing/mismatched identity, preserve existing exports,
  stop this path, inspect only the intended session metadata, and report the failure.
  Never use `--mode replace` to repair identity.
- Add `--callsign "<your callsign>"` for your own main session if assigned. A callsign
  affects labeling only. Fresh-context child exports use their own opening assignment.
  Full-history child exports preserve and label inherited context; they use neutral
  `Codex_Sub` labeling when the child's assignment cannot be separated from copied history.
- `--mode append` re-parses and re-renders the whole transcript with shrink/fidelity
  guards. It is not literal line appending; unchanged content is a no-op. Preserve
  guard warnings verbatim, protected originals, and any companion's provenance.
- For children, require xexport **0.2.2+** on Codex. Parent-driven export is:
  `xexport subagents --source <claude|codex|cursor|grok|antigravity> --session-id "<exact parent id>" --format html --mode append --out "C:\Users\Roy Harden\OneDrive\PJ-OD\SoftwareFactory\.chatexports"`.
  Codex discovery includes direct children only; run again for each child with
  children of its own. Verify each returned ID against the explicitly linked child.
- Native Codex children may self-export when runtime `CODEX_THREAD_ID` matches
  metadata `payload.id` and the rollout filename. Metadata `session_id` and runtime
  `CODEX_SESSION_ID` can identify the parent. If the runtime ID is inherited/missing,
  have the parent use the verified exact child thread ID. Before 0.2.2, even an exact
  child ID is unsafe: report the unsupported path instead of attempting the write.
- Claude/Cursor children without a verified independent identity rely on their
  parent/hook; do not run `current` with an inherited parent ID and a child's callsign.
- Preserve parent/child last-success times, pending failures, and next freshness
  checkpoint in existing task status/handoff notes across compaction. Update success
  only after verification; report stale/failed children on status requests. This is
  execution policy, not authorization to install a watcher or scheduled automation.
- A receipt path you quote to another agent is a location, not permission to read it:
  transcripts hold the user's prompts and tool output.
- Exports are folders under `.chatexports\html\`. To read one, yours or another
  agent's, follow the `xexport-read` skill: page map in `index.html` first, then the
  `page-NNN.html` files, each sized for one read. Add `--format both` to also keep a
  single-file Markdown copy.
<!-- xexport-auto:end -->
