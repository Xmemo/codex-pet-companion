#!/usr/bin/env zsh
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 vMAJOR.MINOR.PATCH" >&2
  exit 1
fi

VERSION="$1"

if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version argument must be in format vMAJOR.MINOR.PATCH (e.g. v1.0.0)" >&2
  exit 1
fi

PACKAGE_RELEASE_REF="${PACKAGE_RELEASE_REF:-$VERSION}"

if ! TARGET_COMMIT="$(git rev-parse --verify --quiet "${PACKAGE_RELEASE_REF}^{commit}")"; then
  echo "Error: PACKAGE_RELEASE_REF '${PACKAGE_RELEASE_REF}' cannot be resolved by git rev-parse." >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
DIST_DIR="${DIST_DIR:-${REPO_ROOT}/dist}"

mkdir -p "${DIST_DIR}"

ALLOWLIST=(
  .github
  bin
  docs/contracts
  docs/launch
  docs/data-and-ai-analysis.md
  docs/research
  examples
  packaging
  scripts
  src
  tests
  .gitignore
  README.md
  README.zh-CN.md
  CHANGELOG.md
  CODE_OF_CONDUCT.md
  CONTRIBUTING.md
  LICENSE
  SECURITY.md
  SUPPORT.md
  pyproject.toml
  uv.lock
  INSTALL_WITH_CODEX.md
)

MISSING_PATHS=()
for item in "${ALLOWLIST[@]}"; do
  if ! git rev-parse --verify --quiet "${TARGET_COMMIT}:${item}" >/dev/null 2>&1; then
    MISSING_PATHS+=("$item")
  fi
done

if [[ ${#MISSING_PATHS[@]} -gt 0 ]]; then
  echo "Error: Missing required allowlisted path(s) in release ref '${PACKAGE_RELEASE_REF}': ${MISSING_PATHS[*]}" >&2
  exit 1
fi

PREFIX="pet-pomodoro-for-codex-${VERSION}/"
TARBALL_NAME="pet-pomodoro-for-codex-${VERSION}.tar.gz"
TARBALL_PATH="${DIST_DIR}/${TARBALL_NAME}"
SHA_PATH="${DIST_DIR}/SHA256SUMS"

TEMP_TARBALL="$(mktemp "${DIST_DIR}/${TARBALL_NAME}.tmp.XXXXXX")"
TEMP_SHA="$(mktemp "${DIST_DIR}/SHA256SUMS.tmp.XXXXXX")"

cleanup() {
  rm -f "${TEMP_TARBALL:-}" "${TEMP_SHA:-}"
}
trap cleanup EXIT INT TERM HUP

# Generate deterministic tar.gz archive
git archive --format=tar --prefix="${PREFIX}" "${TARGET_COMMIT}" "${ALLOWLIST[@]}" | gzip -n > "${TEMP_TARBALL}"

# Calculate SHA256 checksum (basename only)
if command -v sha256sum >/dev/null 2>&1; then
  HASH="$(sha256sum "${TEMP_TARBALL}" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  HASH="$(shasum -a 256 "${TEMP_TARBALL}" | awk '{print $1}')"
elif command -v openssl >/dev/null 2>&1; then
  HASH="$(openssl dgst -sha256 "${TEMP_TARBALL}" | awk '{print $NF}')"
else
  echo "Error: No SHA256 utility found." >&2
  exit 1
fi

CHECKSUM_LINE="${HASH}  ${TARBALL_NAME}"
echo "${CHECKSUM_LINE}" > "${TEMP_SHA}"

mv "${TEMP_TARBALL}" "${TARBALL_PATH}"
mv "${TEMP_SHA}" "${SHA_PATH}"

echo "${TARBALL_PATH}"
echo "${SHA_PATH}"
