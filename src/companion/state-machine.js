const VALID_STATES = ['small', 'entering', 'resting', 'exiting'];
const VALID_EVENTS = ['companion.activate', 'companion.deactivate', 'companion.pause', 'companion.midpoint'];

const TRANSITION_ENTER_DURATION_MS = 600;
const TRANSITION_EXIT_DURATION_MS = 400;

function createInitialState() {
  return {
    currentState: 'small',
    isPaused: false,
    transitionStartTime: null,
    transitionDuration: null,
    scaleFactor: 0.0,
    currentFrameIndex: 0,
    animationFps: 8,
    isLooping: false,
    frozenFrame: null,
    processedEventIds: new Set(),
    isMidpoint: false,
  };
}

function validateEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (!VALID_EVENTS.includes(event.event)) return false;
  if (event.schemaVersion !== undefined && event.schemaVersion !== 1) return false;
  return true;
}

function getScaleFactor(state) {
  if (state.currentState === 'small') return 0.0;
  if (state.currentState === 'resting') return 1.0;
  if (state.currentState === 'entering' || state.currentState === 'exiting') {
    if (state.transitionStartTime === null || state.transitionDuration === null) {
      return state.currentState === 'entering' ? 0.0 : 1.0;
    }
    const elapsed = Date.now() - state.transitionStartTime;
    const progress = Math.min(1.0, Math.max(0.0, elapsed / state.transitionDuration));
    if (state.currentState === 'entering') return progress;
    return 1.0 - progress;
  }
  return state.scaleFactor;
}

function transitionTo(state, newState) {
  const prevState = state.currentState;
  state.currentState = newState;
  if (newState === 'entering') {
    state.transitionStartTime = Date.now();
    state.transitionDuration = TRANSITION_ENTER_DURATION_MS;
    state.scaleFactor = 0.0;
    state.currentFrameIndex = 0;
    state.isPaused = false;
    state.frozenFrame = null;
    state.isLooping = false;
  } else if (newState === 'exiting') {
    state.transitionStartTime = Date.now();
    state.transitionDuration = TRANSITION_EXIT_DURATION_MS;
    state.scaleFactor = prevState === 'small' ? 0.0 : 1.0;
    state.isPaused = false;
    state.frozenFrame = state.currentFrameIndex;
    state.isLooping = false;
  } else if (newState === 'resting') {
    state.transitionStartTime = null;
    state.transitionDuration = null;
    state.scaleFactor = 1.0;
    state.currentFrameIndex = 0;
    state.isLooping = true;
    state.isPaused = false;
    state.frozenFrame = null;
  } else if (newState === 'small') {
    state.transitionStartTime = null;
    state.transitionDuration = null;
    state.scaleFactor = 0.0;
    state.currentFrameIndex = 0;
    state.isPaused = false;
    state.frozenFrame = null;
    state.isLooping = false;
  }
}

function processEvent(state, event) {
  if (!validateEvent(event)) return state;

  const eventId = event.eventId;
  if (eventId && typeof eventId === 'string' && eventId.length > 0) {
    if (state.processedEventIds.has(eventId)) {
      return state;
    }
    state.processedEventIds.add(eventId);
    if (state.processedEventIds.size > 1000) {
      const entries = [...state.processedEventIds];
      state.processedEventIds = new Set(entries.slice(-500));
    }
  }

  const evt = event.event;

  if (state.currentState === 'small' && evt === 'companion.activate') {
    state.isMidpoint = false;
    transitionTo(state, 'entering');
  } else if (state.currentState === 'small' && evt === 'companion.midpoint') {
    state.isMidpoint = true;
    transitionTo(state, 'entering');
  } else if (state.currentState === 'entering') {
    if (evt === 'companion.deactivate') {
      transitionTo(state, 'exiting');
    } else if (evt === 'companion.activate' && state.isMidpoint) {
      state.isMidpoint = false;
    }
  } else if (state.currentState === 'resting') {
    if (evt === 'companion.deactivate') {
      transitionTo(state, 'exiting');
    } else if (evt === 'companion.pause') {
      state.isPaused = true;
      state.frozenFrame = state.currentFrameIndex;
    } else if (evt === 'companion.activate') {
      if (state.isMidpoint) {
        state.isMidpoint = false;
      }
      if (state.isPaused) {
        state.isPaused = false;
        state.frozenFrame = null;
      }
    }
  } else if (state.currentState === 'exiting') {
    if (evt === 'companion.activate' && state.isMidpoint) {
      state.isMidpoint = false;
      transitionTo(state, 'entering');
    }
  }

  if (event.frameIndex !== undefined && !state.isPaused && state.currentState !== 'exiting') {
    state.currentFrameIndex = event.frameIndex;
  }

  state.scaleFactor = getScaleFactor(state);
  return state;
}

function tick(state) {
  if (state.currentState === 'entering') {
    const elapsed = Date.now() - state.transitionStartTime;
    if (elapsed >= TRANSITION_ENTER_DURATION_MS) {
      transitionTo(state, 'resting');
    }
  } else if (state.currentState === 'exiting') {
    const elapsed = Date.now() - state.transitionStartTime;
    if (elapsed >= TRANSITION_EXIT_DURATION_MS) {
      transitionTo(state, 'small');
    }
  }
  state.scaleFactor = getScaleFactor(state);
  return state;
}

function setFrameIndex(state, index) {
  state.currentFrameIndex = index;
  if (state.isPaused) {
    state.frozenFrame = index;
  }
  return state;
}

function getStatus(state) {
  return {
    engineState: state.currentState,
    isPaused: state.isPaused,
    scaleFactor: state.scaleFactor,
    currentFrame: state.currentFrameIndex,
    fps: state.animationFps,
    isLooping: state.isLooping,
    frozenFrame: state.frozenFrame,
  };
}

module.exports = {
  createInitialState,
  processEvent,
  tick,
  setFrameIndex,
  getStatus,
  getScaleFactor,
  VALID_STATES,
  VALID_EVENTS,
  TRANSITION_ENTER_DURATION_MS,
  TRANSITION_EXIT_DURATION_MS,
};
