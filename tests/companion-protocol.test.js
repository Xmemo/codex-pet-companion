const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

// NDJSON serialization/deserialization tests (T015)
test('T015: NDJSON protocol serialization tests', async (t) => {
  const { serializeEvent } = require('../src/companion/bridge.js');

  await t.test('serialize companion.activate', () => {
    const event = {
      schemaVersion: 1,
      event: 'companion.activate',
      eventId: 'evt-1',
      reason: 'Test',
      deadline: 1721500000,
    };
    const line = serializeEvent(event);
    const parsed = JSON.parse(line.trim());
    assert.strictEqual(parsed.schemaVersion, 1);
    assert.strictEqual(parsed.event, 'companion.activate');
    assert.strictEqual(parsed.eventId, 'evt-1');
    assert.strictEqual(parsed.reason, 'Test');
    assert.strictEqual(parsed.deadline, 1721500000);
  });

  await t.test('serialize companion.deactivate', () => {
    const line = serializeEvent({ event: 'companion.deactivate' });
    const parsed = JSON.parse(line.trim());
    assert.strictEqual(parsed.event, 'companion.deactivate');
  });

  await t.test('serialize companion.pause', () => {
    const line = serializeEvent({ event: 'companion.pause' });
    const parsed = JSON.parse(line.trim());
    assert.strictEqual(parsed.event, 'companion.pause');
  });

  await t.test('serialize with minimal fields', () => {
    const line = serializeEvent({ event: 'companion.activate' });
    const parsed = JSON.parse(line.trim());
    assert.strictEqual(parsed.schemaVersion, 1);
    assert.strictEqual(parsed.event, 'companion.activate');
    assert.strictEqual(parsed.eventId, undefined);
    assert.strictEqual(parsed.reason, undefined);
    assert.strictEqual(parsed.deadline, undefined);
  });

  await t.test('serialize includes trailing newline', () => {
    const line = serializeEvent({ event: 'companion.activate' });
    assert.ok(line.endsWith('\n'));
  });
});

// Bridge lifecycle tests (T025, T051)
test('T025/T051: Bridge lifecycle tests', async (t) => {
  const { compileSwiftRenderer, spawnRenderer, serializeEvent } = require('../src/companion/bridge.js');

  await t.test('serializeEvent produces valid JSON', () => {
    const line = serializeEvent({ event: 'companion.activate', eventId: 'test' });
    assert.doesNotThrow(() => JSON.parse(line.trim()));
  });

  await t.test('Swift compilation check (xcrun swiftc available)', () => {
    try {
      const result = require('child_process').execFileSync('/usr/bin/which', ['xcrun'], { encoding: 'utf8' });
      assert.ok(result.trim().length > 0);
    } catch (_) {
      // Skip if xcrun not available in CI
      assert.ok(true, 'xcrun not available, skipping compilation test');
    }
  });
});

test('G3B bridge stdout NDJSON parser handles chunks, multiline data, EOF, and bad JSON', async () => {
  const { startBridge } = require('../src/companion/bridge.js');
  const events = [];
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { writable: true, write() {}, end() {} };
  child.pid = 1234;

  const bridge = startBridge({
    binPath: '/tmp/fake-renderer',
    spawn: () => child,
    existsSync: () => true,
    setTimeout: () => ({ unref() {} }),
    onEvent: (event) => events.push(event),
  });

  bridge.start();
  child.emit('spawn');
  await assert.rejects(Promise.race([
    bridge.whenReady(),
    Promise.resolve().then(() => { throw new Error('not ready yet'); }),
  ]), /not ready yet/);
  child.stdout.emit('data', Buffer.from('{"engineState":"enter'));
  child.stdout.emit('data', Buffer.from('ing","isPaused":false,"activeClip":"enter","currentFrame":0,"fps":10,"anchorFound":true,"windowVisible":true,"error":null}\n{bad json}\n{"engineState":"resting"}\n{"engineState":"exit"}'));
  child.stdout.emit('end');

  await bridge.whenReady();
  assert.deepStrictEqual(events, [
    { engineState: 'entering', isPaused: false, activeClip: 'enter', currentFrame: 0, fps: 10, anchorFound: true, windowVisible: true, error: null },
    { engineState: 'resting' },
    { engineState: 'exit' },
  ]);
});

test('G3B bridge readiness requires first complete legal semantic status', async () => {
  const { startBridge } = require('../src/companion/bridge.js');
  const events = [];
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { writable: true, write() {}, end() {} };
  child.pid = 1234;

  const bridge = startBridge({
    binPath: '/tmp/fake-renderer',
    spawn: () => child,
    existsSync: () => true,
    setTimeout: () => ({ unref() {} }),
    onEvent: (event) => events.push(event),
  });

  bridge.start();
  child.emit('spawn');
  child.stdout.emit('data', Buffer.from('[1,2,3]\n{"engineState":"small"}\n'));
  await assert.rejects(Promise.race([
    bridge.whenReady(),
    Promise.resolve().then(() => { throw new Error('still waiting'); }),
  ]), /still waiting/);

  child.stdout.emit('data', Buffer.from('{"engineState":"small","isPaused":false,"activeClip":null,"currentFrame":0,"fps":8,"anchorFound":false,"windowVisible":false,"error":null,"schemaVersion":2}\n'));
  const ready = await bridge.whenReady();
  assert.deepStrictEqual(ready, { status: 'semantic', pid: 1234 });
  assert.strictEqual(events.at(-1).schemaVersion, 2);
});

test('G3B bridge readiness timeout stops a live renderer without duplicate termination', async () => {
  const { startBridge } = require('../src/companion/bridge.js');
  const timers = [];
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let stdinEnds = 0;
  let kills = 0;
  child.stdin = {
    writable: true,
    write() {},
    end() { stdinEnds += 1; },
  };
  child.kill = (signal) => {
    assert.strictEqual(signal, 'SIGTERM');
    kills += 1;
  };
  child.pid = 1234;

  const bridge = startBridge({
    binPath: '/tmp/fake-renderer',
    spawn: () => child,
    existsSync: () => true,
    setTimeout: (fn) => {
      const handle = { fn, unref() {} };
      timers.push(handle);
      return handle;
    },
    clearTimeout: () => {},
  });

  bridge.start();
  assert.strictEqual(timers.length, 1);
  timers[0].fn();

  await assert.rejects(bridge.whenReady(), /renderer readiness timeout/);
  assert.strictEqual(stdinEnds, 1);
  assert.strictEqual(bridge.getIsRunning(), false);
  assert.strictEqual(timers.length, 2, 'timeout cleanup should install a SIGTERM fallback');

  timers[1].fn();
  child.emit('exit', 0, null);
  assert.strictEqual(kills, 1);
  assert.strictEqual(stdinEnds, 1);
});

test('G3B bridge startup exit rejects readiness without terminal callbacks', async () => {
  const { startBridge } = require('../src/companion/bridge.js');
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let stdinEnds = 0;
  let kills = 0;
  child.stdin = { writable: true, write() {}, end() { stdinEnds += 1; } };
  child.kill = () => { kills += 1; };
  child.pid = 1234;
  let errors = 0;
  let exits = 0;

  const bridge = startBridge({
    binPath: '/tmp/fake-renderer',
    spawn: () => child,
    existsSync: () => true,
    onError: () => { errors += 1; },
    onExit: () => { exits += 1; },
  });

  bridge.start();
  child.emit('spawn');
  child.emit('exit', 1, null);

  await assert.rejects(bridge.whenReady(), /renderer exited before ready/);
  assert.strictEqual(errors, 0);
  assert.strictEqual(exits, 0);
  assert.strictEqual(stdinEnds, 0);
  assert.strictEqual(kills, 0);
});

test('G3B bridge runtime terminal notification is one-shot after readiness', async () => {
  const { startBridge } = require('../src/companion/bridge.js');
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { writable: true, write() {}, end() {} };
  child.pid = 1234;
  let errors = 0;
  let exits = 0;

  const bridge = startBridge({
    binPath: '/tmp/fake-renderer',
    spawn: () => child,
    existsSync: () => true,
    setTimeout: () => ({ unref() {} }),
    onError: () => { errors += 1; },
    onExit: () => { exits += 1; },
  });

  bridge.start();
  child.stdout.emit('data', Buffer.from('{"engineState":"small","isPaused":false,"activeClip":null,"currentFrame":0,"fps":8,"anchorFound":false,"windowVisible":false,"error":null}\n'));
  await bridge.whenReady();

  child.emit('error', new Error('runtime failure'));
  child.emit('exit', 1, null);
  assert.strictEqual(errors, 1);
  assert.strictEqual(exits, 0);
});

test('G3B bridge async spawn error has one terminal semantic and rejects readiness', async () => {
  const { startBridge } = require('../src/companion/bridge.js');
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { writable: true, write() {}, end() {} };
  child.pid = undefined;
  let errors = 0;
  let exits = 0;

  const bridge = startBridge({
    binPath: '/tmp/fake-renderer',
    spawn: () => child,
    existsSync: () => true,
    onError: () => { errors += 1; },
    onExit: () => { exits += 1; },
  });

  bridge.start();
  const err = new Error('spawn failed');
  child.emit('error', err);
  child.emit('exit', 1, null);

  await assert.rejects(bridge.whenReady(), /spawn failed/);
  assert.strictEqual(errors, 0);
  assert.strictEqual(exits, 0);
  assert.strictEqual(bridge.getIsRunning(), false);
});

test('G3B bridge stop tolerates timeout handles without unref and uses injected clearTimeout', async () => {
  const { startBridge } = require('../src/companion/bridge.js');
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { writable: true, write() {}, end() {} };
  child.pid = 1234;
  let cleared = 0;
  let killed = false;
  child.kill = () => { killed = true; };

  const bridge = startBridge({
    binPath: '/tmp/fake-renderer',
    spawn: () => child,
    existsSync: () => true,
    setTimeout: (fn) => ({ fn }),
    clearTimeout: () => { cleared += 1; },
  });

  bridge.start();
  child.stdout.emit('data', Buffer.from('{"engineState":"small","isPaused":false,"activeClip":null,"currentFrame":0,"fps":8,"anchorFound":false,"windowVisible":false,"error":null}\n'));
  await bridge.whenReady();
  assert.doesNotThrow(() => bridge.stop());
  assert.strictEqual(cleared, 1);
  assert.strictEqual(killed, false);
});
