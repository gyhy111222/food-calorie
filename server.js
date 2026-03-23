/**
 * 食物热量分析器 - Express 服务器（Docker / ClawCloud Run）
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { PUBLIC_PREFIX, getUploadRoot, startCleanupScheduler } = require('./api/disk');

const app = express();
const PORT = process.env.PORT || 10000;
const BODY_LIMIT = process.env.BODY_LIMIT || '25mb';
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 310000);

app.use(cors());
app.use(express.json({ limit: BODY_LIMIT }));

app.use((req, res, next) => {
  req.setTimeout(REQUEST_TIMEOUT_MS);
  res.setTimeout(REQUEST_TIMEOUT_MS);
  next();
});

// 静态文件
app.use(express.static(path.join(__dirname)));
app.use(PUBLIC_PREFIX, express.static(getUploadRoot()));
startCleanupScheduler();

// 健康检查（供 ClawCloud 健康探针使用）
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

// 首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
// API 路由
// ============================================================

// config 接口
const configModule = require('./api/config');
app.get('/api/config', (req, res) => configModule(req, res));
app.options('/api/config', (req, res) => { res.status(200).end(); });

// upload 接口
const uploadModule = require('./api/upload-multipart');
app.post('/api/upload', async (req, res) => {
  try {
    await uploadModule(req, res);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.options('/api/upload', (req, res) => { res.status(200).end(); });

// analyze 接口
const analyzeModule = require('./api/analyze');
app.post('/api/analyze', async (req, res) => {
  try {
    await analyzeModule(req, res);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.options('/api/analyze', (req, res) => { res.status(200).end(); });

// followup 接口
const followupModule = require('./api/followup');
app.post('/api/followup', async (req, res) => {
  try {
    await followupModule(req, res);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.options('/api/followup', (req, res) => { res.status(200).end(); });

// ============================================================
// Docker / ClawCloud 启动
// ============================================================

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: '上传内容过大，请减少图片数量或使用压缩后的图片重试'
    });
  }

  if (err) {
    console.error('[server]', err.message);
    return res.status(500).json({ success: false, error: '服务器处理请求时出错，请稍后重试' });
  }

  next();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🍽️  食物热量分析器已启动\n`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://0.0.0.0:${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/health\n`);
  console.log(`  Timeout: ${REQUEST_TIMEOUT_MS}ms\n`);
});

module.exports = app;
