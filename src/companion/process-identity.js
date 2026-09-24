const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SCHEMA_VERSION = 1;
const HASH_RE = /^[0-9a-f]{64}$/;
const WORKER_MARKER = '--worker';

function getProcessStartTime(pid, psExec) {
  const exec = psExec || execFileSync;
  try {
    const out = exec('/bin/ps', ['-p', String(pid), '-ww', '-o', 'lstart='], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim();
  } catch (_) {
    return null;
  }
}

function getProcessUid(pid, psExec) {
  const exec = psExec || execFileSync;
  try {
    const out = exec('/bin/ps', ['-p', String(pid), '-ww', '-o', 'uid='], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const uid = parseInt(out.trim(), 10);
    return isNaN(uid) ? null : uid;
  } catch (_) {
    return null;
  }
}

function getProcessCommand(pid, psExec) {
  const exec = psExec || execFileSync;
  try {
    const out = exec('/bin/ps', ['-p', String(pid), '-ww', '-o', 'command='], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim();
  } catch (_) {
    return null;
  }
}

function computeScriptHash(scriptPath, fsModule) {
  const fsMod = fsModule || fs;
  const data = fsMod.readFileSync(scriptPath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function computeArgvHash(argv) {
  return crypto.createHash('sha256').update(JSON.stringify(argv)).digest('hex');
}

function getCurrentUid(getuidFn) {
  const getuid = getuidFn || (process.getuid ? process.getuid.bind(process) : () => 0);
  return getuid();
}

function isCanonicalArgv(argv) {
  if (!Array.isArray(argv)) return false;
  if (argv.length === 0) return false;
  return argv.every((a) => typeof a === 'string' && a.length > 0);
}

function buildIdentity(workerFacts, deps) {
  const deps_ = deps || {};
  const fsMod = deps_.fs || fs;
  const psExec = deps_.psExec || execFileSync;
  const getuidFn = deps_.getuid;

  const { pid, scriptPath, argv } = workerFacts;

  if (typeof pid !== 'number' || pid <= 0) {
    throw new Error('buildIdentity: invalid pid');
  }
  if (typeof scriptPath !== 'string' || !path.isAbsolute(scriptPath)) {
    throw new Error('buildIdentity: scriptPath must be an absolute path');
  }
  const resolvedScriptPath = path.resolve(scriptPath);
  if (!isCanonicalArgv(argv)) {
    throw new Error('buildIdentity: argv must be a nonempty array of nonempty strings');
  }
  if (!argv.includes(resolvedScriptPath)) {
    throw new Error('buildIdentity: argv must identify the script');
  }
  if (!argv.includes(WORKER_MARKER)) {
    throw new Error('buildIdentity: argv must include the internal worker command');
  }

  const startToken = getProcessStartTime(pid, psExec);
  if (!startToken) {
    throw new Error('buildIdentity: cannot read process lstart');
  }

  const actualUid = getProcessUid(pid, psExec);
  if (actualUid === null) {
    throw new Error('buildIdentity: cannot read process uid');
  }

  const currentUid = getCurrentUid(getuidFn);
  if (typeof currentUid === 'number' && currentUid !== actualUid) {
    throw new Error('buildIdentity: supplied/own uid does not match process uid');
  }

  const fullCommand = getProcessCommand(pid, psExec);
  if (!fullCommand) {
    throw new Error('buildIdentity: cannot read process command');
  }
  if (!fullCommand.includes(resolvedScriptPath)) {
    throw new Error('buildIdentity: process command does not reference the claimed script');
  }
  if (!fullCommand.includes(WORKER_MARKER)) {
    throw new Error('buildIdentity: process command does not include the internal worker command');
  }

  let scriptHash;
  try {
    scriptHash = computeScriptHash(resolvedScriptPath, fsMod);
  } catch (_) {
    throw new Error('buildIdentity: script path not readable');
  }
  const argvHash = computeArgvHash(argv);
  const storedArgv = argv.slice();

  return {
    schemaVersion: SCHEMA_VERSION,
    pid,
    uid: actualUid,
    processStartToken: startToken,
    scriptPath: resolvedScriptPath,
    scriptHash,
    argv: storedArgv,
    argvHash,
    processCommand: fullCommand,
  };
}

function verifyIdentity(identity, deps) {
  const deps_ = deps || {};
  const fsMod = deps_.fs || fs;
  const psExec = deps_.psExec || execFileSync;
  const getuidFn = deps_.getuid;

  if (!identity || typeof identity !== 'object') {
    return { valid: false, reason: 'malformed: identity is not an object' };
  }

  if (identity.schemaVersion !== SCHEMA_VERSION) {
    return { valid: false, reason: `schema mismatch: expected ${SCHEMA_VERSION}, got ${identity.schemaVersion}` };
  }

  const requiredFields = ['pid', 'uid', 'processStartToken', 'scriptPath', 'scriptHash', 'argv', 'argvHash', 'processCommand'];
  for (const field of requiredFields) {
    if (!(field in identity)) {
      return { valid: false, reason: `malformed: missing field ${field}` };
    }
  }

  const pid = identity.pid;
  if (typeof pid !== 'number' || pid <= 0) {
    return { valid: false, reason: 'malformed: invalid pid' };
  }
  const uid = identity.uid;
  if (typeof uid !== 'number' || uid < 0) {
    return { valid: false, reason: 'malformed: invalid uid' };
  }
  if (typeof identity.processStartToken !== 'string' || identity.processStartToken.length === 0) {
    return { valid: false, reason: 'malformed: empty processStartToken' };
  }
  if (typeof identity.processCommand !== 'string' || identity.processCommand.length === 0) {
    return { valid: false, reason: 'malformed: empty processCommand' };
  }
  if (typeof identity.scriptPath !== 'string' || !path.isAbsolute(identity.scriptPath)) {
    return { valid: false, reason: 'malformed: scriptPath must be absolute' };
  }
  if (typeof identity.scriptHash !== 'string' || !HASH_RE.test(identity.scriptHash)) {
    return { valid: false, reason: 'malformed: scriptHash must be 64 hex' };
  }
  if (typeof identity.argvHash !== 'string' || !HASH_RE.test(identity.argvHash)) {
    return { valid: false, reason: 'malformed: argvHash must be 64 hex' };
  }
  if (!isCanonicalArgv(identity.argv)) {
    return { valid: false, reason: 'malformed: argv must be nonempty array of nonempty strings' };
  }
  if (!identity.argv.includes(identity.scriptPath)) {
    return { valid: false, reason: 'malformed: argv does not identify the script' };
  }
  if (!identity.argv.includes(WORKER_MARKER)) {
    return { valid: false, reason: 'malformed: argv does not include the internal worker command' };
  }
  if (typeof identity.processCommand !== 'string' || !identity.processCommand.includes(identity.scriptPath)) {
    return { valid: false, reason: 'malformed: processCommand does not reference the claimed script' };
  }
  if (!identity.processCommand.includes(WORKER_MARKER)) {
    return { valid: false, reason: 'malformed: processCommand does not include the internal worker command' };
  }

  const actualStartToken = getProcessStartTime(pid, psExec);
  if (!actualStartToken) {
    return { valid: false, reason: 'dead: process not found' };
  }
  if (actualStartToken !== identity.processStartToken) {
    return { valid: false, reason: 'reused: process start token mismatch' };
  }

  const actualUid = getProcessUid(pid, psExec);
  if (actualUid === null) {
    return { valid: false, reason: 'dead: uid not found' };
  }
  if (actualUid !== identity.uid) {
    return { valid: false, reason: `uid mismatch: expected ${identity.uid}, got ${actualUid}` };
  }

  const actualCommand = getProcessCommand(pid, psExec);
  if (!actualCommand) {
    return { valid: false, reason: 'dead: command not found' };
  }
  if (actualCommand !== identity.processCommand) {
    return { valid: false, reason: 'command mismatch' };
  }

  const actualArgvHash = computeArgvHash(identity.argv);
  if (actualArgvHash !== identity.argvHash) {
    return { valid: false, reason: 'argv hash mismatch' };
  }

  let actualScriptHash;
  try {
    actualScriptHash = computeScriptHash(identity.scriptPath, fsMod);
  } catch (_) {
    return { valid: false, reason: 'script path not readable' };
  }
  if (actualScriptHash !== identity.scriptHash) {
    return { valid: false, reason: 'script hash mismatch' };
  }

  return { valid: true, pid };
}

function safeSignal(identity, signal, deps) {
  const deps_ = deps || {};
  const killFn = deps_.kill || process.kill;

  const verification = verifyIdentity(identity, deps_);
  if (!verification.valid) {
    return { ok: false, reason: verification.reason };
  }

  try {
    killFn(verification.pid, signal);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

function ownerCleanup(identity, pidFilePath, deps) {
  const deps_ = deps || {};
  const fsMod = deps_.fs || fs;
  const currentPid = deps_.currentPid !== undefined ? deps_.currentPid : process.pid;

  const verification = verifyIdentity(identity, deps_);
  if (!verification.valid) {
    return { ok: false, reason: verification.reason };
  }

  if (verification.pid !== currentPid) {
    return { ok: false, reason: 'not owner: pid mismatch' };
  }

  try {
    if (fsMod.existsSync(pidFilePath)) {
      fsMod.unlinkSync(pidFilePath);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = {
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
};
