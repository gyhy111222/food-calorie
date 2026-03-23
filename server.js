/**
 * 食物热量分析器 - Express 服务器（适配 Vercel 和独立 Docker 部署）
 * Vercel：api/ 目录下的函数会被 Vercel 自动映射为 /api/* 路由
 * 独立运行：node server.js 直接启动 Express 服务
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));

// 静态文件（Vercel 和独立部署均支持）
app.use(express.static(path.join(__dirname)));

// 首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
// API 路由（适配 Vercel Functions 和独立 Express）
// ============================================================

// config 接口
const configModule = require('./api/config');
app.get('/api/config', (req, res) => configModule(req, res));
app.options('/api/config', (req, res) => { res.status(200).end(); });

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
// 独立部署启动（Vercel 环境不会执行这段）
// ============================================================
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL === undefined) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  🍽️  食物热量分析器已启动\n`);
    console.log(`  Local:   http://localhost:${PORT}`);
    console.log(`  Network: http://0.0.0.0:${PORT}\n`);
  });
}

module.exports = app;
