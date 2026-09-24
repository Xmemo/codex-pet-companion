const fs = require('fs');
const path = require('path');
const companionPaths = require('./paths.js');
const builtinPetProvider = require('./builtin-pet-provider.js');

const REQUIRED_PET_FIELDS = ['id', 'displayName', 'description', 'spritesheetPath'];
const STANDARD_ATLAS_WIDTH = 1536;
const STANDARD_CELL_HEIGHT = 208;
const MIN_ATLAS_HEIGHT = 1872;
const MIN_ROWS = 9;
const MAX_ROWS = 9;

function validateNotEmpty(value, fieldName) {
  if (value === undefined || value === null) return `${fieldName} is missing`;
  if (typeof value === 'string' && value.trim() === '') return `${fieldName} is empty`;
  return null;
}

function parsePetManifest(petDir, petJson, expectedPetIdOrOptions) {
  const errors = [];
  for (const field of REQUIRED_PET_FIELDS) {
    const err = validateNotEmpty(petJson[field], field);
    if (err) errors.push(err);
  }
  if (errors.length > 0) return { valid: false, errors };

  let expectedPetId = null;
  if (typeof expectedPetIdOrOptions === 'string') {
    expectedPetId = expectedPetIdOrOptions;
  } else if (expectedPetIdOrOptions && typeof expectedPetIdOrOptions === 'object') {
    expectedPetId = expectedPetIdOrOptions.expectedPetId || null;
  }

  if (expectedPetId) {
    if (petJson.id !== expectedPetId) {
      return { valid: false, errors: [`pet.json id "${petJson.id}" does not match expected id "${expectedPetId}"`] };
    }
  } else {
    const dirId = path.basename(petDir);
    if (petJson.id !== dirId) {
      return { valid: false, errors: [`pet.json id "${petJson.id}" does not match normalized directory id "${dirId}"`] };
    }
  }

  const spritesheetPath = petJson.spritesheetPath;
  const sec = validatePathSecurity(spritesheetPath, petDir);
  if (!sec.safe) {
    return { valid: false, errors: [`spritesheetPath security: ${sec.reason}`] };
  }
  const absSpritesheet = sec.resolved;

  if (!fs.existsSync(absSpritesheet)) {
    return { valid: false, errors: [`spritesheet not found: ${spritesheetPath}`] };
  }

  const stat = fs.statSync(absSpritesheet);
  if (!stat.isFile()) {
    return { valid: false, errors: ['spritesheetPath must be a regular file'] };
  }

  return {
    valid: true,
    pet: {
      id: petJson.id,
      displayName: petJson.displayName,
      description: petJson.description,
      spritesheetPath,
      spritesheetFullPath: absSpritesheet,
      spriteVersionNumber: petJson.spriteVersionNumber || null,
    },
  };
}

function validateAtlasDimensions(width, height) {
  const errors = [];
  if (width !== STANDARD_ATLAS_WIDTH) {
    errors.push(`Atlas width must be ${STANDARD_ATLAS_WIDTH}, got ${width}`);
  }
  if (height < MIN_ATLAS_HEIGHT) {
    errors.push(`Atlas height must be >= ${MIN_ATLAS_HEIGHT}, got ${height}`);
  }
  if (height % STANDARD_CELL_HEIGHT !== 0) {
    errors.push(`Atlas height must be divisible by ${STANDARD_CELL_HEIGHT}, got ${height}`);
  }
  if (errors.length > 0) {
    return { valid: false, errors, columns: 0, rows: 0 };
  }

  const columns = width / 192;
  const rows = height / STANDARD_CELL_HEIGHT;

  return {
    valid: true,
    errors: [],
    columns,
    rows,
    cellWidth: 192,
    cellHeight: STANDARD_CELL_HEIGHT,
  };
}

function getRowMapping(rows) {
  const rowNames = [
    'idle', 'running-right', 'running-left', 'waving', 'jumping',
    'failed', 'waiting', 'running', 'review',
  ];
  const mapping = {};
  const effectiveRows = rows; // Allow rows >= 9, they are read but rows >= 9 extra mapping row names not standard
  for (let i = 0; i < effectiveRows && i < rowNames.length; i++) {
    mapping[i] = rowNames[i];
  }
  return { mapping, effectiveRows };
}

function validatePathSecurity(filePath, rootDir) {
  if (path.isAbsolute(filePath)) {
    return { safe: false, reason: 'Absolute paths are not allowed' };
  }
  const normalized = filePath.split(path.sep);
  if (normalized.includes('..')) {
    return { safe: false, reason: 'Directory traversal (..) is not allowed' };
  }

  const resolved = path.resolve(rootDir, filePath);
  const relative = path.relative(rootDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { safe: false, reason: 'Path resolves outside pet root' };
  }

  let realResolved;
  try {
    realResolved = fs.realpathSync(resolved);
  } catch (e) {
    return { safe: true, resolved };
  }

  let realRoot;
  try {
    realRoot = fs.realpathSync(rootDir);
  } catch (e) {
    return { safe: false, reason: 'Root directory does not exist' };
  }

  const realRelative = path.relative(realRoot, realResolved);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    return { safe: false, reason: 'Symlink resolves outside pet root' };
  }

  return { safe: true, resolved: realResolved };
}

function readConfigToml(deps = {}) {
  const fsMod = deps.fs || fs;
  const paths = deps.paths || companionPaths;
  try {
    if (!fsMod.existsSync(paths.CODEX_CONFIG_PATH)) return null;
    const content = fsMod.readFileSync(paths.CODEX_CONFIG_PATH, 'utf8');
    const match = content.match(/^\s*selected-avatar-id\s*=\s*"([^"]*)"\s*$/m);
    if (match) return match[1];
    const unquotedMatch = content.match(/^\s*selected-avatar-id\s*=\s*(\S+)\s*$/m);
    if (unquotedMatch) return unquotedMatch[1];
    return null;
  } catch {
    return null;
  }
}

function readCompanionConfigJson(deps = {}) {
  const fsMod = deps.fs || fs;
  const paths = deps.paths || companionPaths;
  try {
    if (!fsMod.existsSync(paths.COMPANION_CONFIG_PATH)) return null;
    const content = fsMod.readFileSync(paths.COMPANION_CONFIG_PATH, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function validatePetId(value) {
  const plain = normalizePetId(value);
  if (!plain) {
    return { valid: false, error: 'Pet ID is empty or invalid' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(plain)) {
    return { valid: false, error: `Invalid pet ID: "${plain}". Must contain only alphanumeric characters, underscores, and hyphens` };
  }
  return { valid: true };
}

function normalizePetId(value) {
  if (typeof value !== 'string') return null;
  let val = value.trim();
  if (val.startsWith('custom:')) {
    val = val.substring(7);
  }
  return val;
}

function checkPathContainment(dirPath, rootPath, fsMod = fs) {
  try {
    if (!fsMod.existsSync(rootPath)) return false;
    const resolvedRoot = fsMod.realpathSync ? fsMod.realpathSync(rootPath) : path.resolve(rootPath);
    if (!fsMod.existsSync(dirPath)) return false;
    const resolvedDir = fsMod.realpathSync ? fsMod.realpathSync(dirPath) : path.resolve(dirPath);
    const relative = path.relative(resolvedRoot, resolvedDir);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  } catch (e) {
    return false;
  }
}

function resolvePetId(deps = {}) {
  const fsMod = deps.fs || fs;
  const paths = deps.paths || companionPaths;

  const result = {
    petId: null,
    source: 'auto',
    available: false,
    petDir: null,
    spritesheetFullPath: null,
    provider: 'custom',
    cacheStatus: 'none',
    error: null,
  };

  const configJson = readCompanionConfigJson(deps);
  let rawManualId = null;
  if (configJson && configJson.petId) {
    rawManualId = configJson.petId;
  }

  let rawId = rawManualId;
  let source = 'manual';

  if (!rawId) {
    source = 'auto';
    rawId = readConfigToml(deps);
  }

  if (!rawId) {
    result.source = source;
    result.error = source === 'manual' ? 'No manual petId found' : 'No selected-avatar-id found in config.toml';
    return result;
  }

  result.source = source;
  const plainId = normalizePetId(rawId);
  if (!plainId || !validatePetId(rawId).valid) {
    result.error = source === 'manual'
      ? `Invalid manual pet ID format: "${rawId}"`
      : `Invalid selected-avatar-id format: "${rawId}"`;
    return result;
  }

  const petDir = path.join(paths.PETS_ROOT, plainId);

  if (fsMod.existsSync(petDir)) {
    result.provider = 'custom';

    if (!checkPathContainment(petDir, paths.PETS_ROOT, fsMod)) {
      result.error = `${source === 'manual' ? 'Manual' : 'Auto'} pet directory escapes pets root: "${plainId}"`;
      return result;
    }

    const petJsonPath = path.join(petDir, 'pet.json');
    if (!fsMod.existsSync(petJsonPath)) {
      result.error = `pet.json not found in pet directory for ID "${plainId}"`;
      return result;
    }

    let petJson;
    try {
      petJson = JSON.parse(fsMod.readFileSync(petJsonPath, 'utf8'));
    } catch (e) {
      result.error = `Failed to parse pet.json: ${e.message}`;
      return result;
    }

    const manifestResult = parsePetManifest(petDir, petJson);
    if (!manifestResult.valid) {
      result.error = manifestResult.errors.join(', ');
      return result;
    }

    result.petId = plainId;
    result.available = true;
    result.petDir = petDir;
    result.spritesheetFullPath = manifestResult.pet.spritesheetFullPath;
    return result;
  }

  // Custom pet directory does NOT exist -> dispatch to built-in provider
  const builtinRes = builtinPetProvider.resolveBuiltinPet(plainId, deps);
  result.petId = plainId;
  result.provider = 'builtin';
  result.available = builtinRes.available;
  result.petDir = builtinRes.petDir || null;
  result.spritesheetFullPath = builtinRes.spritesheetFullPath || null;
  result.cacheStatus = builtinRes.cacheStatus || 'none';
  result.error = builtinRes.error || null;

  return result;
}

module.exports = {
  parsePetManifest,
  validateAtlasDimensions,
  getRowMapping,
  validatePathSecurity,
  resolvePetId,
  readConfigToml,
  validatePetId,
  normalizePetId,
  REQUIRED_PET_FIELDS,
  STANDARD_ATLAS_WIDTH,
  STANDARD_CELL_HEIGHT,
  MIN_ATLAS_HEIGHT,
  MIN_ROWS,
  MAX_ROWS,
};

