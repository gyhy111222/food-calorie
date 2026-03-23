/**
 * AI 调用共享模块
 */

const OpenAI = require('openai');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { getUploadRoot, PUBLIC_PREFIX } = require('./disk');

const IMAGE_TARGET_BYTES = Number(process.env.AI_IMAGE_TARGET_BYTES || 200 * 1024);
const IMAGE_MAX_WIDTH = Number(process.env.AI_IMAGE_MAX_WIDTH || 1600);
const IMAGE_MIN_QUALITY = Number(process.env.AI_IMAGE_MIN_QUALITY || 45);
const IMAGE_START_QUALITY = Number(process.env.AI_IMAGE_START_QUALITY || 82);

// 默认模型配置（可配置环境变量覆盖）
const DEFAULT_MODEL_CONFIG = {
  baseURL: process.env.AI_BASE_URL || 'https://api.moonshot.cn/v1',
  apiKey: process.env.AI_API_KEY || '',
  modelName: process.env.AI_MODEL_NAME || 'kimi-k2.5',
  enabled: !!(process.env.AI_API_KEY)
};

async function createOpenAIClient(config) {
  return new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
}

function getMediaValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.url || value.publicUrl || value.base64 || '';
}

/**
 * 将挂载盘 URL 转为 Moonshot 需要的 base64 data URL
 */
async function toModelMediaUrl(value, fallbackMime) {
  const raw = getMediaValue(value);
  if (!raw) return '';

  if (raw.startsWith('data:') || raw.startsWith('ms://')) {
    return raw;
  }

  const url = new URL(raw, 'http://localhost');
  if (!url.pathname.startsWith(PUBLIC_PREFIX + '/')) {
    throw new Error('仅支持已上传到挂载盘的文件');
  }

  const relativePath = decodeURIComponent(url.pathname.slice(PUBLIC_PREFIX.length + 1));
  const fullPath = path.join(getUploadRoot(), relativePath);
  const normalizedRoot = path.resolve(getUploadRoot());
  const normalizedFile = path.resolve(fullPath);

  if (!normalizedFile.startsWith(normalizedRoot)) {
    throw new Error('文件路径非法');
  }

  const mimeType = inferMimeType(normalizedFile, fallbackMime);

  if (mimeType.startsWith('image/')) {
    const fileBuffer = await fs.readFile(normalizedFile);
    const optimized = await compressImageForModel(fileBuffer, mimeType);
    return `data:${optimized.mimeType};base64,${optimized.buffer.toString('base64')}`;
  }

  const fileBuffer = await fs.readFile(normalizedFile);
  return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
}

async function compressImageForModel(inputBuffer, inputMimeType) {
  let pipeline = sharp(inputBuffer, { failOn: 'none' }).rotate();
  const metadata = await pipeline.metadata();

  if ((metadata.width || 0) > IMAGE_MAX_WIDTH) {
    pipeline = pipeline.resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true });
  }

  let quality = IMAGE_START_QUALITY;
  let output = await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();

  while (output.length > IMAGE_TARGET_BYTES && quality > IMAGE_MIN_QUALITY) {
    quality -= 7;
    output = await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  if (output.length > IMAGE_TARGET_BYTES) {
    let width = metadata.width || IMAGE_MAX_WIDTH;
    while (output.length > IMAGE_TARGET_BYTES && width > 640) {
      width = Math.max(640, Math.round(width * 0.85));
      output = await sharp(inputBuffer, { failOn: 'none' })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: IMAGE_MIN_QUALITY, mozjpeg: true })
        .toBuffer();
      if (width === 640) break;
    }
  }

  if (output.length >= inputBuffer.length && inputMimeType === 'image/jpeg') {
    return { buffer: inputBuffer, mimeType: 'image/jpeg' };
  }

  return { buffer: output, mimeType: 'image/jpeg' };
}

function inferMimeType(filePath, fallbackMime) {
  if (fallbackMime) return fallbackMime;

  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.m4v': 'video/mp4'
  };

  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * 构建 AI 消息内容（Moonshot 只接受 base64 / ms://）
 */
async function buildUserContent(images, videos) {
  const content = [];
  if (images && images.length > 0) {
    for (const image of images) {
      const mediaUrl = await toModelMediaUrl(image, 'image/jpeg');
      if (mediaUrl) content.push({ type: 'image_url', image_url: { url: mediaUrl } });
    }
  }
  if (videos && videos.length > 0) {
    for (const video of videos) {
      const mediaUrl = await toModelMediaUrl(video, 'video/mp4');
      if (mediaUrl) content.push({ type: 'video_url', video_url: { url: mediaUrl } });
    }
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
