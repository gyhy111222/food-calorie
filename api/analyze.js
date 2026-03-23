/**
 * POST /api/analyze - 食物图片分析
 */
const { createOpenAIClient, buildUserContent, resolveModelConfig, parseAIResponse, normalizeFoodItems } = require('./chat');

const AI_PROMPT_NO_WEIGHT = `你是一个专业的营养师和食物识别专家。请仔细观察用户提供的食物图片，逐一识别所有食材，并估算每份的重量。

分析要求：
1. 逐一识别图中所有食物/食材，不要遗漏
2. 根据盘子大小、食物堆叠厚度、常见份量等经验估算每项的重量（克）
3. 给出每项每100克的热量（大卡），并按估算重量计算每项总热量
4. 标注每项的烹饪方式（如蒸煮、红烧、清炒、油炸、水煮、生食、烘焙等）
5. 为每项添加简短备注（如营养特点、注意事项）
6. 对于每项食材，给出你识别时的其他候选名称（alternatives），即你不太确定但有可能的食材名称，方便用户选择修正
7. 标注每项的识别置信度（confidence）：high（很有把握）、medium（比较确定但可能有偏差）、low（不太确定，候选项更有参考价值）
8. 汇总所有食材的总热量
9. 给出膳食搭配建议和健康提示

请严格以JSON格式返回，字段如下：
{
  "foodItems": [
    {
      "name": "食材名称",
      "estimatedWeight": 估算重量数字(克，不要带单位),
      "caloriesPer100g": 每100克热量数字(不要带单位),
      "totalCalories": 按估算重量算的总热量数字(大卡，不要带单位),
      "cookingMethod": "烹饪方式",
      "note": "简短备注，如营养特点",
      "confidence": "high/medium/low",
      "alternatives": ["候选食材1", "候选食材2"]
    }
  ],
  "totalCalories": 所有食材总热量数字(大卡，不要带单位),
  "totalWeight": 所有食材总重量数字(克，不要带单位),
  "servingSuggestion": "膳食搭配建议",
  "warnings": "健康提示（如无特殊可写'无'）"
}

注意：
- alternatives 数组列出2-3个你认为有可能的其他食材名称，如果没有就留空数组 []
- confidence 根据你的把握程度填 high/medium/low，对于从图片难以分辨的食材填 low
- 只返回JSON，不要有其他内容。`;

const AI_PROMPT_WITH_WEIGHT = `你是一个专业的营养师和食物识别专家。请仔细观察用户提供的食物图片，逐一识别所有食材，并按用户给出的重量计算营养信息。

分析要求：
1. 逐一识别图中所有食物/食材，不要遗漏
2. 用户提供了食物总重量，请合理分配到各食材
3. 给出每项每100克的热量（大卡），并按分配的重量计算每项总热量
4. 标注每项的烹饪方式（如蒸煮、红烧、清炒、油炸、水煮、生食、烘焙等）
5. 为每项添加简短备注（如营养特点、注意事项）
6. 对于每项食材，给出你识别时的其他候选名称（alternatives），即你不太确定但有可能的食材名称
7. 标注每项的识别置信度（confidence）：high（很有把握）、medium（比较确定但可能有偏差）、low（不太确定）
8. 汇总所有食材的总热量
9. 给出膳食搭配建议和健康提示

用户输入的食物总重量：{weight}克

请严格以JSON格式返回，字段如下：
{
  "foodItems": [
    {
      "name": "食材名称",
      "estimatedWeight": 分配的重量数字(克，不要带单位),
      "caloriesPer100g": 每100克热量数字(不要带单位),
      "totalCalories": 按重量算的总热量数字(大卡，不要带单位),
      "cookingMethod": "烹饪方式",
      "note": "简短备注",
      "confidence": "high/medium/low",
      "alternatives": ["候选食材1", "候选食材2"]
    }
  ],
  "totalCalories": 所有食材总热量数字(大卡，不要带单位),
  "totalWeight": 总重量数字(克，不要带单位),
  "servingSuggestion": "膳食搭配建议",
  "warnings": "健康提示（如无特殊可写'无'）"
}

注意：
- alternatives 数组列出2-3个你认为有可能的其他食材名称，如果没有就留空数组 []
- 只返回JSON，不要有其他内容。`;

const MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 295000; // 适配 run.claw.cloud 长请求，避免分析过程过早超时

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: '仅支持 POST' });

  try {
    const { images, videos, model, customConfig } = req.body || {};
    let weight = req.body?.weight;

    if ((!images || images.length === 0) && (!videos || videos.length === 0)) {
      return res.status(400).json({ success: false, error: '请至少上传一张图片或一段视频' });
    }

    weight = (weight && weight > 0 && weight <= 10000) ? weight : 0;
    const hasWeight = weight > 0;

    const aiConfig = resolveModelConfig(req.body);
    if (!aiConfig) {
      return res.status(400).json({
        success: false,
        error: '未配置 AI 模型。请在环境变量设置 AI_API_KEY，或使用自定义模型配置。'
      });
    }

    const systemPrompt = hasWeight
      ? AI_PROMPT_WITH_WEIGHT.replace('{weight}', weight)
      : AI_PROMPT_NO_WEIGHT;

    const userContent = buildUserContent(images, videos);

    const client = await createOpenAIClient(aiConfig);

    const response = await client.chat.completions.create({
      model: aiConfig.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      max_tokens: MAX_TOKENS,
      temperature: 0.7
    }, { timeout: REQUEST_TIMEOUT_MS });

    const resultText = response.choices[0]?.message?.content || '';
    const parsed = parseAIResponse(resultText);

    const foodItems = normalizeFoodItems(parsed.foodItems);

    const data = {
      foodItems,
      totalCalories: parseFloat(parsed.totalCalories) || foodItems.reduce((s, i) => s + i.totalCalories, 0),
      totalWeight: parseFloat(parsed.totalWeight) || foodItems.reduce((s, i) => s + i.estimatedWeight, 0),
      servingSuggestion: parsed.servingSuggestion || '',
      warnings: parsed.warnings || ''
    };

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[/api/analyze]', err.message);
    return res.status(500).json({ success: false, error: err.message || '分析失败，请重试' });
  }
};
