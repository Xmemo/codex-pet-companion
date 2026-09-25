# Codex One-Line Install Contract

This is an agent-facing execution contract for AI agents (e.g., Codex) executing the one-line installation.

## Prerequisites and Verification
1. **Confirm Environment**: Confirm the operating system is macOS and that all prerequisites (Python 3.11+, Node.js, and Xcode Command Line Tools) are installed and available.
2. **Preserve User Review**: Preserve normal approval reviews. Do NOT attempt to silently bypass user permissions, sandbox restrictions, or confirmation dialogs. Codex may request network/filesystem approvals.
3. **Private Temporary Workspace**: Create a private, unique temporary directory for all download and staging activities. Clean this directory upon exit or failure.
4. **Publisher Trust**: A checksum downloaded beside a release asset detects mismatches; it does not independently authenticate the publisher. Review the repository and release source before first installation.

## Execution Workflow
1. **Download Pinned Bootstrap**: Download `scripts/bootstrap.sh` *only* from the pinned `v0.1.0` tag over strict HTTPS:
   `https://raw.githubusercontent.com/Xmemo/codex-pet-pomodoro/v0.1.0/scripts/bootstrap.sh`
2. **Run Pinned Bootstrap**: Execute the downloaded bootstrap script using `/bin/zsh` with the argument `v0.1.0`:
   `/bin/zsh bootstrap.sh v0.1.0`
3. **Report Status**: Confirm and report the status of both health checks:
   - `ultradian status --json`
   - `codex-pet-companion status --json`

## Safety Boundaries and Prohibitions
- **No Main Branch Execution**: Never download or execute unpinned assets from the `main` branch.
- **No Curl-Pipe-Shell**: Do not execute unverified payloads directly using `curl ... | sh` or similar pipes.
- **No Privilege Escalation**: Do not request or execute commands with `sudo` or elevated privileges.
- **No Sandbox/Approval Bypass**: Do not use flags or mechanisms designed to bypass user approval or OS sandbox restrictions.
- **No Application Modification**: Do not modify ChatGPT.app, Codex.app, or any official application bundles/atlas files.
- **No Unchecked Archive Execution**: The bootstrap script compares the versioned Release tarball (`pet-pomodoro-for-codex-v0.1.0.tar.gz`) with its `SHA256SUMS` before installer execution. This is an integrity check against mismatches, not an independent signature.

## Rollback Behavior
- If any stage of the verification or execution fails, the installation will halt safely.
- Any rollback of the target installation state is managed internally by the packaged `scripts/install.sh`.
