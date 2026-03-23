# 🍽️ 食物卡路里分析器

一款基于 AI 的食物卡路里分析工具，上传食物图片即可自动识别食物种类、估算重量并计算卡路里。

## 功能特性

- 📸 **图片分析** - 支持上传多张食物图片，AI 自动识别
- 🔍 **智能识别** - 识别食物名称、估算重量、计算卡路里
- 💬 **追问修正** - 支持文字追问，修正分析结果
- 📱 **响应式设计** - 完美适配手机、平板、电脑
- 🐳 **容器部署** - GitHub 自动构建 Docker 镜像，run.claw.cloud 直接拉取运行

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

## 部署到 run.claw.cloud

本项目只保留这一种部署方式：

1. GitHub Actions 构建 Docker 镜像并推送到 GHCR
2. run.claw.cloud 从 GHCR 拉取镜像并运行
3. run.claw.cloud 挂载持久硬盘保存上传文件
4. 浏览器以 multipart 方式上传文件到应用
5. 后端只接收文件 URL 并调用 AI

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
4. 容器端口：`10000`
5. 健康检查路径：`/health`
6. 环境变量：
    - `AI_API_KEY` = 你的 Kimi API Key
    - `AI_BASE_URL` = `https://api.moonshot.cn/v1`
    - `AI_MODEL_NAME` = `kimi-k2.5`
    - `BODY_LIMIT` = `25mb`
    - `MAX_UPLOAD_BYTES` = `26214400`
    - `UPLOAD_DIR` = `/data/uploads`
    - `UPLOAD_TTL_HOURS` = `24`
    - `UPLOAD_CLEANUP_INTERVAL_MINUTES` = `60`
7. 部署

详细步骤见 [CLAWCLOUD_SETUP.md](./CLAWCLOUD_SETUP.md)

### 为什么之前会偶发 503，尤其是 iPhone 上传

这类 503 在 run.claw.cloud 上通常不是前端页面本身坏了，而是容器在代理层看起来“不健康”了。你这个项目里最容易触发的点有两个：

1. **上传体积过大**：前端直接把原图/视频转成 base64 放进 JSON，请求体会再膨胀一轮；iPhone 照片原始体积常常更大。
2. **容器健康检查不明确**：之前没有专门的 `/health`，平台更难稳定判断服务是否已就绪。

当前版本已经做了这些处理：

- 增加 `/health` 健康检查接口
- 文件改为 `multipart/form-data` 上传到 run.claw.cloud 挂载盘
- 服务端不再接收 base64 大包，只保存文件并传 URL 给分析接口
- 前端上传前自动压缩大图，优先缓解 iPhone 上传失败
- 自动清理过期上传文件，避免 1GB 挂载盘被慢慢占满

如果你在 run.claw.cloud 上仍然偶发 503，优先检查：

- 应用端口是否配置为 `10000`
- 健康检查是否指向 `/health`
- 容器内存是否过小
- 挂载盘是否已挂到 `UPLOAD_DIR`（默认 `/data/uploads`）
- 是否还在上传超大的视频

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
├── server.js         # Docker / run.claw.cloud 服务入口
├── Dockerfile        # 容器部署文件
└── package.json      # 依赖声明
```

## 技术栈

- **前端**: 原生 HTML + CSS + JavaScript
- **后端**: Node.js + Express
- **AI**: Moonshot AI (Kimi)
- **部署**: GitHub Actions + GHCR + run.claw.cloud

## 注意事项

1. **API Key 安全**: 不要把真实的 API Key 提交到 GitHub，使用环境变量管理
2. **图片大小**: iPhone 上传时建议优先使用图片，避免超长视频；系统会自动压缩大图
3. **网络要求**: 需要能够访问 Moonshot AI API（国内网络通常可直连）

## License

MIT
