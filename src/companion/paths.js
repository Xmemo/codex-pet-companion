const path = require('path');

const HOME = process.env.CODEX_TIMER_OVERLAY_HOME || process.env.HOME || '/tmp';
const URD_STATE_DIR = path.join(HOME, '.codex/ultradian-rhythm');
const COMPANION_PID_PATH = path.join(URD_STATE_DIR, 'companion.pid');
const COMPANION_BUILD_PATH = path.join(URD_STATE_DIR, 'companion-build');
const COMPANION_BUILTIN_CACHE_PATH = path.join(COMPANION_BUILD_PATH, 'builtin-cache');
const COMPANION_CONFIG_PATH = path.join(URD_STATE_DIR, 'companion-config.json');
const COMPANION_BINARY = path.join(COMPANION_BUILD_PATH, 'companion_renderer');
const COMPANION_STATUS_PATH = path.join(URD_STATE_DIR, 'companion-status.json');
const COMPANION_READY_PATH = path.join(URD_STATE_DIR, 'companion-ready.json');
const PETS_ROOT = path.join(HOME, '.codex/pets');
const CODEX_CONFIG_PATH = path.join(HOME, '.codex/config.toml');
const GLOBAL_STATE_PATH = path.join(HOME, '.codex/.codex-global-state.json');

const COMPANION_PANEL_PREF_PATH = path.join(URD_STATE_DIR, 'panel-preferences.json');

module.exports = {
  HOME,
  URD_STATE_DIR,
  COMPANION_PID_PATH,
  COMPANION_STATUS_PATH,
  COMPANION_READY_PATH,
  COMPANION_BUILD_PATH,
  COMPANION_BUILTIN_CACHE_PATH,
  COMPANION_CONFIG_PATH,
  COMPANION_BINARY,
  PETS_ROOT,
  CODEX_CONFIG_PATH,
  GLOBAL_STATE_PATH,
  COMPANION_PANEL_PREF_PATH,
};
