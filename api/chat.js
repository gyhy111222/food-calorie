/**
 * Vercel Serverless Functions 共享 AI 调用模块
 */

const OpenAI = require('openai');

// 默认模型配置（可配置环境变量覆盖）
const DEFAULT_MODEL_CONFIG = {
  baseURL: process.env.AI_BASE_URL || 'https://api.moonshot.cn/v1',
  apiKey: process.env.AI_API_KEY || '',
  modelName: process.env.AI_MODEL_NAME || 'kimi-k2.5',
  enabled: !!(process.env.AI_API_KEY)
};

// Serverless 下超时约 10s，用 Vercel streaming 需特殊处理
const MAX_TIMEOUT_MS = 8 * 1000; // 留 2s 余地给响应处理

async function createOpenAIClient(config) {
  return new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
}

/**
 * 构建 AI 消息内容（支持多图/视频 base64）
 */
function buildUserContent(images, videos) {
  const content = [];
  if (images && images.length > 0) {
    for (const b64 of images) content.push({ type: 'image_url', image_url: { url: b64 } });
  }
  if (videos && videos.length > 0) {
    for (const b64 of videos) content.push({ type: 'image_url', image_url: { url: b64 } });
  }
  return content;
}

/**
 * 获取模型配置（支持自定义覆盖）
 */
function resolveModelConfig(body) {
  if (body.model === 'custom' && body.customConfig &&
      body.customConfig.baseURL && body.customConfig.apiKey && body.customConfig.modelName) {
    return body.customConfig;
  }
  if (!DEFAULT_MODEL_CONFIG.enabled || !DEFAULT_MODEL_CONFIG.apiKey) {
    return null;
  }
  return {
    baseURL: DEFAULT_MODEL_CONFIG.baseURL,
    apiKey: DEFAULT_MODEL_CONFIG.apiKey,
    modelName: DEFAULT_MODEL_CONFIG.modelName
  };
}

/**
 * 解析 AI 返回的 JSON
 */
function parseAIResponse(resultText) {
  let jsonStr = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(jsonStr);
}

/**
 * 整理 foodItems，确保字段完整
 */
function normalizeFoodItems(items) {
  return (items || []).map(item => ({
    name: item.name || '未知',
    estimatedWeight: parseFloat(item.estimatedWeight) || 0,
    caloriesPer100g: parseFloat(item.caloriesPer100g) || 0,
    totalCalories: parseFloat(item.totalCalories) ||
      Math.round((parseFloat(item.caloriesPer100g) || 0) * (parseFloat(item.estimatedWeight) || 0) / 100),
    cookingMethod: item.cookingMethod || '-',
    note: item.note || '',
    confidence: ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'medium',
    alternatives: Array.isArray(item.alternatives)
      ? item.alternatives.map(a => String(a).trim()).filter(Boolean)
      : []
  }));
}

module.exports = {
  createOpenAIClient,
  buildUserContent,
  resolveModelConfig,
  parseAIResponse,
  normalizeFoodItems,
  DEFAULT_MODEL_CONFIG
};
