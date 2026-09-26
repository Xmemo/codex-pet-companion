# Codex One-Line Install Contract

This contract is for an AI agent executing the installation with the user's approval.

## Requirements and trust checks

1. Confirm macOS, Python 3.11+, Node.js, Xcode Command Line Tools, and GitHub CLI (`gh`).
2. Preserve normal approval prompts. Never bypass user permissions, sandbox restrictions, or confirmation dialogs.
3. Download and stage files in a unique private temporary directory; remove it on success or failure.
4. Use a release newer than `v0.1.0`. That release predates artifact attestations and is intentionally rejected by the current bootstrap.
5. Before executing any package installer, the bootstrap checks the archive SHA256 and runs `gh attestation verify` requiring:
   - repository: `Xmemo/codex-pet-pomodoro`
   - signer workflow: `Xmemo/codex-pet-pomodoro/.github/workflows/release.yml`
   - source ref: the exact `refs/tags/<version>` being installed

The attestation authenticates GitHub Actions provenance for the artifact; it does not prove the code is vulnerability-free. Users still trust the repository maintainers, the release workflow, GitHub, and GitHub CLI. It is not an Apple code signature or notarization.

## Execution workflow

1. Download `scripts/bootstrap.sh` only from the exact version tag, over HTTPS:
   `https://raw.githubusercontent.com/Xmemo/codex-pet-pomodoro/<version>/scripts/bootstrap.sh`
2. Inspect the script and tag, then run `/bin/zsh bootstrap.sh <version>` with the same version.
3. Confirm and report both health checks:
   - `ultradian status --json`
   - `codex-pet-companion status --json`

## Safety boundaries

- Never execute an unpinned script from the `main` branch.
- Never use `curl | sh` or execute an unverified payload.
- Never use `sudo` or elevated privileges.
- Never bypass user approvals or OS security prompts.
- Never modify `ChatGPT.app`, `Codex.app`, or official app bundles/atlas files.
- If checksum or attestation verification fails, stop without extracting or running the installer.

## Rollback

If verification fails, installation stops before payload execution. Failures after execution are handled by the packaged installer's rollback behavior.
