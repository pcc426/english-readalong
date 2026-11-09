# 小学英语跟读 · English Readalong

家庭英语跟读练习工具：播放示范视频，孩子逐句录音跟读，由讯飞语音评测给出句子级评分和星级反馈。

- 逐句跟读：听一句示范 → 录音 → AI 评分 → 星星反馈
- 成长记录：账号星星、连续打卡、打卡月历、余额曲线
- 自定义内容：家长上传英语视频 → 自动转写 → 校对/预览 → 发布 → 跟读
- 标准内容：随仓库附带的教材内容包（当前为沪教版五年级上册，教材暂未授权，标准内容暂不开放）
- 邀请制账号：没有公开注册入口，管理员创建账号；自定义内容按账号隔离

> 项目状态：个人家庭项目，按版本迭代中（当前 V0.4.1）。许可证见文末。

## 技术栈

| 层    | 选型                                            |
| ---- | --------------------------------------------- |
| Web  | Next.js 15（App Router）+ React 19 + TypeScript |
| 样式   | Tailwind CSS 4                                |
| 数据   | SQLite（better-sqlite3，WAL 模式）                 |
| 语音评测 | 讯飞开放平台「语音评测（流式版）」ISE                          |
| 录音转写 | 讯飞开放平台「录音文件转写」LFASR（大模型版 / 标准版）               |
| 媒体处理 | ffmpeg / ffprobe                              |
| 测试   | Vitest                                        |

## 环境要求

- **Node.js 22**（推荐 22 LTS；本项目在 v22.22 上开发）
- **npm 10+**
- **ffmpeg**，且 `ffmpeg` 与 `ffprobe` 都在 `PATH` 中
  - macOS：`brew install ffmpeg`
  - Ubuntu / Debian：`sudo apt install -y ffmpeg`
- **讯飞开放平台凭据**（可选，见下）

没有讯飞凭据也能启动和浏览页面，但**练习评分会失败**；上传视频时会退化为假转写。要完整体验，需要准备两套凭据：

1. **语音评测（流式版）**：`XFYUN_APPID` / `XFYUN_API_KEY` / `XFYUN_API_SECRET`
   - 个人实名认证后免费 500 次/天
2. **录音文件转写（LFASR）**：`LFASR_APP_ID` / `LFASR_API_KEY` / `LFASR_API_SECRET`
   - 与语音评测是**同一平台的两套服务**，需要在控制台「语音转写」页单独开通
   - 本地开发可留空：会使用内置假转写，固定返回 4 句示例文本，可跑通上传 → 校对 → 发布链路
   - 生产环境必须填写，否则启动/上传会明确报错，不会静默产出假数据

获取方式：登录 [讯飞开放平台控制台](https://www.xfyun.cn/) → 对应服务页 → 服务管理 → 查看 APPID / APIKey / APISecret。

## 本地启动

```bash
git clone <你的仓库地址>
cd english-readalong
npm ci
cp .env.example .env
```

编辑 `.env`，至少填入语音评测三件套（真实转写凭据也建议一并填写）：

```dotenv
XFYUN_APPID=你的_appid
XFYUN_API_KEY=你的_api_key
XFYUN_API_SECRET=你的_api_secret

# 可选：不填则本地使用假转写
LFASR_APP_ID=
LFASR_API_KEY=
LFASR_API_SECRET=
```

创建首个管理员。项目没有公开注册入口，管理员只能由运维在本地用脚本创建：

```bash
npx tsx --env-file=.env scripts/create-admin.ts admin@example.com 'change-me-please'
```

启动开发服务器：

```bash
npm run dev
```

打开 <http://localhost:3000/login>，用刚创建的邮箱和密码登录。

说明：

- 首次运行会在 `data/readalong.db` 自动建库建表，不需要手工执行迁移。
- 数据库、上传视频、运行时内容包都写入 `data/`，该目录已被 `.gitignore` 忽略。
- `localhost` 属于浏览器安全上下文，麦克风可直接使用；如果要用局域网 IP 或 iPad 访问，**必须使用 HTTPS**（见 [docs/deploy.md](docs/deploy.md)）。

## 环境变量

`.env` 不入库，模板见 [.env.example](.env.example)。

| 变量                                                    | 必填           | 默认值                 | 说明                                                                                                      |
| ----------------------------------------------------- | ------------ | ------------------- | ------------------------------------------------------------------------------------------------------- |
| `XFYUN_APPID` / `XFYUN_API_KEY` / `XFYUN_API_SECRET`  | 要评分则必填；生产必填  | —                   | 讯飞「语音评测（流式版）」凭据                                                                                         |
| `LFASR_APP_ID` / `LFASR_API_KEY` / `LFASR_API_SECRET` | 生产必填；开发可留空   | —                   | 讯飞「录音文件转写」凭据。三项齐全才走真实转写，否则开发/测试使用假转写                                                                    |
| `LFASR_MODE`                                          | 否            | `llm`               | `llm`（录音文件转写大模型，只收音频）或 `standard`（标准版，可直接传视频）。注意两个版本的密钥归属不同                                             |
| `LFASR_EXTRACT_AUDIO`                                 | 否            | 关闭                  | 设为 `1` 时先用 ffmpeg 抽 16kHz 单声道音轨再提交；LFASR 拒收视频文件时打开                                                      |
| `LFASR_PAUSE_MS`                                      | 否            | `700`               | 无句末标点时按停顿切句的阈值（毫秒）。调小切得更碎，调大合并更多                                                                        |
| `DB_PATH`                                             | 否            | `data/readalong.db` | SQLite 数据库路径                                                                                            |
| `CONTENT_DIR`                                         | 否            | `content/units`     | 随代码标准内容包目录；本仓库已无随代码内容，目录缺失视为空                                                                           |
| `CONTENT_DATA_DIR`                                    | 否            | `data/content`      | 运行时内容包目录：自定义内容按账号分目录，另有 `standard/` 存放运行时制作的标准内容                                                        |
| `UPLOADS_DIR`                                         | 否            | `data/uploads`      | 上传视频目录，按账号分目录                                                                                           |
| `SHIPPED_MEDIA_DIR`                                   | 否            | `content/media`     | 随代码标准内容视频目录；本仓库已无随代码内容                                                                                  |
| `READALONG_SITE_ADDRESS`                              | 部署 Caddy 时必填 | —                   | Caddy 站点对外地址，由 `deploy/Caddyfile` 从环境变量读取，如 `https://english.example.com`；IP 调试版填 `https://<公网IP>:8443` |
| `READALONG_DEFAULT_SNI`                               | 仅 IP 调试版     | —                   | 公网 IP，配合 `deploy/Caddyfile.ip-tls` 的自签证书使用                                                              |

会话不需要额外密钥：会话 id 为服务端随机不透明字符串，存 SQLite，通过 HttpOnly + Secure Cookie 下发。

## 首次使用

1. 管理员登录后进入「管理」，创建家长账号（邀请制）或重置密码。
2. 家长账号登录后默认进入「我的成长」页。
3. 教材内容默认对家庭账号**关闭**。需要开放时，管理员在「管理 → 教材内容可见性」打开开关；状态存数据库，跨部署保留。
4. 上传自定义内容：「自定义内容 → 上传」选择视频。系统会用 ffmpeg 读取时长、抽取竖版封面并提交转写；转写完成后依次进入「校对 → 预览 → 发布」。
5. 开始跟读：进入「自定义内容」或「教材内容」，点内容卡片开始。每句录音提交评测，全部句子完成后结算星星。

## 内容包与媒体文件

内容由「内容包 JSON + 视频 + 封面」组成：

| 类型      | 位置                          | 说明                                |
| ------- | --------------------------- | --------------------------------- |
| 自定义内容视频 | `data/uploads/<accountId>/` | 上传原文件，仅所属账号可见                     |
| 自定义内容包  | `data/content/<accountId>/` | 定稿后生成，仅所属账号可见                     |
| 标准内容包   | `data/content/standard/`    | 管理员通过上传管线制作，所有账号（开关打开时）可见         |
| 标准内容视频  | `data/uploads/<accountId>/` | 标准内容定稿时视频落在管理员上传目录，经鉴权接口对所有登录账号放行 |

本仓库已移除随代码的教材标准内容（原 `content/units/` 与 `content/media/`），  
标准内容现在全部通过管理员上传管线制作、落在运行时目录 `data/content/standard/`；  
所有视频与封面统一经鉴权接口读取，不作为静态资源公开。

内容包最小示例：

```json
{
  "id": "u2-dragon-dance",
  "title": "The dragon dance",
  "source": "沪教版五上 Unit 2 · Story time",
  "video": "acct-xxx/1a2b3c.mp4",
  "poster": "acct-xxx/1a2b3c.poster.jpg",
  "sentences": [
    { "text": "Stop!", "start": 5, "end": 6.05 },
    { "text": "Let's try again.", "start": 15.78, "end": 17.37 }
  ]
}
```

关键字段：

- `id`：全局唯一
- `video` / `poster`：相对引用，填 `<accountId>/<uuid>.<ext>` 形式（指向 `data/uploads/<accountId>/`）
- `sentences[].start` / `end`：秒，可同时为 `null` 表示尚未切分
- 可选教材归属字段：`seriesCode`、`bookId`、`unitNo`、`moduleKind`、`lessonTitle`
- `type` / `owner`：自定义内容必须写 `"type": "custom"` 和所属账号 `owner`

完整校验规则见 [src/lib/content/schema.ts](src/lib/content/schema.ts)，教材注册表见 [src/lib/textbook/registry.ts](src/lib/textbook/registry.ts)。

## 常用命令

| 命令                       | 说明                                          |
| ------------------------ | ------------------------------------------- |
| `npm run dev`            | 开发服务器（Turbopack，默认 <http://localhost:3000>） |
| `npm run build`          | 生产构建                                        |
| `npm start`              | 运行生产构建                                      |
| `npm test`               | 跑一遍 Vitest                                  |
| `npm run test:watch`     | 监听模式跑测试                                     |
| `npm run typecheck`      | TypeScript 类型检查                             |
| `npm run backfill:stars` | 回填 V0.4 初始星星（幂等；首次执行会记录上线切点）                |

一次性脚本（位于 `scripts/`，多数需要 `npx tsx --env-file=.env`）：

| 脚本                                                    | 用途                                     |
| ----------------------------------------------------- | -------------------------------------- |
| `create-admin.ts <邮箱> <密码>`                           | 创建管理员账号；缺参时交互输入                        |
| `backfill-posters.ts`                                 | 为已有视频补抽封面，并回填草稿封面字段（幂等）                |
| `migrate-practice-owner.ts`                           | 把 owner 为空的旧练习记录归到首个管理员名下              |
| `migrate-v03-standard-packs.ts`                       | V0.3 标准内容包迁移；默认 dry-run，核对后加 `--apply` |
| `smoke-xunfei.ts`                                     | 语音评测接口冒烟（真实调用，按次计费）                    |
| `smoke-lfasr.ts`                                      | 录音文件转写冒烟（真实调用，按音频时长计费）                 |
| `align.ts <whisper.json> <sentences.json> <out.json>` | 离线素材对齐：用词级转写和权威句子清单生成起止时间              |

测试与类型检查：

```bash
npm test
npm run typecheck
```

## 生产部署

完整步骤见 [docs/deploy.md](docs/deploy.md)。要点：

- 服务器需要 Node 22、ffmpeg、pm2、Caddy（或其他能提供 HTTPS 的反向代理）
- **iPad / 手机麦克风要求 HTTPS**，纯 IP 不可用
- Caddy 站点地址从 `.env` 的 `READALONG_SITE_ADDRESS` 读取；临时用 IP 调试时配合 `deploy/Caddyfile.ip-tls`，配置步骤见 [docs/deploy.md](docs/deploy.md)
- 服务器 `.env` 必须配齐讯飞两套凭据；缺 LFASR 凭据时生产环境会明确报错
- 首次部署：`npm ci` → `npm run build` → `npx tsx --env-file=.env scripts/create-admin.ts ...` → `pm2 start npm --name english-readalong -- start`
- 后续发版：本地执行 `./scripts/deploy.sh <user@host>`。站点地址默认读 `.env` 的 `READALONG_SITE_ADDRESS`；脚本用 rsync 同步代码，**不会覆盖或删除服务器上的 `data/`**

部署后建议执行一次：

```bash
npx tsx --env-file=.env scripts/smoke-lfasr.ts
```

## 目录结构

```
src/
  app/                 # 页面与 API 路由（App Router）
  components/          # UI 组件
  lib/                 # 领域逻辑：评分、转写、星星账本、内容加载、鉴权
content/
  textbook/            # 教材解析产物与注册数据（构建期导入）
data/                  # 运行时数据（gitignored）：SQLite、上传、运行时内容包
scripts/               # 运维与一次性脚本
deploy/                # Caddy 配置示例
docs/                  # ADR、部署手册、验收清单
```

## 文档与约定

- [GLOSSARY.md](GLOSSARY.md)：领域词汇表（跟读、句子星、账号星星、完整练习等）
- [docs/adr/](docs/adr/)：架构决策记录
- [docs/deploy.md](docs/deploy.md)：服务器部署手册

## 安全与隐私

- `.env`、`data/`、`materials/`、`models/` 已在 `.gitignore` 中，不要提交
- `scripts/reset-password.ts` 是刻意不入库的高危运维脚本：知道邮箱即可改任意账号密码，只保留在服务器与本机
- 项目没有公开注册入口；首个管理员必须由运维在本地创建
- 自定义内容按账号隔离，媒体文件统一经鉴权接口读取，不作为静态资源公开

## License

本项目代码以 [GNU General Public License v3.0](LICENSE) 开源。

注意：`content/textbook/grade5a.json` 中的课文文本版权归原教材出版方所有，不在 GPL 覆盖范围内；对外分发前请自行确认授权。
