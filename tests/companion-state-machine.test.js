const test = require('node:test');
const assert = require('node:assert');

const {
  createInitialState,
  processEvent,
  tick,
  getStatus,
  VALID_EVENTS,
} = require('../src/companion/state-machine.js');

test('T004 midpoint: companion.midpoint is a valid event', () => {
  assert.ok(VALID_EVENTS.includes('companion.midpoint'));
});

test('T004 midpoint: companion.midpoint in small state transitions to entering', () => {
  const state = createInitialState();
  const evt = {
    schemaVersion: 1,
    event: 'companion.midpoint',
    eventId: 'mp-1',
  };
  processEvent(state, evt);
  assert.strictEqual(state.currentState, 'entering');
  assert.strictEqual(state.isMidpoint, true);
  assert.strictEqual(state.currentFrameIndex, 0);
});

test('T004 midpoint: tick from entering transitions to resting with isLooping=true for midpoint', () => {
  const state = createInitialState();
  const evt = {
    schemaVersion: 1,
    event: 'companion.midpoint',
    eventId: 'mp-2',
  };
  processEvent(state, evt);
  // Override transitionStartTime to be in the past so tick completes
  state.transitionStartTime = Date.now() - 1000;
  tick(state);
  assert.strictEqual(state.currentState, 'resting');
  assert.strictEqual(state.isMidpoint, true);
  assert.strictEqual(state.isLooping, true);
  assert.strictEqual(state.currentFrameIndex, 0);
});

test('T004 midpoint: companion.activate after midpoint resets isMidpoint flag', () => {
  const state = createInitialState();
  const mp = {
    schemaVersion: 1,
    event: 'companion.midpoint',
    eventId: 'mp-3',
  };
  processEvent(state, mp);
  state.transitionStartTime = Date.now() - 1000;
  tick(state);
  assert.strictEqual(state.currentState, 'resting');
  assert.strictEqual(state.isMidpoint, true);
  assert.strictEqual(state.isLooping, true);

  // Now send deactivate to go back to small
  const deact = {
    schemaVersion: 1,
    event: 'companion.deactivate',
    eventId: 'de-1',
  };
  processEvent(state, deact);
  state.transitionStartTime = Date.now() - 1000;
  tick(state);
  assert.strictEqual(state.currentState, 'small');

  // Now send regular activate
  const act = {
    schemaVersion: 1,
    event: 'companion.activate',
    eventId: 'act-1',
  };
  processEvent(state, act);
  assert.strictEqual(state.currentState, 'entering');
  assert.strictEqual(state.isMidpoint, false);
});

test('T004 midpoint: regular activate from small does not set isMidpoint', () => {
  const state = createInitialState();
  const evt = {
    schemaVersion: 1,
    event: 'companion.activate',
    eventId: 'act-2',
  };
  processEvent(state, evt);
  assert.strictEqual(state.currentState, 'entering');
  assert.strictEqual(state.isMidpoint, false);
});

test('T004 midpoint: tick from entering to resting for regular activate sets isLooping=true', () => {
  const state = createInitialState();
  const evt = {
    schemaVersion: 1,
    event: 'companion.activate',
    eventId: 'act-3',
  };
  processEvent(state, evt);
  state.transitionStartTime = Date.now() - 1000;
  tick(state);
  assert.strictEqual(state.currentState, 'resting');
  assert.strictEqual(state.isLooping, true);
  assert.strictEqual(state.isMidpoint, false);
});

test('T004 midpoint: midpoint ignored if not in small state', () => {
  const state = createInitialState();
  // First go to resting via regular activate
  const act = {
    schemaVersion: 1,
    event: 'companion.activate',
    eventId: 'act-4',
  };
  processEvent(state, act);
  state.transitionStartTime = Date.now() - 1000;
  tick(state);
  assert.strictEqual(state.currentState, 'resting');

  // Midpoint event during resting should be a no-op
  const midpointInRest = {
    schemaVersion: 1,
    event: 'companion.midpoint',
    eventId: 'mp-4',
  };
  const beforeFrame = state.currentFrameIndex;
  processEvent(state, midpointInRest);
  assert.strictEqual(state.currentState, 'resting'); // unchanged
  assert.strictEqual(state.currentFrameIndex, beforeFrame); // unchanged
});

test('T004 midpoint: deactivate during midpoint entering transitions to exiting (interruption)', () => {
  const state = createInitialState();
  const mp = {
    schemaVersion: 1,
    event: 'companion.midpoint',
    eventId: 'mp-5',
  };
  processEvent(state, mp);
  assert.strictEqual(state.currentState, 'entering');

  const deact = {
    schemaVersion: 1,
    event: 'companion.deactivate',
    eventId: 'de-2',
  };
  processEvent(state, deact);
  assert.strictEqual(state.currentState, 'exiting');
});

test('T004 midpoint: companion.activate during midpoint entering cancels auto-exit', () => {
  const state = createInitialState();
  processEvent(state, { schemaVersion: 1, event: 'companion.midpoint', eventId: 'mp-c1' });
  assert.strictEqual(state.isMidpoint, true);

  processEvent(state, { schemaVersion: 1, event: 'companion.activate', eventId: 'act-c1' });
  assert.strictEqual(state.isMidpoint, false);
  assert.strictEqual(state.currentState, 'entering');

  state.transitionStartTime = Date.now() - 1000;
  tick(state);
  assert.strictEqual(state.currentState, 'resting');
  assert.strictEqual(state.isLooping, true);
  assert.strictEqual(state.isMidpoint, false);
  assert.strictEqual(state.currentFrameIndex, 0);
});

test('T004 midpoint: companion.activate during midpoint resting cancels auto-exit', () => {
  const state = createInitialState();
  processEvent(state, { schemaVersion: 1, event: 'companion.midpoint', eventId: 'mp-c2' });
  state.transitionStartTime = Date.now() - 1000;
  tick(state);
  assert.strictEqual(state.currentState, 'resting');
  assert.strictEqual(state.isMidpoint, true);

  processEvent(state, { schemaVersion: 1, event: 'companion.activate', eventId: 'act-c2' });
  assert.strictEqual(state.isMidpoint, false);
  assert.strictEqual(state.currentState, 'resting');
  assert.strictEqual(state.currentFrameIndex, 0);
});

test('T004 midpoint: companion.activate during midpoint exiting cancels auto-exit and re-enters', () => {
  const state = createInitialState();
  processEvent(state, { schemaVersion: 1, event: 'companion.midpoint', eventId: 'mp-c3' });
  state.transitionStartTime = Date.now() - 1000;
  tick(state);
  assert.strictEqual(state.currentState, 'resting');

  processEvent(state, { schemaVersion: 1, event: 'companion.deactivate', eventId: 'de-c1' });
  assert.strictEqual(state.currentState, 'exiting');
  assert.strictEqual(state.isMidpoint, true);

  processEvent(state, { schemaVersion: 1, event: 'companion.activate', eventId: 'act-c3' });
  assert.strictEqual(state.isMidpoint, false);
  assert.strictEqual(state.currentState, 'entering');

  state.transitionStartTime = Date.now() - 1000;
  tick(state);
  assert.strictEqual(state.currentState, 'resting');
  assert.strictEqual(state.isLooping, true);
  assert.strictEqual(state.isMidpoint, false);
});
