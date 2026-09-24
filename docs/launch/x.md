# X Launch Thread

## Post 1

I built Pet Pomodoro for Codex: a science-informed timer inspired by Huberman Lab's ultradian-rhythm framing. It turns your existing Codex pet into a calm visual pause cue when focus ends.

25/50/90-minute presets. Fullscreen pet breaks. No cloud account.

GitHub: https://github.com/Xmemo/codex-pet-companion

## Post 2

The interaction stays deliberately small:

1. Open the transparent tomato panel
2. Pick 25, 50, or 90 minutes
3. Work
4. When rest starts, the pet expands into a fullscreen visual cue

The pet is part of the transition, not just desktop decoration.

## Post 3

It is research-informed, not a biohack claim.

Break research supports recovery and reduced fatigue, but there is no proven universal work/rest interval. The 90-minute option is inspired by ultradian-rhythm science communication, including Huberman Lab, and is presented as an experiment rather than a biological rule.

Sources and limitations are documented in the repo.

## Post 4

Session goals, timing events, and completion state stay in local SQLite.

Export with:

`ultradian history --limit 50 --json`

You can inspect the JSON or give it to an AI assistant yourself. Pet Pomodoro never uploads it or calls a model automatically.

## Post 5

Current boundaries:

- macOS only
- source install; Xcode Command Line Tools required
- unofficial and not affiliated with OpenAI
- no telemetry or network service
- no bundled or extracted Codex pet assets

Release: https://github.com/Xmemo/codex-pet-companion/releases/tag/v0.1.0
