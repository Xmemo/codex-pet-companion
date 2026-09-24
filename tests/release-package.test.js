const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const child_process = require('child_process');

test('release package script produces valid release archive and checksum', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'release-package-test-'));
  const distDir = path.join(tempRoot, 'dist');
  const repoRoot = path.resolve(__dirname, '..');

  try {
    const result = child_process.spawnSync('/bin/zsh', ['scripts/package-release.sh', 'v0.1.0'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PACKAGE_RELEASE_REF: 'HEAD',
        DIST_DIR: distDir
      },
      encoding: 'utf8'
    });

    assert.strictEqual(result.status, 0, `Script failed: ${result.stderr}`);

    const files = fs.readdirSync(distDir).sort();
    assert.deepStrictEqual(files, ['SHA256SUMS', 'pet-pomodoro-for-codex-v0.1.0.tar.gz']);

    const checksumPath = path.join(distDir, 'SHA256SUMS');
    const shaContent = fs.readFileSync(checksumPath, 'utf8');
    const lines = shaContent.trim().split('\n');
    assert.strictEqual(lines.length, 1, 'Checksum file must contain exactly one line');

    const [expectedHash, tarballName] = lines[0].split(/\s+/);
    assert.strictEqual(tarballName, 'pet-pomodoro-for-codex-v0.1.0.tar.gz');

    const tarballPath = path.join(distDir, 'pet-pomodoro-for-codex-v0.1.0.tar.gz');
    const tarballBuffer = fs.readFileSync(tarballPath);
    const actualHash = crypto.createHash('sha256').update(tarballBuffer).digest('hex');
    assert.strictEqual(actualHash, expectedHash, 'SHA256 checksum does not match tarball content');

    const tarOutput = child_process.execFileSync('/usr/bin/tar', ['-tzf', tarballPath], {
      encoding: 'utf8'
    });
    const entries = tarOutput.split('\n').map((e) => e.trim()).filter((e) => e.length > 0);

    assert.ok(entries.length > 0, 'Tarball should contain entries');

    for (const entry of entries) {
      assert.ok(
        entry.startsWith('pet-pomodoro-for-codex-v0.1.0/'),
        `Entry ${entry} does not start with pet-pomodoro-for-codex-v0.1.0/`
      );
      assert.strictEqual(entry.includes('/.git/'), false, `Entry ${entry} contains /.git/`);
      assert.strictEqual(entry.includes('/.specify/'), false, `Entry ${entry} contains /.specify/`);
      assert.strictEqual(entry.includes('/specs/'), false, `Entry ${entry} contains /specs/`);
      assert.strictEqual(entry.includes('/dist/'), false, `Entry ${entry} contains /dist/`);
      assert.strictEqual(entry.includes('/private-assets/'), false, `Entry ${entry} contains /private-assets/`);
      assert.strictEqual(entry.includes('/companion-build/'), false, `Entry ${entry} contains /companion-build/`);
      assert.strictEqual(entry.endsWith('/companion_renderer'), false, `Entry ${entry} ends with /companion_renderer`);
    }

    const hasDataAndAiAnalysis = entries.includes('pet-pomodoro-for-codex-v0.1.0/docs/data-and-ai-analysis.md');
    const hasResearch = entries.some((e) => e.startsWith('pet-pomodoro-for-codex-v0.1.0/docs/research/'));
    assert.ok(hasDataAndAiAnalysis, 'Archive should contain docs/data-and-ai-analysis.md');
    assert.ok(hasResearch, 'Archive should contain docs/research/');

    const hasContract = entries.includes('pet-pomodoro-for-codex-v0.1.0/INSTALL_WITH_CODEX.md');
    const hasBootstrap = entries.includes('pet-pomodoro-for-codex-v0.1.0/scripts/bootstrap.sh');
    assert.ok(hasContract, 'Archive should contain INSTALL_WITH_CODEX.md');
    assert.ok(hasBootstrap, 'Archive should contain scripts/bootstrap.sh');

    // Extract the archive to check files and executable bit
    const extractDir = path.join(tempRoot, 'extracted');
    fs.mkdirSync(extractDir);
    child_process.execFileSync('/usr/bin/tar', ['-xzf', tarballPath, '-C', extractDir]);

    const extractedPrefix = 'pet-pomodoro-for-codex-v0.1.0';
    const contractPath = path.join(extractDir, extractedPrefix, 'INSTALL_WITH_CODEX.md');
    const bootstrapPath = path.join(extractDir, extractedPrefix, 'scripts/bootstrap.sh');

    assert.ok(fs.existsSync(contractPath), 'Extracted archive should contain INSTALL_WITH_CODEX.md');
    assert.ok(fs.existsSync(bootstrapPath), 'Extracted archive should contain scripts/bootstrap.sh');

    const bootstrapStat = fs.statSync(bootstrapPath);
    const hasExecutableBit = (bootstrapStat.mode & (fs.constants.S_IXUSR | fs.constants.S_IXGRP | fs.constants.S_IXOTH)) !== 0;
    assert.ok(hasExecutableBit, 'scripts/bootstrap.sh should have at least one executable bit');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
