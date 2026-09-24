const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// State machine tests (T013)
test('T013: State machine contract tests', async (t) => {
  const { createInitialState, processEvent, tick, getStatus,
          TRANSITION_ENTER_DURATION_MS, TRANSITION_EXIT_DURATION_MS } = require('../src/companion/state-machine.js');

  await t.test('initial state is small', () => {
    const state = createInitialState();
    assert.strictEqual(state.currentState, 'small');
    assert.strictEqual(state.isPaused, false);
    assert.strictEqual(state.scaleFactor, 0.0);
  });

  await t.test('companion.activate from small -> entering', () => {
    const state = createInitialState();
    processEvent(state, { event: 'companion.activate', schemaVersion: 1 });
    assert.strictEqual(state.currentState, 'entering');
    assert.ok(state.transitionStartTime > 0);
    assert.strictEqual(state.transitionDuration, TRANSITION_ENTER_DURATION_MS);
  });

  await t.test('entering -> resting after 600ms elapsed', () => {
    const state = createInitialState();
    processEvent(state, { event: 'companion.activate', schemaVersion: 1 });
    state.transitionStartTime = Date.now() - 600;
    tick(state);
    assert.strictEqual(state.currentState, 'resting');
    assert.strictEqual(state.scaleFactor, 1.0);
  });

  await t.test('entering interrupted by companion.deactivate -> exiting', () => {
    const state = createInitialState();
    processEvent(state, { event: 'companion.activate', schemaVersion: 1 });
    processEvent(state, { event: 'companion.deactivate', schemaVersion: 1 });
    assert.strictEqual(state.currentState, 'exiting');
  });

  await t.test('resting + companion.deactivate -> exiting', () => {
    const state = createInitialState();
    processEvent(state, { event: 'companion.activate', schemaVersion: 1 });
    state.transitionStartTime = Date.now() - 600;
    tick(state);
    assert.strictEqual(state.currentState, 'resting');
    processEvent(state, { event: 'companion.deactivate', schemaVersion: 1 });
    assert.strictEqual(state.currentState, 'exiting');
  });

  await t.test('exiting -> small after 400ms elapsed', () => {
    const state = createInitialState();
    processEvent(state, { event: 'companion.activate', schemaVersion: 1 });
    state.transitionStartTime = Date.now() - 600;
    tick(state);
    processEvent(state, { event: 'companion.deactivate', schemaVersion: 1 });
    state.transitionStartTime = Date.now() - 400;
    tick(state);
    assert.strictEqual(state.currentState, 'small');
    assert.strictEqual(state.scaleFactor, 0.0);
  });

  await t.test('idempotency on duplicate non-empty eventId', () => {
    const state = createInitialState();
    processEvent(state, { event: 'companion.activate', schemaVersion: 1, eventId: 'dup1' });
    assert.strictEqual(state.currentState, 'entering');
    processEvent(state, { event: 'companion.activate', schemaVersion: 1, eventId: 'dup1' });
    assert.strictEqual(state.currentState, 'entering', 'duplicate should not change state');
  });

  await t.test('companion.pause no-op when not resting', () => {
    const state = createInitialState();
    processEvent(state, { event: 'companion.pause', schemaVersion: 1 });
    assert.strictEqual(state.isPaused, false);
    assert.strictEqual(state.currentState, 'small');
  });

  await t.test('companion.pause works in resting', () => {
    const state = createInitialState();
    assert.strictEqual(state.isLooping, false, 'small isLooping false');
    processEvent(state, { event: 'companion.activate', schemaVersion: 1 });
    assert.strictEqual(state.isLooping, false, 'entering isLooping false');
    state.transitionStartTime = Date.now() - 600;
    tick(state);
    assert.strictEqual(state.currentState, 'resting');
    assert.strictEqual(state.isLooping, true, 'resting isLooping true');
    state.currentFrameIndex = 3;
    processEvent(state, { event: 'companion.pause', schemaVersion: 1 });
    assert.strictEqual(state.isPaused, true);
    assert.strictEqual(state.frozenFrame, 3);
    assert.strictEqual(state.isLooping, true, 'paused resting isLooping true');
  });

  await t.test('companion.activate resumes from frozen frame', () => {
    const state = createInitialState();
    processEvent(state, { event: 'companion.activate', schemaVersion: 1 });
    state.transitionStartTime = Date.now() - 600;
    tick(state);
    state.currentFrameIndex = 5;
    processEvent(state, { event: 'companion.pause', schemaVersion: 1 });
    assert.strictEqual(state.isPaused, true);
    processEvent(state, { event: 'companion.activate', schemaVersion: 1 });
    assert.strictEqual(state.isPaused, false);
    assert.strictEqual(state.frozenFrame, null);
    assert.strictEqual(state.currentFrameIndex, 5, 'continues from frozen frame');
  });

  await t.test('companion.deactivate freezes current frame and sets isLooping to false', () => {
    const state = createInitialState();
    processEvent(state, { event: 'companion.activate', schemaVersion: 1 });
    state.transitionStartTime = Date.now() - 600;
    tick(state);
    state.currentFrameIndex = 4;
    processEvent(state, { event: 'companion.deactivate', schemaVersion: 1 });
    assert.strictEqual(state.currentState, 'exiting');
    assert.strictEqual(state.isLooping, false, 'exiting isLooping false');
    assert.strictEqual(state.frozenFrame, 4, 'exiting freezes current frame');
    assert.strictEqual(state.currentFrameIndex, 4, 'currentFrameIndex retains frame');
  });
});

// Manifest loader tests (T029, T030, T031)
test('T029-T031: Manifest loader, atlas dims, path security', async (t) => {
  const { parsePetManifest, validateAtlasDimensions, validatePathSecurity } = require('../src/companion/manifest-loader.js');

  await t.test('parse valid pet.json', () => {
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-test-'));
    const tempDir = path.join(parentDir, 'test-pet');
    fs.mkdirSync(tempDir);
    const spritePath = path.join(tempDir, 'sheet.png');
    fs.writeFileSync(spritePath, Buffer.alloc(100));
    const result = parsePetManifest(tempDir, {
      id: 'test-pet',
      displayName: 'Test',
      description: 'A test pet',
      spritesheetPath: 'sheet.png',
    });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.pet.id, 'test-pet');
    assert.strictEqual(result.pet.displayName, 'Test');
    fs.rmSync(parentDir, { recursive: true, force: true });
  });

  await t.test('reject missing required fields', () => {
    const result = parsePetManifest('/tmp', { id: 'test' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  await t.test('reject empty values', () => {
    const result = parsePetManifest('/tmp', {
      id: '', displayName: '', description: '', spritesheetPath: ''
    });
    assert.strictEqual(result.valid, false);
  });

  await t.test('atlas dimensions validation', () => {
    const r1 = validateAtlasDimensions(1536, 1872);
    assert.strictEqual(r1.valid, true);
    assert.strictEqual(r1.columns, 8);
    assert.strictEqual(r1.rows, 9);

    const r2 = validateAtlasDimensions(100, 100);
    assert.strictEqual(r2.valid, false);

    const r3 = validateAtlasDimensions(1536, 1000);
    assert.strictEqual(r3.valid, false);

    const r4 = validateAtlasDimensions(1536, 1872 + 208);
    assert.strictEqual(r4.valid, true);
    assert.strictEqual(r4.rows, 10);
  });

  await t.test('path security', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-sec-'));
    assert.strictEqual(validatePathSecurity('/etc/passwd', tempDir).safe, false);
    assert.strictEqual(validatePathSecurity('../../etc/passwd', tempDir).safe, false);
    assert.strictEqual(validatePathSecurity('frames/test.png', tempDir).safe, true);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});

// Ultradian adapter tests (T017, T018)
test('T017-T018: Ultradian adapter mapping and fs.watch', async (t) => {
  const { createUltradianAdapter } = require('../src/companion/ultradian-adapter.js');

  await t.test('daemon status mapping', () => {
    const adapter = createUltradianAdapter({ stateDir: '/tmp' });
    
    const map = adapter.daemonStatusToEvent;
    assert.deepStrictEqual(map('running', 'work'), { event: 'companion.deactivate', reason: 'Timer entered work phase' });
    assert.deepStrictEqual(map('running', 'rest'), { event: 'companion.activate', reason: 'Timer entered rest phase' });
    assert.deepStrictEqual(map('paused', 'rest'), { event: 'companion.pause', reason: 'Timer paused during rest' });
    assert.deepStrictEqual(map('idle', 'any'), { event: 'companion.deactivate', reason: 'Timer is idle' });
    assert.deepStrictEqual(map('completed', 'any'), { event: 'companion.deactivate', reason: 'Timer completed' });
    assert.strictEqual(map('running', 'unknown'), null);
  });

  await t.test('adapter start/stop lifecycle', () => {
    const events = [];
    const adapter = createUltradianAdapter({
      stateDir: '/tmp',
      onEvent: (e) => events.push(e),
    });
    adapter.start();
    adapter.stop();
    assert.ok(true);
  });
});

// Per-clip fallback tests (T032)
test('T032: Per-clip fallback resolution', async (t) => {
  const { resolveClipFrames } = require('../src/companion/companion-config-loader.js');

  await t.test('missing companion.json uses fallbacks', () => {
    const configResult = { clips: {}, render: {} };
    const manifestResult = { pet: { id: 'test' } };
    const clips = resolveClipFrames(configResult, manifestResult, 9);
    assert.ok(clips.enter.fallback);
    assert.strictEqual(clips.enter.row, 1);
    assert.strictEqual(clips.enter.fps, 10);
    assert.ok(clips.rest.fallback);
    assert.strictEqual(clips.rest.row, 0);
    assert.strictEqual(clips.rest.fps, 8);
    assert.ok(clips.exit.fallback);
    assert.strictEqual(clips.exit.fps, 12);
  });

  await t.test('partial companion.json overrides only specified clips', () => {
    const configResult = {
      clips: {
        rest: { frames: ['custom.png'], fps: 6, loop: true },
      },
      render: {},
    };
    const manifestResult = { pet: { id: 'test' } };
    const clips = resolveClipFrames(configResult, manifestResult, 9);
    assert.strictEqual(clips.rest.fps, 6);
    assert.strictEqual(clips.rest.loop, true);
    assert.ok(clips.enter.fallback);
    assert.ok(clips.exit.fallback);
  });
});
