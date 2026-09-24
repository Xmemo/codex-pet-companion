## Summary

Describe the user-visible or engineering change in one paragraph.

## Scope

- What this PR changes:
- What this PR intentionally does not change:

## Verification

- [ ] Node tests pass
- [ ] Python tests pass
- [ ] Swift typecheck passes
- [ ] Shell / plist checks pass when relevant
- [ ] `git diff --check` passes

### UI / interaction changes only

- [ ] Verified on a real macOS session, not only by screenshot
- [ ] First mouse / hit testing works for floating controls
- [ ] Expected command reaches the timer/companion bridge
- [ ] State transition is observable
- [ ] Accepted deployment commit / recovery point is recorded when appropriate

## Privacy / asset boundary

- [ ] No credentials, private runtime data, user-specific paths, or proprietary pet assets are included
- [ ] No new mandatory network dependency or telemetry is introduced

## Product boundary

Explain how the change supports the core focus → recovery-boundary → return workflow. If it adds agent monitoring, gamification, cloud profiles, generic chat, or unrelated productivity features, explain why that scope change is necessary.
