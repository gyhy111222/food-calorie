/**
 * GET /api/config - 返回服务器端是否已配置默认模型
 */
const { getDiskStatus } = require('./disk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const hasDefaultModel = !!(process.env.AI_API_KEY);
  const diskStatus = getDiskStatus();
  return res.status(200).json({
    hasDefaultModel,
    uploadEnabled: diskStatus.enabled,
    hint: hasDefaultModel
      ? '已使用环境变量配置的默认模型'
      : '未配置默认模型，请使用自定义模型配置',
    uploadHint: diskStatus.enabled
      ? `上传目录已就绪：${diskStatus.root}`
      : `上传目录不可用：${diskStatus.root}`
  });
};
