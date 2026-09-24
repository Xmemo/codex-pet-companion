const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const companionPaths = require('./paths.js');

function compileSwiftRenderer(binPath) {
  const swiftSrc1 = path.join(__dirname, '..', 'companion_renderer.swift');
  const swiftSrc2 = path.join(__dirname, '..', 'timer_panel.swift');
  const binDir = path.dirname(binPath);
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  try {
    execFileSync('/usr/bin/xcrun', ['swiftc', '-O', '-o', binPath, swiftSrc1, swiftSrc2], {
      stdio: 'ignore',
    });
    return true;
  } catch (err) {
    throw new Error(`Failed to compile Swift renderer: ${err.message}`);
  }
}

function serializeEvent(event) {
  const obj = {
    schemaVersion: event.schemaVersion || 1,
    event: event.event,
  };
  if (event.eventId) obj.eventId = event.eventId;
  if (event.reason) obj.reason = event.reason;
  if (event.deadline !== undefined) obj.deadline = event.deadline;
  if (event.state !== undefined) obj.state = event.state;
  if (event.goalVisible !== undefined) obj.goalVisible = event.goalVisible;
  if (event.message !== undefined) obj.message = event.message;
  return JSON.stringify(obj) + '\n';
}

function spawnRenderer(binPath, args = [], options = {}) {
  const fsExists = options.existsSync || fs.existsSync;
  const spawnFn = options.spawn || spawn;
  const compileFn = options.compileSwiftRenderer || compileSwiftRenderer;
  const spawnOptions = options.spawnOptions || {};

  if (!fsExists(binPath)) {
    compileFn(binPath);
  }

  const child = spawnFn(binPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    ...spawnOptions,
  });

  return child;
}

function startBridge(options = {}) {
  const {
    binPath = companionPaths.COMPANION_BINARY,
    onEvent = () => {},
    onError = () => {},
    onExit = () => {},
    onCommand = options.onCommand || (() => {}),
    onProtocolError = options.onProtocolError || (() => {}),
    extraArgs = [],
    spawn: spawnFn,
    existsSync,
    compileSwiftRenderer: compileFn,
    setTimeout: setTimeoutFn = setTimeout,
    clearTimeout: clearTimeoutFn = clearTimeout,
    readyTimeoutMs = 1500,
  } = options;

  let renderer = null;
  let stdinClosed = false;
  let isRunning = false;
  let rendererPid = null;
  let stdoutBuffer = '';
  let terminalSeen = false;
  let readySeen = false;
  let readyResolve = null;
  let readyReject = null;
  let readyTimer = null;
  let stopTimer = null;
  let stopRequested = false;
  let readyPromise = Promise.reject(new Error('bridge not started'));
  readyPromise.catch(() => {});

  function createReadyPromise() {
    readyPromise = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    return readyPromise;
  }

  function clearReadyTimer() {
    if (!readyTimer) return;
    if (typeof clearTimeoutFn === 'function') clearTimeoutFn(readyTimer);
    readyTimer = null;
  }

  function markReady(evidence) {
    if (!readyResolve) return;
    readySeen = true;
    clearReadyTimer();
    const resolve = readyResolve;
    readyResolve = null;
    readyReject = null;
    resolve(evidence);
  }

  function clearStopTimer() {
    if (!stopTimer) return;
    if (typeof clearTimeoutFn === 'function') clearTimeoutFn(stopTimer);
    stopTimer = null;
  }

  function finishRendererExit() {
    clearStopTimer();
    renderer = null;
    rendererPid = null;
  }

  function requestRendererStop(target = renderer) {
    if (!target || stopRequested) return;
    stopRequested = true;
    try {
      target.stdin.end();
    } catch (_) {}
    stdinClosed = true;
    stopTimer = setTimeoutFn(() => {
      stopTimer = null;
      if (renderer !== target) return;
      try { target.kill('SIGTERM'); } catch (_) {}
    }, 1000);
    if (stopTimer && typeof stopTimer.unref === 'function') stopTimer.unref();
  }

  function markTerminal(kind, err, code, signal) {
    if (terminalSeen) {
      if (kind === 'exit') finishRendererExit();
      return;
    }
    terminalSeen = true;
    isRunning = false;
    clearReadyTimer();
    if (readyReject) {
      const reject = readyReject;
      readyResolve = null;
      readyReject = null;
      reject(err || new Error(kind));
    }
    if (!readySeen) {
      if (kind === 'exit') finishRendererExit();
      else requestRendererStop();
      return;
    }
    if (kind === 'error') {
      requestRendererStop();
      try { onError(err); } catch (_) {}
    } else {
      finishRendererExit();
      try { onExit(code, signal); } catch (_) {}
    }
  }

  function isValidCommandEnvelope(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (value.kind !== 'command') return false;
    if (typeof value.command !== 'string') return false;

    const allowedCommands = ['start', 'pause', 'resume', 'stop', 'review', 'setGoalVisibility'];
    if (!allowedCommands.includes(value.command)) return false;

    const keys = Object.keys(value);

    if (value.command === 'start') {
      const expected = ['kind', 'command', 'preset', 'intentionText', 'replace'];
      if (keys.length !== expected.length) return false;
      for (const k of expected) {
        if (!keys.includes(k)) return false;
      }
      if (!['start', 'flow', 'deep'].includes(value.preset)) return false;
      if (typeof value.intentionText !== 'string' || value.intentionText.trim().length === 0) return false;
      if (typeof value.replace !== 'boolean') return false;
    } else if (value.command === 'review') {
      const expected = ['kind', 'command', 'outcome', 'text'];
      if (keys.length !== expected.length) return false;
      for (const k of expected) {
        if (!keys.includes(k)) return false;
      }
      if (!['done', 'partial', 'switched'].includes(value.outcome)) return false;
      if (typeof value.text !== 'string') return false;
    } else if (value.command === 'setGoalVisibility') {
      const expected = ['kind', 'command', 'visible'];
      if (keys.length !== expected.length) return false;
      for (const k of expected) {
        if (!keys.includes(k)) return false;
      }
      if (typeof value.visible !== 'boolean') return false;
    } else {
      const expected = ['kind', 'command'];
      if (keys.length !== expected.length) return false;
      for (const k of expected) {
        if (!keys.includes(k)) return false;
      }
    }

    return true;
  }

  function isValidStatusEvent(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (value.kind !== undefined && value.kind !== 'status') return false;
    if (value.panelReady !== undefined && typeof value.panelReady !== 'boolean') return false;
    const required = [
      'engineState',
      'isPaused',
      'activeClip',
      'currentFrame',
      'fps',
      'anchorFound',
      'windowVisible',
      'error',
    ];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) return false;
    }
    if (!['small', 'entering', 'resting', 'exiting'].includes(value.engineState)) return false;
    if (typeof value.isPaused !== 'boolean') return false;
    if (!(value.activeClip === null || ['enter', 'rest', 'exit'].includes(value.activeClip))) return false;
    if (!Number.isFinite(value.currentFrame)) return false;
    if (!Number.isFinite(value.fps) || value.fps <= 0) return false;
    if (typeof value.anchorFound !== 'boolean') return false;
    if (typeof value.windowVisible !== 'boolean') return false;
    if (!(value.error === null || typeof value.error === 'string')) return false;
    return true;
  }

  function handleParsedEvent(parsed) {
    if (parsed && parsed.kind === 'command') {
      if (isValidCommandEnvelope(parsed)) {
        onCommand(parsed);
      } else {
        try {
          onProtocolError(new Error(`Invalid or unknown Swift command: ${JSON.stringify(parsed)}`));
        } catch (_) {}
      }
    } else {
      onEvent(parsed);
      if (!readySeen && isValidStatusEvent(parsed)) {
        markReady({ status: 'semantic', pid: rendererPid });
      }
    }
  }

  function parseStdoutData(data, flush = false) {
    stdoutBuffer += data;
    const lines = stdoutBuffer.split('\n');
    const parseLines = lines.slice(0, -1);
    stdoutBuffer = flush ? '' : lines[lines.length - 1];
    for (const line of parseLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        handleParsedEvent(parsed);
      } catch (_) {}
    }
    if (flush && lines.length > 0) {
      const tail = lines[lines.length - 1].trim();
      if (!tail) return;
      try {
        const parsed = JSON.parse(tail);
        handleParsedEvent(parsed);
      } catch (_) {}
    }
  }

  function send(event) {
    if (!renderer || !renderer.stdin.writable || stdinClosed) return false;
    const data = serializeEvent(event);
    try {
      renderer.stdin.write(data);
      return true;
    } catch (_) {
      return false;
    }
  }

  function start() {
    if (isRunning || renderer) return;
    terminalSeen = false;
    readySeen = false;
    stdoutBuffer = '';
    stdinClosed = false;
    stopRequested = false;
    clearStopTimer();
    createReadyPromise();
    renderer = spawnRenderer(binPath, extraArgs, {
      spawn: spawnFn,
      existsSync,
      compileSwiftRenderer: compileFn,
    });
    rendererPid = renderer.pid;
    isRunning = true;

    if (readyTimeoutMs >= 0) {
      readyTimer = setTimeoutFn(() => {
        markTerminal('error', new Error('renderer readiness timeout'));
      }, readyTimeoutMs);
      if (readyTimer && typeof readyTimer.unref === 'function') readyTimer.unref();
    }

    renderer.on('spawn', () => {});

    renderer.on('exit', (code, signal) => {
      parseStdoutData('', true);
      markTerminal('exit', new Error(`renderer exited before ready: ${code ?? signal ?? 'unknown'}`), code, signal);
    });

    renderer.on('error', (err) => {
      markTerminal('error', err);
    });

    renderer.stdout.on('data', (chunk) => {
      parseStdoutData(chunk.toString());
    });
    renderer.stdout.on('end', () => parseStdoutData('', true));
  }

  function stop() {
    requestRendererStop();
    isRunning = false;
  }

  function getIsRunning() {
    return isRunning;
  }

  function getRendererPid() {
    return rendererPid;
  }

  return {
    send,
    start,
    stop,
    getIsRunning,
    getRendererPid,
    whenReady: () => readyPromise,
    get _rendererPid() { return rendererPid; },
  };
}

module.exports = {
  compileSwiftRenderer,
  serializeEvent,
  spawnRenderer,
  startBridge,
};
