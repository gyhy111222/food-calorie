const path = require('path');
const multer = require('multer');
const { getKindDir, createStoredFileName, buildPublicUrl } = require('./disk');

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024);

function getKind(req) {
  const raw = req.query.kind || req.body?.kind;
  return raw === 'video' ? 'video' : 'image';
}

function createUploader(req) {
  return multer({
    storage: multer.diskStorage({
      destination: (innerReq, file, cb) => cb(null, getKindDir(getKind(req))),
      filename: (innerReq, file, cb) => cb(null, createStoredFileName(file.originalname))
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter: (innerReq, file, cb) => {
      const kind = getKind(req);
      if (kind === 'image' && !file.mimetype.startsWith('image/')) return cb(new Error('图片类型不正确'));
      if (kind === 'video' && !file.mimetype.startsWith('video/')) return cb(new Error('视频类型不正确'));
      cb(null, true);
    }
  }).single('file');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: '仅支持 POST' });

  const upload = createUploader(req);
  upload(req, res, err => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, error: '文件过大，请压缩后重试' });
      }
      return res.status(400).json({ success: false, error: err.message || '上传失败' });
    }

    if (err) {
      return res.status(400).json({ success: false, error: err.message || '上传失败' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: '缺少文件' });
    }

    const kind = getKind(req);
    return res.status(200).json({
      success: true,
      data: {
        name: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        path: req.file.path,
        fileName: path.basename(req.file.path),
        url: buildPublicUrl(req, kind, path.basename(req.file.path))
      }
    });
  });
};
