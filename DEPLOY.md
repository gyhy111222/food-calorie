# 食物热量分析器 - Vercel 部署指南

## 文件夹结构

```
vercel-food-calorie/
├── api/
│   ├── analyze.js    # POST /api/analyze - 分析食物热量
│   ├── followup.js  # POST /api/followup - 追问/修正
│   ├── config.js    # GET  /api/config - 查询配置状态
│   └── chat.js      # 共享 AI 调用逻辑
├── index.html       # 主页面
├── styles.css       # 样式文件
├── app.js           # 前端逻辑
├── vercel.json      # Vercel 路由配置
├── package.json     # 依赖
└── .env.example     # 环境变量示例
```

---

## 部署步骤

### 第一步：上传代码到 GitHub

1. 在 GitHub 上创建新仓库（例如 `food-calorie-analyzer`）
2. 将 `vercel-food-calorie` 文件夹内容上传到仓库

### 第二步：连接 Vercel

1. 访问 [vercel.com](https://vercel.com)，用 GitHub 账号登录
2. 点击 **Add New Project**
3. 找到你的 GitHub 仓库，点击 **Import**
4. 在 **Environment Variables** 中添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `AI_API_KEY` | `sk-xxx...` | 你的 Kimi/Moonshot API Key |
| `AI_BASE_URL` | `https://api.moonshot.cn/v1` | API 地址（默认不用改） |
| `AI_MODEL_NAME` | `kimi-k2.5` | 模型名称 |

5. 点击 **Deploy** 等待部署完成（约 1-2 分钟）

### 第三步：访问你的网站

部署成功后，Vercel 会给你一个域名，例如：
```
https://your-project.vercel.app
```

---

## 本地开发调试

```bash
# 1. 进入项目目录
cd vercel-food-calorie

# 2. 安装 Vercel CLI
npm install -g vercel

# 3. 本地运行
vercel dev
```

本地运行后访问 `http://localhost:3000`

---

## 注意事项

1. **Serverless 超时**：Vercel Serverless 函数最大执行时间约 10 秒。AI 分析大图片可能超时，建议图片总大小控制在 5MB 以内。

2. **API Key 安全**：不要把真实的 `AI_API_KEY` 提交到 GitHub！`.env.example` 只是示例。Vercel 会从环境变量读取，GitHub 仓库里不会有真实的 Key。

3. **域名**：Vercel 免费版分配的域名在某些地区可能需要代理访问。
