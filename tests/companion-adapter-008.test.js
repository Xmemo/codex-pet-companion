const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');

test('T008: ultradian-adapter.js state forwarding and no-per-second-persistence', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-test-'));
  const stateDir = path.join(tempRoot, 'state');
  const socketPath = path.join(stateDir, 'daemon.sock');
  fs.mkdirSync(stateDir, { recursive: true });

  let daemonState = {
    status: 'running',
    phase: 'work',
    deadline: 1000,
    intention_text: 'Test goal',
    review_pending: false
  };

  // Mock daemon server
  const server = net.createServer((socket) => {
    let request = '';
    socket.on('data', (chunk) => {
      request += chunk.toString('utf8');
      if (request.includes('\n')) {
        socket.end(JSON.stringify({ ok: true, state: daemonState }) + '\n');
      }
    });
  });

  await new Promise((resolve) => server.listen(socketPath, resolve));

  const sentEvents = [];
  const { createUltradianAdapter } = require('../src/companion/ultradian-adapter.js');

  const adapter = createUltradianAdapter({
    stateDir,
    socketPath,
    onEvent: (evt) => {
      sentEvents.push(evt);
    },
    onError: (err) => {
      assert.fail(`onError called: ${err.message}`);
    }
  });

  try {
    await t.test('emits full timer.state on initial query', async () => {
      sentEvents.length = 0;
      adapter.start();
      
      // Allow query to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      // We expect 1 timer.state event (from the initial query)
      const stateEvents = sentEvents.filter(e => e.event === 'timer.state');
      assert.strictEqual(stateEvents.length, 1);
      assert.strictEqual(stateEvents[0].state.status, 'running');
      assert.strictEqual(stateEvents[0].state.intention_text, 'Test goal');
    });

    await t.test('does not emit state again if semantic key is unchanged', async () => {
      sentEvents.length = 0;
      
      // Trigger multiple times (like per-second updates)
      await adapter.triggerImmediate();
      await adapter.triggerImmediate();
      await adapter.triggerImmediate();
      
      const stateEvents = sentEvents.filter(e => e.event === 'timer.state');
      // Key hasn't changed, so should be 0 new timer.state emits
      assert.strictEqual(stateEvents.length, 0);
    });

    await t.test('emits state when semantic fields change', async () => {
      sentEvents.length = 0;
      
      // Change intention text
      daemonState.intention_text = 'New goal';
      await adapter.triggerImmediate();
      
      let stateEvents = sentEvents.filter(e => e.event === 'timer.state');
      assert.strictEqual(stateEvents.length, 1);
      assert.strictEqual(stateEvents[0].state.intention_text, 'New goal');
      
      // Change review pending status
      sentEvents.length = 0;
      daemonState.review_pending = true;
      await adapter.triggerImmediate();
      
      stateEvents = sentEvents.filter(e => e.event === 'timer.state');
      assert.strictEqual(stateEvents.length, 1);
      assert.strictEqual(stateEvents[0].state.review_pending, true);
    });
  } finally {
    // Clean up
    adapter.stop();
    await new Promise((resolve) => server.close(resolve));
    try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch (_) {}
  }
});

// Appended direct tests for Feature 008 Node protocol and preference
test('T008 Batch B: direct Node protocol and preference tests', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'protocol-test-'));
  const socketPath = path.join(tempRoot, 'daemon.sock');
  const mockWorkerPath = path.join(tempRoot, 'worker.js');
  fs.writeFileSync(mockWorkerPath, 'console.log("mock worker");');
  
  let daemonResponse = { ok: true, state: { status: 'running', phase: 'work' } };
  let lastReceivedCommand = null;
  
  // Mock daemon server
  const daemonServer = net.createServer((socket) => {
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      if (buf.includes('\n')) {
        try {
          lastReceivedCommand = JSON.parse(buf.trim());
        } catch (_) {}
        socket.end(JSON.stringify(daemonResponse) + '\n');
      }
    });
  });
  await new Promise((resolve) => daemonServer.listen(socketPath, resolve));

  const { runWorker } = require('../src/companion/worker-lifecycle.js');
  const { sendDaemonCommand: sendRealDaemonCommand } = require('../src/parser.js');

  let capturedOnCommand = null;
  let capturedOnProtocolError = null;
  const bridgeSent = [];
  
  const fakeBridge = {
    start() {},
    stop() {},
    send(evt) {
      bridgeSent.push(evt);
      return true;
    },
    whenReady() { return Promise.resolve(); }
  };

  const statusPath = path.join(tempRoot, 'status.json');
  const readyPath = path.join(tempRoot, 'ready.json');
  const pidPath = path.join(tempRoot, 'companion.pid');
  const buildPath = path.join(tempRoot, 'build');

  let failPreferenceWrite = false;

  const deps = {
    fs: {
      existsSync: (p) => {
        if (p === statusPath) return false;
        return fs.existsSync(p);
      },
      readFileSync: (p) => {
        if (p.includes('pet.json')) {
          return JSON.stringify({ id: 'pet-1', displayName: 'Pet 1', spritesheetPath: 'spritesheet.png' });
        }
        return fs.readFileSync(p);
      },
      writeFileSync: (p, data, opts) => {
        if (p.includes('panel-preferences.json') && failPreferenceWrite) {
          throw new Error('Deterministic fs write failure');
        }
        fs.writeFileSync(p, data, opts);
      },
      renameSync: (a, b) => {
        if ((a.includes('panel-preferences.json') || b.includes('panel-preferences.json')) && failPreferenceWrite) {
          throw new Error('Deterministic fs rename failure');
        }
        fs.renameSync(a, b);
      },
      chmodSync: (p, mode) => {
        if (p.includes('panel-preferences.json') && failPreferenceWrite) {
          throw new Error('Deterministic fs chmod failure');
        }
        fs.chmodSync(p, mode);
      },
      mkdirSync: (p, opts) => {
        fs.mkdirSync(p, opts);
      },
      unlinkSync: (p) => {
        fs.unlinkSync(p);
      }
    },
    paths: {
      COMPANION_BINARY: '/tmp/fake-binary',
      COMPANION_PID_PATH: pidPath,
      COMPANION_READY_PATH: readyPath,
      COMPANION_STATUS_PATH: statusPath,
      COMPANION_BUILD_PATH: buildPath,
      URD_STATE_DIR: tempRoot,
      COMPANION_PANEL_PREF_PATH: path.join(tempRoot, 'panel-preferences.json')
    },
    socketPath,
    sendDaemonCommand: (socket, command) => {
      if (command.command === 'status') {
        return Promise.resolve({ ok: true, state: { status: 'completed', phase: 'work' } });
      }
      return sendRealDaemonCommand(socket, command);
    },
    cliScript: mockWorkerPath,
    scriptPath: mockWorkerPath,
    readyToken: 'tok',
    spawn: () => {},
    execFileSync: () => {},
    psExec: (cmd, args) => {
      const field = args[args.length - 1].replace('=', '');
      if (field === 'lstart') return 'Mon Jul 20 12:00:00 2026';
      if (field === 'uid') return '501';
      if (field === 'command') return `node ${mockWorkerPath} --worker --ready-token tok`;
      return '';
    },
    getuid: () => 501,
    randomToken: () => 'tok',
    now: () => Date.now(),
    sleep: () => Promise.resolve(),
    exit: () => {},
    onSignal: () => {},
    resolvePetId: () => ({ petId: 'pet-1', source: 'auto', available: true, petDir: '/pets/pet-1' }),
    prepareVisualConfig: () => ({ visualConfig: {}, companionJsonLoaded: true }),
    compileSwiftRenderer: () => {},
    startBridge: (opts) => {
      capturedOnCommand = opts.onCommand;
      capturedOnProtocolError = opts.onProtocolError;
      return fakeBridge;
    },
    createUltradianAdapter: () => ({
      start() {},
      stop() {},
    }),
    workerPid: 4242,
  };

  try {
    // Run the worker initialization to wire the callbacks
    const runResult = await runWorker(deps);
    assert.strictEqual(runResult.ok, true);

    await t.test('validated command forward', async () => {
      bridgeSent.length = 0;
      lastReceivedCommand = null;
      daemonResponse = { ok: true, state: { status: 'running', phase: 'rest' } };
      
      await capturedOnCommand({
        command: 'start',
        preset: 'flow',
        intentionText: 'Do work',
        replace: false
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stateEvents = bridgeSent.filter(e => e.event === 'timer.state');
      assert.strictEqual(stateEvents.length, 1);
      assert.strictEqual(stateEvents[0].state.phase, 'rest');

      // Verify the command received by mock daemon retains intentionText/review fields
      assert.ok(lastReceivedCommand);
      assert.strictEqual(lastReceivedCommand.command, 'start');
      assert.strictEqual(lastReceivedCommand.preset, 'flow');
      assert.strictEqual(lastReceivedCommand.intentionText, 'Do work');
      assert.strictEqual(lastReceivedCommand.replace, false);
    });

    await t.test('validated command forward (review)', async () => {
      bridgeSent.length = 0;
      lastReceivedCommand = null;
      daemonResponse = { ok: true, state: { status: 'running', phase: 'rest' } };

      await capturedOnCommand({
        command: 'review',
        outcome: 'done',
        text: 'Finished'
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      assert.ok(lastReceivedCommand);
      assert.strictEqual(lastReceivedCommand.command, 'review');
      assert.strictEqual(lastReceivedCommand.outcome, 'done');
      assert.strictEqual(lastReceivedCommand.text, 'Finished');
    });

    await t.test('daemon ok:false gives only timer.error', async () => {
      bridgeSent.length = 0;
      daemonResponse = { ok: false, error: 'Invalid start parameter' };

      await capturedOnCommand({
        command: 'start',
        preset: 'flow',
        intentionText: 'Do work',
        replace: false
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stateEvents = bridgeSent.filter(e => e.event === 'timer.state');
      assert.strictEqual(stateEvents.length, 0);

      const errorEvents = bridgeSent.filter(e => e.event === 'timer.error');
      assert.strictEqual(errorEvents.length, 1);
      assert.strictEqual(errorEvents[0].message, 'Invalid start parameter');
    });

    await t.test('invalid Swift command invokes nonfatal protocol path and worker stays alive', async () => {
      bridgeSent.length = 0;
      
      await capturedOnProtocolError(new Error('Invalid key structure'));

      const errorEvents = bridgeSent.filter(e => e.event === 'timer.error');
      assert.strictEqual(errorEvents.length, 1);
      assert.match(errorEvents[0].message, /Invalid key structure/);
    });

    await t.test('preference mode is 0600 and failure is inline', async () => {
      bridgeSent.length = 0;
      failPreferenceWrite = false;
      
      // 1. Success case: write preference
      await capturedOnCommand({
        command: 'setGoalVisibility',
        visible: false
      });
      
      const prefPath = deps.paths.COMPANION_PANEL_PREF_PATH;
      assert.ok(fs.existsSync(prefPath));
      const stat = fs.statSync(prefPath);
      const mode = stat.mode & 0o777;
      assert.strictEqual(mode, 0o600);

      const prefEvents = bridgeSent.filter(e => e.event === 'panel.preferences');
      assert.strictEqual(prefEvents.length, 1);
      assert.strictEqual(prefEvents[0].goalVisible, false);

      // 2. Failure case: make preference path unwritable by injecting failure in fake fs
      bridgeSent.length = 0;
      failPreferenceWrite = true;

      await capturedOnCommand({
        command: 'setGoalVisibility',
        visible: true
      });

      const errorEvents = bridgeSent.filter(e => e.event === 'timer.error');
      assert.strictEqual(errorEvents.length, 1);
      assert.match(errorEvents[0].message, /Failed to save visibility preference/);
      
      // Restore
      failPreferenceWrite = false;
    });
  } finally {
    // Clean up
    await new Promise((resolve) => daemonServer.close(resolve));
    try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch (_) {}
  }
});

test('T004 midpoint: ultradian adapter emits companion.midpoint on midpoint_notified false→true in work phase', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'midpoint-test-'));
  const stateDir = path.join(tempRoot, 'state');
  const socketPath = path.join(stateDir, 'daemon.sock');
  fs.mkdirSync(stateDir, { recursive: true });

  let daemonState = { status: 'running', phase: 'work', deadline: 2000, midpoint_notified: false };

  const server = net.createServer((socket) => {
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      if (buf.includes('\n')) {
        socket.end(JSON.stringify({ ok: true, state: daemonState }) + '\n');
      }
    });
  });
  await new Promise((resolve) => server.listen(socketPath, resolve));

  const sentEvents = [];
  const { createUltradianAdapter } = require('../src/companion/ultradian-adapter.js');
  const adapter = createUltradianAdapter({
    stateDir,
    socketPath,
    onEvent: (evt) => { sentEvents.push(evt); },
    onError: (err) => { assert.fail(`onError: ${err.message}`); }
  });

  try {
    await t.test('emits companion.midpoint exactly once on false→true transition', async () => {
      daemonState = { status: 'running', phase: 'work', deadline: 2000, midpoint_notified: false };
      await adapter.triggerImmediate();
      sentEvents.length = 0;

      daemonState.midpoint_notified = true;
      await adapter.triggerImmediate();

      const midpointEvents = sentEvents.filter(e => e.event === 'companion.midpoint');
      assert.strictEqual(midpointEvents.length, 1);
      assert.strictEqual(midpointEvents[0].schemaVersion, 1);
      assert.ok(midpointEvents[0].eventId);
    });

    await t.test('repeated polling does not duplicate companion.midpoint', async () => {
      sentEvents.length = 0;
      await adapter.triggerImmediate();
      await adapter.triggerImmediate();
      await adapter.triggerImmediate();

      const midpointEvents = sentEvents.filter(e => e.event === 'companion.midpoint');
      assert.strictEqual(midpointEvents.length, 0);
    });

    await t.test('pause/resume does not duplicate companion.midpoint', async () => {
      sentEvents.length = 0;
      daemonState = { status: 'paused', phase: 'rest', deadline: 2000, midpoint_notified: true };
      await adapter.triggerImmediate();
      daemonState = { status: 'running', phase: 'work', deadline: 2000, midpoint_notified: true };
      await adapter.triggerImmediate();

      const midpointEvents = sentEvents.filter(e => e.event === 'companion.midpoint');
      assert.strictEqual(midpointEvents.length, 0);
    });

    await t.test('works through pause/resume cycle', async () => {
      daemonState = { status: 'running', phase: 'work', deadline: 2000, midpoint_notified: false };
      await adapter.triggerImmediate();
      sentEvents.length = 0;

      daemonState = { status: 'paused', phase: 'rest', deadline: 2000, midpoint_notified: false };
      await adapter.triggerImmediate();
      daemonState = { status: 'running', phase: 'work', deadline: 2000, midpoint_notified: true };
      await adapter.triggerImmediate();

      const midpointEvents = sentEvents.filter(e => e.event === 'companion.midpoint');
      assert.strictEqual(midpointEvents.length, 1);
    });

    await t.test('reset and retrigger midpoint_notified emits again', async () => {
      daemonState = { status: 'running', phase: 'work', deadline: 2000, midpoint_notified: false };
      await adapter.triggerImmediate();
      sentEvents.length = 0;

      daemonState.midpoint_notified = true;
      await adapter.triggerImmediate();
      const firstBatch = sentEvents.filter(e => e.event === 'companion.midpoint').length;
      assert.strictEqual(firstBatch, 1);

      sentEvents.length = 0;
      daemonState.midpoint_notified = false;
      await adapter.triggerImmediate();
      sentEvents.length = 0;

      daemonState.midpoint_notified = true;
      await adapter.triggerImmediate();
      const secondBatch = sentEvents.filter(e => e.event === 'companion.midpoint').length;
      assert.strictEqual(secondBatch, 1);
    });

    await t.test('does not emit companion.midpoint when status is not work phase', async () => {
      daemonState = { status: 'running', phase: 'rest', deadline: 2000, midpoint_notified: false };
      await adapter.triggerImmediate();
      sentEvents.length = 0;

      daemonState.midpoint_notified = true;
      await adapter.triggerImmediate();

      const midpointEvents = sentEvents.filter(e => e.event === 'companion.midpoint');
      assert.strictEqual(midpointEvents.length, 0);
    });
  } finally {
    adapter.stop();
    await new Promise((resolve) => server.close(resolve));
    try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch (_) {}
  }
});
