# Reddit Launch Post

## Suggested Title

[Open Source] Pet Pomodoro: a local-first focus timer that turns your Codex pet into a fullscreen rest cue

## Post

I built **Pet Pomodoro for Codex**, a science-informed macOS timer inspired by Huberman Lab's ultradian-rhythm framing. The tomato dial stays with your existing pet; at the break boundary, that pet expands into a calm visual pause cue.

The basic loop is:

- choose a 25/5, 50/10, or 90/20 work/rest preset;
- keep the timer visible without a conventional app window;
- when work ends, expand the pet into a fullscreen visual rest cue;
- keep goals, timing events, and completion state in a local SQLite database.

The history can be exported with:

```bash
ultradian history --limit 50 --json
```

That export is intended for personal inspection or user-directed AI analysis. The app does not include an AI model, upload session data, run telemetry, or expose a network service.

### Why those intervals?

The design is inspired by research on work breaks, sustained attention, and ultradian rhythms, as well as Huberman Lab's public discussion of focus bouts and deliberate decompression.

I am deliberately not claiming that everyone has an exact 90-minute waking cognitive cycle. A meta-analysis supports micro-breaks for vigor and fatigue but found a non-significant overall performance effect, and a direct 1995 test found no significant 90-minute cognitive performance rhythm. The presets are practical options to compare against your own work patterns, not medical advice.

### Installation and privacy

The current release is macOS-only and source-only. It requires Python 3.11+, Node.js, and Xcode Command Line Tools; the installer compiles the Swift renderer locally and installs user-level LaunchAgents.

The repository and release do not include OpenAI logos, extracted built-in pet spritesheets, proprietary Codex assets, or unsigned precompiled binaries.

This is an independent, unofficial community project and is not affiliated with or endorsed by OpenAI.

GitHub: https://github.com/Xmemo/codex-pet-pomodoro

Feedback on installer reliability, pet compatibility, and the fullscreen rest interaction would be useful.
