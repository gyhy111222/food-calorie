# 🍽️ 食物卡路里分析器

一款基于 AI 的食物卡路里分析工具，上传食物图片即可自动识别食物种类、估算重量并计算卡路里。

## 功能特性

- 📸 **图片分析** - 支持上传多张食物图片，AI 自动识别
- 🔍 **智能识别** - 识别食物名称、估算重量、计算卡路里
- 💬 **追问修正** - 支持文字追问，修正分析结果
- 📱 **响应式设计** - 完美适配手机、平板、电脑
- 🌐 **多平台部署** - 支持 Vercel、Render 等平台

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/你的用户名/vercel-food-calorie.git
cd vercel-food-calorie
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env`，填入你的 API Key：

```bash
cp .env.example .env
```

编辑 `.env` 文件：
```
AI_API_KEY=你的Kimi API Key
AI_BASE_URL=https://api.moonshot.cn/v1
AI_MODEL_NAME=kimi-k2.5
```

### 4. 本地运行

```bash
npm start
```

访问 `http://localhost:3000`

---

## 部署到 ClawCloud Run

ClawCloud Run 是容器原生平台，**无超时限制**，适合 AI 图像分析等耗时的任务。

### 使用 GitHub Container Registry (GHCR)

**第一步**：推送代码到 GitHub

```bash
git push origin main
```

GitHub Actions 会自动构建镜像并推送到：
```
ghcr.io/你的用户名/food-calorie:latest
```

**第二步**：在 ClawCloud Run 部署

1. 登录 [run.claw.cloud](https://run.claw.cloud)
2. 创建应用 → **容器 (Container)**
3. 镜像地址：`ghcr.io/你的用户名/food-calorie:latest`
4. 端口：`3000`
5. 环境变量：
   - `AI_API_KEY` = 你的 Kimi API Key
   - `AI_BASE_URL` = `https://api.moonshot.cn/v1`
   - `AI_MODEL_NAME` = `kimi-k2.5`
6. 部署

详细步骤见 [CLAWCLOUD_SETUP.md](./CLAWCLOUD_SETUP.md)

> ClawCloud Run 基于容器，没有 Serverless 超时限制，AI 分析多久都没问题。

---

## 部署到 Vercel

Vercel 提供 Serverless 部署，但有 10 秒超时限制，适合轻量使用。

**第一步**：Fork 本仓库到你的 GitHub 账号

**第二步**：登录 [vercel.com](https://vercel.com)，点击 **Add New Project**

**第三步**：导入你的 GitHub 仓库 `vercel-food-calorie`

**第四步**：在 **Environment Variables** 中添加：
- `AI_API_KEY` = 你的 Kimi API Key
- `AI_BASE_URL` = `https://api.moonshot.cn/v1`
- `AI_MODEL_NAME` = `kimi-k2.5`

**第五步**：点击 **Deploy**

Vercel 会分配一个 `.vercel.app` 域名，直接访问即可使用。

---

## 项目结构

```
├── api/
│   ├── analyze.js    # POST /api/analyze  食物分析接口
│   ├── followup.js   # POST /api/followup 追问修正接口
│   ├── config.js     # GET  /api/config   配置查询接口
│   └── chat.js       # AI 调用共享模块
├── index.html        # 主页面
├── styles.css        # 样式（含手机/平板/PC响应式）
├── app.js            # 前端逻辑
├── server.js         # 本地/Render 服务器入口
├── vercel.json       # Vercel 路由配置
├── render.yaml       # Render 部署配置
├── Dockerfile        # 容器部署文件
└── package.json      # 依赖声明
```

## 技术栈

- **前端**: 原生 HTML + CSS + JavaScript
- **后端**: Node.js + Express
- **AI**: Moonshot AI (Kimi)
- **部署**: Vercel / Render

## 注意事项

1. **API Key 安全**: 不要把真实的 API Key 提交到 GitHub，使用环境变量管理
2. **图片大小**: 建议单张图片不超过 5MB，以保证分析速度
3. **网络要求**: 需要能够访问 Moonshot AI API（国内网络通常可直连）

## License

MIT
