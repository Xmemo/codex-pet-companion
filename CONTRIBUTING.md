# Contributing to Codex Pet Companion

Thanks for helping improve the project. The repository is intentionally local-first, small-scope, and behavior-focused.

## Project principles

1. **Local-first by default.** Do not introduce mandatory cloud services, telemetry, hosted dashboards, or remote databases.
2. **No proprietary assets.** Do not commit official OpenAI/Codex pet art, logos, trademarks, or private user assets. Test fixtures must be redistributable.
3. **macOS-first.** The supported runtime is macOS with Swift/AppKit, LaunchAgents, Python, and Node. Cross-platform ports should not complicate the canonical macOS implementation.
4. **Recovery boundary over feature count.** The core job is focus → visible recovery boundary → return. Agent monitoring, token dashboards, XP/levels, social profiles, generic chat, or productivity-suite scope are out of scope for the near-term OSS release.
5. **Behavioral verification matters.** Screenshots prove rendering, not click handling, command dispatch, daemon state transitions, or recovery behavior.

## Development setup

Prerequisites:
- macOS
- Python 3.11+
- Node.js
- Xcode Command Line Tools
- `uv` for the documented Python test workflow

## Required checks

```bash
CODEX_TIMER_OVERLAY_HOME="$(mktemp -d)" node --test tests/*.test.js
PYTHONPATH=. uv run --with pytest --python 3.12 pytest -q
xcrun swiftc -typecheck src/companion_renderer.swift src/timer_panel.swift
zsh -n scripts/install.sh scripts/uninstall.sh
plutil -lint packaging/io.github.codex-ultradian-rhythm.plist packaging/io.github.codex-pet-companion.plist
git diff --check
```

For floating/nonactivating UI changes, also complete a real macOS interaction check covering first mouse, hit testing, action dispatch, daemon state transition, and collapse/expand behavior.

## Pull requests

- Use one branch per coherent change.
- Keep PR scope narrow and state the acceptance evidence.
- Do not mix product redesign with unrelated engineering-control fixes.
- Do not claim real-device acceptance from automated tests or screenshots alone.
- For user-visible accepted deployments, record the commit/recovery point before the next UI iteration.
