# GitHub Release: v0.1.0

> Historical release notes. `v0.1.0` predates artifact attestations and is not accepted by the current bootstrap verifier. Do not treat its checksum as publisher authentication. Use a later release and install through the version-pinned bootstrap contract.

## Pet Pomodoro v0.1.0

Pet Pomodoro is a science-informed Pomodoro timer for Codex on macOS. Inspired by Huberman Lab's ultradian-rhythm framing, it pairs bounded focus with deliberate recovery. The timer stays with your Codex pet; at the break boundary, that pet expands into a calm visual pause cue.

Choose a `25/5`, `50/10`, or `90/20` focus/rest preset from the transparent tomato panel. When work ends, the currently selected pet becomes a fullscreen visual rest cue. Goals, timing events, and completion state remain in a local SQLite database and can be exported as JSON for user-directed AI analysis.

### Highlights

- Transparent tomato timer with 25/50/90-minute presets
- Fullscreen rest cue using the selected compatible pet
- Local session history with `ultradian history --json`
- No telemetry, cloud sync, network service, or automatic AI calls
- Source-only macOS installation with rollback-aware LaunchAgent setup

### Install

```bash
tar -xzf pet-pomodoro-for-codex-v0.1.0.tar.gz
cd pet-pomodoro-for-codex-v0.1.0
./scripts/install.sh
```

Requirements: macOS, Python 3.11+, Node.js, and Xcode Command Line Tools.

For this historical release, the checksum detects accidental or malicious mismatch only and does not authenticate the publisher. Future releases must be installed through the bootstrap contract, which verifies both SHA256 and the GitHub artifact attestation.

### Research Position

The work/rest design is inspired by research on breaks, sustained attention, and ultradian rhythms, plus Huberman Lab's public discussion of focus bouts and deliberate decompression. These presets are practical choices, not medical advice or universal biological rules. The repository includes both supporting and contradictory evidence, including the limited direct evidence for an exact 90-minute waking cognitive cycle.

### Important

This is an independent, unofficial community project. It is not affiliated with or endorsed by OpenAI. The release contains no OpenAI logos, extracted Codex pet spritesheets, signed binaries, or proprietary built-in assets.

See the README for installation, privacy, scientific sources, troubleshooting, and uninstall instructions.
