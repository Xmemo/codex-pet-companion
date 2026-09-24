const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const {
  SCHEMA_VERSION,
  WORKER_MARKER,
  getProcessStartTime,
  getProcessUid,
  getProcessCommand,
  computeScriptHash,
  computeArgvHash,
  getCurrentUid,
  buildIdentity,
  verifyIdentity,
  safeSignal,
  ownerCleanup,
} = require('../src/companion/process-identity.js');

const WORKER_SCRIPT = '/tmp/worker.js';
const WORKER_ARG0 = path.resolve(WORKER_SCRIPT);
const WORKER_ARGV = [WORKER_ARG0, WORKER_MARKER, 'arg1', 'arg2'];
const SCRIPT_CONTENT = 'mock script content';
const SCRIPT_HASH = crypto.createHash('sha256').update(SCRIPT_CONTENT).digest('hex');
const ARGV_HASH = computeArgvHash(WORKER_ARGV);
const LSTART = 'Mon Jul 20 12:00:00 2026';
const UID = 501;
const COMMAND = `/usr/bin/node ${WORKER_ARGV.join(' ')}`;

function makeMockDeps(overrides = {}) {
  const basePs = (pid, field) => {
    if (field === 'lstart') return LSTART;
    if (field === 'uid') return String(UID);
    if (field === 'command') return COMMAND;
    return '';
  };
  const ps = overrides.ps || basePs;
  return {
    psExec: (cmd, args) => {
      assert.ok(args.includes('-ww'), 'ps query must include -ww to avoid truncation');
      const pidArg = args[1];
      const field = args[args.length - 1];
      return ps(pidArg, field.replace('=', ''));
    },
    fs: {
      ...fs,
      readFileSync: (p) => (overrides.fsReadFileSync ? overrides.fsReadFileSync(p) : Buffer.from(SCRIPT_CONTENT)),
      existsSync: (p) => (overrides.fsExistsSync ? overrides.fsExistsSync(p) : fs.existsSync(p)),
      unlinkSync: (p) => (overrides.fsUnlinkSync ? overrides.fsUnlinkSync(p) : fs.unlinkSync(p)),
    },
    getuid: overrides.getuid,
    currentPid: overrides.currentPid,
    kill: overrides.kill,
  };
}

function makeBaseline(pid = 42) {
  return {
    schemaVersion: SCHEMA_VERSION,
    pid,
    uid: UID,
    processStartToken: LSTART,
    scriptPath: WORKER_ARG0,
    scriptHash: SCRIPT_HASH,
    argv: WORKER_ARGV.slice(),
    argvHash: ARGV_HASH,
    processCommand: COMMAND,
  };
}

test('T001: SCHEMA_VERSION is 1', () => {
  assert.strictEqual(SCHEMA_VERSION, 1);
});

test('T002: buildIdentity produces a fully valid baseline', () => {
  const deps = makeMockDeps({ getuid: () => UID });
  const identity = buildIdentity({ pid: 42, scriptPath: WORKER_SCRIPT, argv: WORKER_ARGV }, deps);

  assert.strictEqual(identity.schemaVersion, SCHEMA_VERSION);
  assert.strictEqual(identity.pid, 42);
  assert.strictEqual(identity.uid, UID);
  assert.strictEqual(identity.processStartToken, LSTART);
  assert.strictEqual(identity.scriptPath, WORKER_ARG0);
  assert.strictEqual(identity.scriptHash, SCRIPT_HASH);
  assert.deepStrictEqual(identity.argv, WORKER_ARGV);
  assert.strictEqual(identity.argvHash, ARGV_HASH);
  assert.strictEqual(identity.processCommand, COMMAND);
});

test('T002b: buildIdentity clones canonical argv so caller mutation cannot corrupt identity', () => {
  const deps = makeMockDeps({ getuid: () => UID });
  const inputArgv = WORKER_ARGV.slice();
  const identity = buildIdentity({ pid: 42, scriptPath: WORKER_SCRIPT, argv: inputArgv }, deps);
  inputArgv.push('mutated');
  assert.deepStrictEqual(identity.argv, WORKER_ARGV);
  assert.notStrictEqual(identity.argv, inputArgv);
});

test('T003: buildIdentity rejects relative (non-absolute) scriptPath before resolution', () => {
  const deps = makeMockDeps({ getuid: () => UID });
  assert.throws(() => buildIdentity({ pid: 42, scriptPath: 'relative.js', argv: WORKER_ARGV }, deps));
  assert.throws(() => buildIdentity({ pid: 42, scriptPath: 123, argv: WORKER_ARGV }, deps));
});

test('T003b: buildIdentity rejects ps command for unrelated script even with valid lstart/uid', () => {
  const deps = makeMockDeps({
    getuid: () => UID,
    ps: (pid, field) => {
      if (field === 'lstart') return LSTART;
      if (field === 'uid') return String(UID);
      if (field === 'command') return '/usr/bin/node /tmp/other-script.js --worker arg1';
      return '';
    },
  });
  assert.throws(() => buildIdentity({ pid: 42, scriptPath: WORKER_SCRIPT, argv: WORKER_ARGV }, deps));
});

test('T004: buildIdentity rejects argv that omits the script', () => {
  const deps = makeMockDeps({ getuid: () => UID });
  assert.throws(() => buildIdentity({ pid: 42, scriptPath: WORKER_SCRIPT, argv: [WORKER_MARKER, 'x'] }, deps));
});

test('T005: buildIdentity rejects argv without worker marker', () => {
  const deps = makeMockDeps({ getuid: () => UID });
  assert.throws(() => buildIdentity({ pid: 42, scriptPath: WORKER_SCRIPT, argv: [WORKER_ARG0, 'x'] }, deps));
});

test('T006: buildIdentity rejects invalid pid', () => {
  const deps = makeMockDeps({ getuid: () => UID });
  assert.throws(() => buildIdentity({ pid: 0, scriptPath: WORKER_SCRIPT, argv: WORKER_ARGV }, deps));
});

test('T007: buildIdentity fails when ps lstart unavailable', () => {
  const deps = makeMockDeps({ ps: () => '', getuid: () => UID });
  assert.throws(() => buildIdentity({ pid: 42, scriptPath: WORKER_SCRIPT, argv: WORKER_ARGV }, deps));
});

test('T008: buildIdentity fails when ps uid unavailable', () => {
  const deps = makeMockDeps({
    ps: (pid, field) => (field === 'lstart' ? LSTART : ''),
    getuid: () => UID,
  });
  assert.throws(() => buildIdentity({ pid: 42, scriptPath: WORKER_SCRIPT, argv: WORKER_ARGV }, deps));
});

test('T009: buildIdentity fails when ps command unavailable', () => {
  const deps = makeMockDeps({
    ps: (pid, field) => (field === 'command' ? '' : field === 'lstart' ? LSTART : String(UID)),
    getuid: () => UID,
  });
  assert.throws(() => buildIdentity({ pid: 42, scriptPath: WORKER_SCRIPT, argv: WORKER_ARGV }, deps));
});

test('T010: buildIdentity fails when own uid differs from process uid', () => {
  const deps = makeMockDeps({ getuid: () => 999 });
  assert.throws(() => buildIdentity({ pid: 42, scriptPath: WORKER_SCRIPT, argv: WORKER_ARGV }, deps));
});

test('T011: buildIdentity fails when script unreadable', () => {
  const deps = makeMockDeps({
    getuid: () => UID,
    fsReadFileSync: () => { throw new Error('ENOENT'); },
  });
  assert.throws(() => buildIdentity({ pid: 42, scriptPath: WORKER_SCRIPT, argv: WORKER_ARGV }, deps));
});

test('T012: verifyIdentity valid when baseline matches live evidence', () => {
  const deps = makeMockDeps();
  const result = verifyIdentity(makeBaseline(), deps);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.pid, 42);
});

test('T013: verifyIdentity fails on malformed (not object)', () => {
  const deps = makeMockDeps();
  const result = verifyIdentity(null, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('malformed: identity is not an object'));
});

test('T014: verifyIdentity fails on schema mismatch', () => {
  const deps = makeMockDeps();
  const baseline = makeBaseline();
  baseline.schemaVersion = 999;
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('schema mismatch'));
});

test('T015: verifyIdentity fails on missing field', () => {
  const deps = makeMockDeps();
  const baseline = makeBaseline();
  delete baseline.argv;
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('malformed: missing field'));
});

test('T016: verifyIdentity fails on invalid pid', () => {
  const deps = makeMockDeps();
  const baseline = makeBaseline(-1);
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('malformed: invalid pid'));
});

test('T017: verifyIdentity fails on invalid uid', () => {
  const deps = makeMockDeps();
  const baseline = makeBaseline();
  baseline.uid = 'abc';
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('malformed: invalid uid'));
});

test('T018: verifyIdentity fails on empty lstart', () => {
  const deps = makeMockDeps();
  const baseline = makeBaseline();
  baseline.processStartToken = '';
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('empty processStartToken'));
});

test('T019: verifyIdentity fails on non-absolute scriptPath', () => {
  const deps = makeMockDeps();
  const baseline = makeBaseline();
  baseline.scriptPath = 'relative.js';
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('scriptPath must be absolute'));
});

test('T020: verifyIdentity fails on bad scriptHash (not 64 hex)', () => {
  const deps = makeMockDeps();
  const baseline = makeBaseline();
  baseline.scriptHash = 'xyz';
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('scriptHash must be 64 hex'));
});

test('T021: verifyIdentity fails on bad argvHash (not 64 hex)', () => {
  const deps = makeMockDeps();
  const baseline = makeBaseline();
  baseline.argvHash = 'xyz';
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('argvHash must be 64 hex'));
});

test('T022: verifyIdentity fails on non-canonical argv', () => {
  const deps = makeMockDeps();
  const baseline = makeBaseline();
  baseline.argv = ['x', ''];
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('argv must be nonempty array'));
});

test('T023: verifyIdentity fails when argv does not identify script', () => {
  const deps = makeMockDeps();
  const baseline = makeBaseline();
  baseline.argv = ['/tmp/other.js', WORKER_MARKER, 'x'];
  baseline.argvHash = computeArgvHash(baseline.argv);
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('argv does not identify the script'));
});

test('T024: verifyIdentity fails when argv lacks worker marker', () => {
  const deps = makeMockDeps();
  const baseline = makeBaseline();
  baseline.argv = [WORKER_ARG0, 'x'];
  baseline.argvHash = computeArgvHash(baseline.argv);
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('internal worker command'));
});

test('T024b: verifyIdentity rejects self-consistent identity whose processCommand omits claimed script (before live ps)', () => {
  const deps = makeMockDeps();
  const baseline = makeBaseline();
  baseline.processCommand = '/usr/bin/node /tmp/other-script.js --worker arg1 arg2';
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('processCommand does not reference the claimed script'));
});

test('T024c: verifyIdentity rejects self-consistent identity whose processCommand omits worker marker (before live ps)', () => {
  const deps = makeMockDeps();
  const baseline = makeBaseline();
  baseline.processCommand = `/usr/bin/node ${WORKER_ARG0} arg1 arg2`;
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('processCommand does not include the internal worker command'));
});

test('T024d: verifyIdentity rejects identity matching live ps command but command omits claimed script', () => {
  const deps = makeMockDeps({
    ps: (pid, field) => {
      if (field === 'lstart') return LSTART;
      if (field === 'uid') return String(UID);
      if (field === 'command') return '/usr/bin/node /tmp/other-script.js --worker arg1 arg2';
      return '';
    },
  });
  const baseline = makeBaseline();
  baseline.processCommand = '/usr/bin/node /tmp/other-script.js --worker arg1 arg2';
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('processCommand does not reference the claimed script'));
});

test('T025: verifyIdentity fails on dead process (no lstart)', () => {
  const deps = makeMockDeps({ ps: () => '' });
  const result = verifyIdentity(makeBaseline(), deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('dead: process not found'));
});

test('T026: verifyIdentity fails on PID reuse (lstart mismatch)', () => {
  const deps = makeMockDeps({
    ps: (pid, field) => {
      if (field === 'lstart') return 'Mon Jul 20 13:00:00 2026';
      if (field === 'uid') return String(UID);
      if (field === 'command') return COMMAND;
      return '';
    },
  });
  const result = verifyIdentity(makeBaseline(), deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('reused: process start token mismatch'));
});

test('T027: verifyIdentity fails on uid mismatch', () => {
  const deps = makeMockDeps({
    ps: (pid, field) => {
      if (field === 'lstart') return LSTART;
      if (field === 'uid') return '502';
      if (field === 'command') return COMMAND;
      return '';
    },
  });
  const result = verifyIdentity(makeBaseline(), deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('uid mismatch'));
});

test('T028: verifyIdentity fails on command mismatch', () => {
  const deps = makeMockDeps({
    ps: (pid, field) => {
      if (field === 'lstart') return LSTART;
      if (field === 'uid') return String(UID);
      if (field === 'command') return '/usr/bin/node /tmp/other.js';
      return '';
    },
  });
  const result = verifyIdentity(makeBaseline(), deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('command mismatch'));
});

test('T029: verifyIdentity fails on argv hash mismatch', () => {
  const deps = makeMockDeps();
  const baseline = makeBaseline();
  baseline.argvHash = computeArgvHash([WORKER_ARG0, WORKER_MARKER, 'changed']);
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('argv hash mismatch'));
});

test('T030: verifyIdentity fails on script hash mismatch', () => {
  const deps = makeMockDeps({ fsReadFileSync: () => Buffer.from('different') });
  const result = verifyIdentity(makeBaseline(), deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('script hash mismatch'));
});

test('T031: verifyIdentity fails on unreadable script path', () => {
  const deps = makeMockDeps({ fsReadFileSync: () => { throw new Error('ENOENT'); } });
  const result = verifyIdentity(makeBaseline(), deps);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('script path not readable'));
});

test('T032: verifyIdentity has no age expiry (old lstart still valid with matching evidence)', () => {
  const deps = makeMockDeps({
    ps: (pid, field) => {
      if (field === 'lstart') return 'Mon Jul 20 12:00:00 2000';
      if (field === 'uid') return String(UID);
      if (field === 'command') return COMMAND;
      return '';
    },
    fsReadFileSync: () => Buffer.from(SCRIPT_CONTENT),
  });
  const baseline = makeBaseline();
  baseline.processStartToken = 'Mon Jul 20 12:00:00 2000';
  const result = verifyIdentity(baseline, deps);
  assert.strictEqual(result.valid, true);
});

test('T033: safeSignal calls injected kill after full verification', () => {
  let killCalled = false;
  let killPid = null;
  let killSignal = null;
  const deps = makeMockDeps({
    kill: (pid, sig) => { killCalled = true; killPid = pid; killSignal = sig; },
  });
  const result = safeSignal(makeBaseline(), 'SIGTERM', deps);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(killCalled, true);
  assert.strictEqual(killPid, 42);
  assert.strictEqual(killSignal, 'SIGTERM');
});

test('T034: safeSignal denies without calling kill when verification fails', () => {
  let killCalled = false;
  const deps = makeMockDeps({ ps: () => '', kill: () => { killCalled = true; } });
  const result = safeSignal(makeBaseline(), 'SIGTERM', deps);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(killCalled, false);
});

test('T034b: safeSignal returns ok false when injected kill throws', () => {
  const deps = makeMockDeps({
    kill: () => { throw new Error('ESRCH'); },
  });
  const result = safeSignal(makeBaseline(), 'SIGTERM', deps);
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('ESRCH'));
});

test('T035: ownerCleanup unlinks pid file when verified pid equals injected currentPid', () => {
  let unlinked = null;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pid-test-'));
  const pidFile = path.join(tempDir, 'test.pid');
  const deps = makeMockDeps({
    currentPid: 42,
    fsExistsSync: (p) => p === pidFile,
    fsUnlinkSync: (p) => { unlinked = p; },
  });
  const result = ownerCleanup(makeBaseline(), pidFile, deps);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(unlinked, pidFile);
});

test('T036: ownerCleanup denies when verified pid differs from currentPid', () => {
  let unlinked = false;
  const deps = makeMockDeps({
    currentPid: 9999,
    fsUnlinkSync: () => { unlinked = true; },
  });
  const result = ownerCleanup(makeBaseline(), '/tmp/x.pid', deps);
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('not owner: pid mismatch'));
  assert.strictEqual(unlinked, false);
});

test('T037: ownerCleanup denies when verification fails', () => {
  let unlinked = false;
  const deps = makeMockDeps({ ps: () => '', currentPid: 42, fsUnlinkSync: () => { unlinked = true; } });
  const result = ownerCleanup(makeBaseline(), '/tmp/x.pid', deps);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(unlinked, false);
});

test('T038: computeScriptHash computes SHA256 correctly', () => {
  const testContent = 'test script content';
  const hash = computeScriptHash('/tmp/test.js', { readFileSync: () => Buffer.from(testContent) });
  assert.strictEqual(hash, crypto.createHash('sha256').update(testContent).digest('hex'));
});

test('T039: computeArgvHash computes SHA256 of JSON.stringify(argv)', () => {
  const argv = ['script.js', 'arg1', 'arg2'];
  const hash = computeArgvHash(argv);
  assert.strictEqual(hash, crypto.createHash('sha256').update(JSON.stringify(argv)).digest('hex'));
});

test('T040: getCurrentUid uses injected getuid or falls back to process.getuid', () => {
  assert.strictEqual(getCurrentUid(() => 1234), 1234);
  const fallback = getCurrentUid(null);
  assert.strictEqual(typeof fallback, 'number');
});

test('T041: WORKER_MARKER constant is the internal worker command', () => {
  assert.strictEqual(WORKER_MARKER, '--worker');
});

test('T042: safeSignal unit tests never signal real processes (all use mock kill)', () => {
  let realKillCalled = false;
  const originalKill = process.kill;
  process.kill = () => { realKillCalled = true; };

  const deps = makeMockDeps({
    ps: () => '',
    kill: () => {},
  });
  safeSignal(makeBaseline(), 'SIGTERM', deps);

  process.kill = originalKill;
  assert.strictEqual(realKillCalled, false, 'Real process.kill should never be called in tests');
});

test('T043: real child-process smoke verifies identity and readiness token without renderer or HOME', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-identity-smoke-'));
  const workerPath = path.join(tempDir, 'worker-smoke.js');
  const readyPath = path.join(tempDir, 'ready.json');
  const token = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(workerPath, `
const fs = require('fs');
const token = process.argv[process.argv.indexOf('--ready-token') + 1];
const readyPath = process.argv[process.argv.indexOf('--ready-path') + 1];
fs.writeFileSync(readyPath, JSON.stringify({ ready: true, token, pid: process.pid }) + '\\n');
setInterval(() => {}, 1000);
`);

  const argv = [workerPath, WORKER_MARKER, '--ready-token', token, '--ready-path', readyPath];
  const child = spawn(process.execPath, argv, {
    cwd: tempDir,
    detached: false,
    stdio: 'ignore',
    env: { PATH: process.env.PATH || '' },
  });

  try {
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(readyPath) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(fs.existsSync(readyPath), 'child wrote readiness JSON');
    const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
    assert.strictEqual(ready.ready, true);
    assert.strictEqual(ready.token, token);
    assert.strictEqual(ready.pid, child.pid);

    const built = buildIdentity(
      { pid: child.pid, scriptPath: workerPath, argv },
      { fs, getuid: () => (process.getuid ? process.getuid() : 0) }
    );
    const verified = verifyIdentity(built, { fs });
    assert.strictEqual(verified.valid, true);
    assert.strictEqual(verified.pid, child.pid);
  } finally {
    try { child.kill('SIGTERM'); } catch (_) {}
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
