# Support Guide

Welcome to the Pet Pomodoro support channel. Since this is an unofficial, community-maintained open-source tool, support is provided on a best-effort basis.

---

## 1. Quick Troubleshooting Checklist

Before seeking support, please verify the following:

- **Operating System**: Are you running macOS? (Windows/Linux are not supported).
- **Prerequisites**: Do you have Python 3.11+, Node.js, and Xcode Command Line Tools installed? You can check them by running:
  ```bash
  python3 --version
  node --version
  xcrun swiftc --version
  ```
- **CLI Pathing**: If the `ultradian` or `codex-pet-companion` commands cannot be found in your terminal, check if `~/.local/bin` is in your environment's `$PATH`. Add it by adding `export PATH="$HOME/.local/bin:$PATH"` to your shell profile (e.g., `~/.zshrc`).
- **Logs**: Review standard system logs if services fail to launch:
  ```bash
  tail -f ~/.codex/ultradian-rhythm/launchctl.log
  tail -f ~/.codex/ultradian-rhythm/launchctl.err
  tail -f ~/.codex/ultradian-rhythm/companion-launchctl.log
  tail -f ~/.codex/ultradian-rhythm/companion-launchctl.err
  ```

---

## 2. Getting Help

If your issue persists after completing the checklist:

### GitHub Issues
You can open a bug report, ask configuration questions, share pet packages, or inquire about custom scripting:
- **Search existing issues**: Check if someone else has run into the same problem and found a solution.
- **Open a new issue**: Go to the **Issues** tab on GitHub and select the appropriate issue template. Provide as much environment context (macOS version, node/python versions, and log outputs) as possible.
