const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'storage');
const PUBLIC_PREFIX = '/uploads';
const FILE_TTL_MS = Number(process.env.UPLOAD_TTL_HOURS || 24) * 60 * 60 * 1000;

let cleanupStarted = false;
let cleanupTimer = null;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getUploadRoot() {
  ensureDir(ROOT_DIR);
  return ROOT_DIR;
}

function getKindDir(kind) {
  const dir = path.join(getUploadRoot(), kind === 'video' ? 'videos' : 'images');
  ensureDir(dir);
  return dir;
}

function sanitizeExt(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  return /^[.][a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

function createStoredFileName(fileName) {
  return `${Date.now()}-${crypto.randomUUID()}${sanitizeExt(fileName)}`;
}

function buildPublicUrl(req, kind, fileName) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = forwardedProto || req.protocol || 'https';
  const host = req.get('host');
  return `${proto}://${host}${PUBLIC_PREFIX}/${kind === 'video' ? 'videos' : 'images'}/${fileName}`;
}

function getDiskStatus() {
  try {
    const root = getUploadRoot();
    return { enabled: true, root };
  } catch {
    return { enabled: false, root: ROOT_DIR };
  }
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function removeExpiredFiles(dirPath, now = Date.now()) {
  let removed = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      removed += removeExpiredFiles(fullPath, now);
      const rest = fs.readdirSync(fullPath);
      if (rest.length === 0) {
        fs.rmdirSync(fullPath);
      }
      continue;
    }

    const stat = safeStat(fullPath);
    if (!stat) continue;

    const age = now - stat.mtimeMs;
    if (age >= FILE_TTL_MS) {
      fs.unlinkSync(fullPath);
      removed += 1;
    }
  }

  return removed;
}

function runCleanup() {
  const status = getDiskStatus();
  if (!status.enabled) return 0;

  try {
    const removed = removeExpiredFiles(status.root);
    if (removed > 0) {
      console.log(`[uploads] cleaned ${removed} expired file(s)`);
    }
    return removed;
  } catch (err) {
    console.error('[uploads] cleanup failed:', err.message);
    return 0;
  }
}

function startCleanupScheduler() {
  if (cleanupStarted) return;
  cleanupStarted = true;

  runCleanup();

  const intervalMs = Number(process.env.UPLOAD_CLEANUP_INTERVAL_MINUTES || 60) * 60 * 1000;
  cleanupTimer = setInterval(runCleanup, intervalMs);

  if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }
}

module.exports = {
  PUBLIC_PREFIX,
  getUploadRoot,
  getKindDir,
  createStoredFileName,
  buildPublicUrl,
  getDiskStatus,
  runCleanup,
  startCleanupScheduler
};
