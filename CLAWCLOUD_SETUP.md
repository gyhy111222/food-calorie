# run.claw.cloud 部署指南（使用 GHCR 镜像）

## 方案说明

使用 GitHub Actions 自动构建 Docker 镜像并推送到 **GitHub Container Registry (GHCR)**，然后在 run.claw.cloud 直接拉取部署。

**优点**：
- 不需要额外自建镜像仓库
- 镜像存储在 GitHub，和代码在一起管理
- run.claw.cloud 可以直接拉取 GHCR 镜像运行

---

## 第一步：启用 GitHub Packages

1. 打开 GitHub 仓库页面
2. 点击 **Settings** → **Packages**
3. 确保 **Packages** 功能已启用

---

## 第二步：推送代码触发构建

将代码推送到 GitHub，GitHub Actions 会自动构建并推送镜像到 GHCR：

```bash
git add .
git commit -m "setup GitHub Actions for Docker build"
git push origin main
```

推送后：
1. 到 GitHub 仓库的 **Actions** 标签页查看构建进度
2. 构建完成后，到 **Packages** 标签页查看镜像

镜像地址格式：
```
ghcr.io/你的用户名/food-calorie:latest
```

---

## 第三步：设置镜像为公开（可选）

如果希望 run.claw.cloud 无需认证就能拉取：

1. 打开 GitHub 仓库 → **Packages**
2. 点击 `food-calorie` 镜像
3. 点击 **Package settings**
4. 在 **Danger Zone** 下方，将 **Visibility** 改为 **Public**

或者保持 Private，在 run.claw.cloud 配置 GitHub 登录凭证。

---

## 第四步：在 run.claw.cloud 部署

1. 登录 [run.claw.cloud](https://run.claw.cloud)
2. 点击 **创建应用** → 选择 **Deploy from Docker / 容器**
3. 填写部署信息：
    - **镜像地址**: `ghcr.io/你的用户名/food-calorie:latest`
    - **容器端口**: `10000`
    - **健康检查路径**: `/health`
    - **挂载硬盘**: 挂载 1GB 持久盘到 `/data/uploads`
    - **环境变量**:
      - `AI_API_KEY` = 你的 Kimi API Key
      - `AI_BASE_URL` = `https://api.moonshot.cn/v1`
      - `AI_MODEL_NAME` = `kimi-k2.5`
      - `BODY_LIMIT` = `25mb`
      - `MAX_UPLOAD_BYTES` = `26214400`
      - `UPLOAD_DIR` = `/data/uploads`
      - `UPLOAD_TTL_HOURS` = `24`
      - `UPLOAD_CLEANUP_INTERVAL_MINUTES` = `60`
4. 如果镜像是 Private，需要配置 **镜像拉取凭证**：
    - 用户名：你的 GitHub 用户名
    - 密码：GitHub Personal Access Token（需要有 `read:packages` 权限）
5. 点击 **部署**

建议：

- 最少给容器分配足够内存，避免上传时 OOM 后被平台判定不健康
- 持久盘挂载目录要与 `UPLOAD_DIR` 一致
- 如果你主要是手机上传，先用图片，不要上传太大的视频
- 更新镜像时优先使用 Git SHA 标签，`latest` 适合先跑通流程
- 建议保留自动清理参数，避免上传文件长期堆积占满 1GB 挂载盘

---

## 后续更新

每次推送代码到 `main` 分支，GitHub Actions 会自动：
1. 构建新的 Docker 镜像
2. 推送到 GHCR，更新 `latest` 标签

然后在 run.claw.cloud 控制台**重新部署**应用即可使用新镜像。

---

## 手动触发构建

如果需要手动触发构建（不推送代码）：

1. 打开 GitHub 仓库 → **Actions** → **Build and Push Docker Image to GHCR**
2. 点击 **Run workflow** → 选择分支 → **Run workflow**

---

## 常见问题

**Q: GHCR 镜像拉取失败？**
A: 检查镜像是否为 Public，或是否正确配置了拉取凭证。

**Q: 上传图片时偶发 503，iPhone 更明显？**
A: 重点检查 4 项：
1. 容器端口是不是 `10000`
2. 健康检查是不是 `/health`
3. 容器内存是否太小
4. 上传的图片/视频是否过大

当前代码已经改成：前端通过 multipart 直接传到应用，应用把文件保存到挂载盘，再用同域文件 URL 做分析；相比 base64 JSON 上传稳定很多。

**Q: 如何查看镜像标签？**
A: 打开 GitHub 仓库 → **Packages** → 点击镜像名 → 查看 **Tags**。

**Q: 镜像构建失败？**
A: 到 **Actions** 页面查看详细日志，检查 Dockerfile 语法。
