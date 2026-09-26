# Open Source Launch Checklist

The first launch covers GitHub, V2EX, X, and Reddit only.

## Copy

- [x] Shared product positioning
- [x] GitHub Release draft
- [x] V2EX draft
- [x] X thread
- [x] Reddit post
- [x] Scientific claims include evidence limits
- [x] Local records and user-directed AI analysis are described accurately
- [x] Unofficial status, macOS-only support, source installation, and asset boundaries are explicit

## Optional Visual Assets

The source launch does not require a GIF or screenshot. Capture only with a clean desktop and user approval; never package extracted built-in pet assets.

- [ ] Record a 15-30 second demo GIF with a default Codex pet
- [ ] Capture collapsed tomato panel
- [ ] Capture expanded timer controls
- [ ] Capture fullscreen pet rest state
- [ ] Create a 1280x640 social preview
- [ ] Confirm no private text, notifications, paths, account data, or OpenAI logo is visible
- [ ] Confirm no extracted built-in pet asset is committed or packaged

## Release

- [x] Replace launch-copy URL placeholders; omit demo links until a real demo exists
- [ ] Install and uninstall from the packaged archive
- [x] Verify all six expanded controls are clickable (user-confirmed on 2026-09-24)
- [ ] Verify one custom pet and two built-in pets
- [ ] Run complete tests, privacy scan, package scan, and ChatGPT.app integrity check
- [ ] Confirm GitHub Actions is green
- [ ] For a future release, create a new version tag; `.github/workflows/release.yml` builds the archive, attests its provenance, and publishes the archive plus `SHA256SUMS`
- [ ] Make the repository public only after every gate above passes
