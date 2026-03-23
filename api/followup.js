/**
 * POST /api/followup - 追问/修正
 */
const { createOpenAIClient, buildUserContent, resolveModelConfig, parseAIResponse, normalizeFoodItems } = require('./chat');

const AI_PROMPT_FOLLOWUP = `你是一个专业的营养师和食物识别专家。用户对你之前的分析结果提出了修改意见或追问。

以下是之前的分析结果：
{previousResult}

用户的修改意见或追问：
{userFollowup}

请仔细重新观察用户提供的食物图片，结合用户的修改意见，重新全面分析：

重要原则：
1. 如果用户要求替换某个食材（如"把红烧牛肉改成杏鲍菇炒牛肉"），不仅要替换该食材的热量数据，还要结合图片重新判断：新食材的合理份量是多少、其他食材的比例是否需要调整、烹饪方式是否因此变化
2. 修改一个食材可能影响其他食材的重量分配和总热量，请重新观察图片中的比例关系，确保所有食材的重量加总合理
3. 如果用户对某项份量有疑问，请重新观察图片中该食材与其他食材的面积/体积比例，给出更准确的估算
4. 即使只修改了一项，也要重新审视整份餐食的膳食搭配建议是否仍然适用
5. 更新所有受影响的数据

请严格以JSON格式返回，字段如下：
{
  "foodItems": [
    {
      "name": "食材名称",
      "estimatedWeight": 重量数字(克，不要带单位),
      "caloriesPer100g": 每100克热量数字(不要带单位),
      "totalCalories": 总热量数字(大卡，不要带单位),
      "cookingMethod": "烹饪方式",
      "note": "简短备注",
      "confidence": "high/medium/low",
      "alternatives": ["候选食材1", "候选食材2"]
    }
  ],
  "totalCalories": 所有食材总热量数字(大卡，不要带单位),
  "totalWeight": 所有食材总热量数字(克，不要带单位),
  "servingSuggestion": "膳食搭配建议",
  "warnings": "健康提示（如无特殊可写'无'）"
}

只返回JSON，不要有其他内容。`;

const MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 295000; // 适配 run.claw.cloud 长请求，避免追问过程过早超时

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: '仅支持 POST' });

  try {
    const { images, videos, previousResult, followupText, model, customConfig } = req.body || {};

    if (!followupText?.trim()) {
      return res.status(400).json({ success: false, error: '请输入修改意见或追问内容' });
    }
    if (!previousResult) {
      return res.status(400).json({ success: false, error: '无历史分析结果，请先上传图片进行分析' });
    }

    const aiConfig = resolveModelConfig(req.body);
    if (!aiConfig) {
      return res.status(400).json({
        success: false,
        error: '未配置 AI 模型'
      });
    }

    const systemPrompt = AI_PROMPT_FOLLOWUP
      .replace('{previousResult}', JSON.stringify(previousResult, null, 2))
      .replace('{userFollowup}', followupText);

    const userContent = await buildUserContent(images, videos);
    userContent.unshift({
      type: 'text',
      text: '以下是该餐食的原图（用于重新分析参考）：'
    });

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
    console.error('[/api/followup]', err.message);
    return res.status(500).json({ success: false, error: err.message || '追问失败，请重试' });
  }
};
