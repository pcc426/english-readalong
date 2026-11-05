# 部署手册（票 07，V0.2 更新）

目标：应用部署到家庭 VPS，iPad 通过 `https://<域名>` 访问练习。
硬约束：**iPad 麦克风要求 HTTPS**，所以必须有域名 + TLS 证书（本方案用 Caddy 自动签发 Let's Encrypt）。
访问控制：V0.2 起为**登录鉴权为主 + 登录限速**（ADR-0003，取代 V0.1 的"不做登录、只靠防火墙 IP 白名单"）。
域名备案与防火墙/IP 白名单的最终调整是部署阶段待办，见「九、部署待办」。

## 一、一次性服务器准备（Ubuntu/Debian；CentOS 把 apt 换成 yum/dnf）

前置依赖：Node 22、ffmpeg（含 ffprobe，上传时长校验与可选抽音轨用）、pm2、Caddy。

```bash
ssh <user@你的VPS>
apt update && apt install -y curl git ffmpeg    # ffmpeg 包自带 ffprobe，无需单独装
# Node 22（NodeSource；已有可跳过）
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
node -v   # 应 ≥ 22
# pm2 进程守护
npm i -g pm2
# Caddy（自动 HTTPS）
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

## 二、域名

1. 域名的 **A 记录** 指向 VPS 公网 IP（`ping <域名>` 确认解析生效）。
2. 服务器 80/443 端口对外可达（云厂商安全组放行）。
3. **待办**：国内 VPS 对外提供 Web 服务需完成域名 ICP 备案（见「九、部署待办」）。

## 三、防火墙（辅助防线；V0.2 主访问控制是登录）

ADR-0003 落地后，IP 白名单不再是主访问控制（要开放给异地受邀家庭）；
防火墙仍建议收紧到只放行可信来源，作为登录限速之外的第二道闸：

```bash
# 先查家里宽带的公网 IP（在家里网络下执行，不是在 VPS 上）：
curl ip.sb
# VPS 上：
ufw allow OpenSSH
ufw allow from <家庭公网IP> to any port 443 proto tcp
ufw allow from <家庭公网IP> to any port 80 proto tcp   # Caddy 签发证书需要可达
ufw enable && ufw status
```

注意：家庭宽带是动态 IP，变了就重跑上面两条 `ufw allow from`（先 `ufw status numbered` 删旧条目）。
若要异地家庭访问，需放行其出口 IP 或暂时全放行 80/443——放行策略与备案一并调整（见「九、部署待办」）。
若 VPS 厂商有安全组，同样只放行 SSH + 可信 IP 的 80/443。

## 四、Caddy（自动 HTTPS）

```bash
scp deploy/Caddyfile <user@VPS>:/etc/caddy/Caddyfile   # 本地执行
# 在 VPS 上写入域名并启动：
ssh <user@VPS> "sed -i 's/{\$DOMAIN}/<你的域名>/' /etc/caddy/Caddyfile && systemctl reload caddy"
# 证书自动签发与续期，无需手动管理
```

## 五、凭据环境变量（.env）

本地复制 `.env.example` 为 `.env` 并填写（`.env` 不进 git，deploy.sh 单独传）。
**生产环境必须配齐讯飞两套凭据**，缺失行为：

- 缺 **LFASR** 三件套 → 转写服务工厂抛中文启动错误（票 13 守卫），上传的草稿
  显示「转写失败：生产环境未配置讯飞转写凭据……」并指向 `.env`；不会静默产出假转写。
- 缺 **XFYUN** 三件套 → 练习评分直接报错（一直如此，无假实现回退）。

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `XFYUN_APPID` / `XFYUN_API_KEY` / `XFYUN_API_SECRET` | 是 | 讯飞开放平台「语音评测（流式版）」凭据；控制台创建应用后获得（个人实名认证免费 500 次/天） |
| `LFASR_APP_ID` / `LFASR_API_KEY` / `LFASR_API_SECRET` | 生产必填 | 讯飞开放平台「录音文件转写」凭据；同一平台、**另一项服务**，需在控制台「语音转写」页单独开通（ADR-0004），与评测凭据不混用。新用户礼包最多 50 小时免费/年 |
| `LFASR_MODE` | 可选 | `llm`（默认，录音文件转写大模型，只收音频、自动抽轨）或 `standard`（标准版，可直接传视频）。两个版本是不同接口、不同密钥归属，按你开通的那个填 |
| `LFASR_EXTRACT_AUDIO` | 可选 | `=1` 时先用 ffmpeg 抽 16kHz 单声道音轨再提交；LFASR 拒收视频文件时打开（`scripts/smoke-lfasr.ts` 可先实测） |
| `LFASR_PAUSE_MS` | 可选 | 无句末标点时按停顿切句的阈值（毫秒），默认 `700`。调小切得更碎、调大合得更多；改完 pm2 restart 生效 |
| `DB_PATH` | 可选 | SQLite 库路径，默认 `data/readalong.db` |
| `CONTENT_DIR` | 可选 | 随代码部署的标准内容目录，默认 `content/units` |
| `CONTENT_DATA_DIR` | 可选 | 运行时内容目录（自定义包与运行时标准包），默认 `data/content` |
| `UPLOADS_DIR` | 可选 | 上传视频运行时目录，默认 `data/uploads` |
| `SHIPPED_MEDIA_DIR` | 可选 | 随代码标准内容视频目录，默认 `content/media`；视频不做静态公开，统一经 `/api/media/shipped/<文件名>` 鉴权提供 |

获取方式：[xfyun.cn 控制台](https://www.xfyun.cn/) → 对应服务页 → 服务管理里取 APPID / APIKey / APISecret。

会话说明：会话存 SQLite（随机 opaque id，HttpOnly + Secure cookie），**没有会话密钥要配置**；
进程重启后 `src/instrumentation.ts` 会自动恢复「转写中」草稿的轮询（前提是 LFASR 凭据已配置）。

## 六、运行时数据目录（部署不覆盖 `data/`）

```
data/
├── readalong.db              # SQLite：账号、会话、内容草稿、练习记录（WAL 模式）
├── uploads/<accountId>/      # 各账号上传的视频原文件
└── content/
    ├── <accountId>/          # 各账号定稿的自定义内容包（JSON）
    └── standard/             # 管理员定稿产出的公开标准内容包（运行时写入）
```

- `scripts/deploy.sh` 用 `rsync --delete --exclude data` 同步代码：服务器上的 `data/`
  **既不会被更新也不会被删除**，升级部署不动运行数据（账号、上传、练习记录全保留）。
- 随代码部署的只读标准内容在 `content/units/`，rsync 每次同步；运行时定稿的标准包
  （`data/content/standard/`）与其 id 冲突时以代码内包优先。
- 不要手工改动或备份到别处后改权限——整个 `data/` 归应用运行进程读写。

## 七、全新 VPS 部署步骤（V0.2 顺序）

1. **完成第 1–4 节**（依赖、域名、防火墙、Caddy）。
2. **拉代码并装依赖**：

   ```bash
   ssh <user@VPS>
   git clone <仓库地址> /opt/english-readalong
   cd /opt/english-readalong
   export npm_config_better_sqlite3_binary_host_mirror=https://registry.npmmirror.com/-/binary/better-sqlite3
   npm ci
   ```
   （国内 VPS 拉 better-sqlite3 预编译包容易超时，上面的 mirror 与 deploy.sh 内一致。）

3. **`.env` 配置**：按第五节填写后放到 `/opt/english-readalong/.env`
   （或在本地填好，之后用 `./scripts/deploy.sh` 传输）。
4. **构建**：

   ```bash
   npm run build
   ```

5. **建首管理员**（公网无自助注册入口，ADR-0003；缺参时进入交互输入）：

   ```bash
   npx tsx --env-file=.env scripts/create-admin.ts <邮箱> <密码>
   ```

6. **（仅从 V0.1 升级的旧库）迁移练习记录归属**：把 owner 为空的旧记录归到首个
   管理员名下；幂等，可重复执行。全新库跳过此步。

   ```bash
   npx tsx --env-file=.env scripts/migrate-practice-owner.ts
   ```

7. **启动**：

   ```bash
   pm2 start npm --name english-readalong -- start && pm2 save
   ```

8. **验证**（最终以 `docs/acceptance-v02.md` 真机清单为准）：

   - 浏览器打开 `https://<域名>` → 跳转登录页，管理员账号能登录进首页；
   - `pm2 logs english-readalong` 无启动报错；
   - 上传一段小视频 → 状态「转写中」→ 几分钟后变「未校对」（依赖真实 LFASR 凭据）；
   - 转写集成冒烟（真实调讯飞、按音频时长计费；未配凭据时打印 SKIP 并退出 0）：

     ```bash
     npx tsx --env-file=.env scripts/smoke-lfasr.ts
     ```

**之后的每次发版**：本地执行 `./scripts/deploy.sh <user@VPS> <你的域名>`——
rsync 代码（不覆盖 `data/`）→ 传 `.env` → 远程 `npm ci && npm run build` → `pm2 reload`。

### 从 V0.2.x 升级到 V0.3.x（发版后一次性步骤）

V0.3 起列表卡带封面与教材归属字段，`data/` 里的历史数据需要补一次：

```bash
ssh <user@VPS>
cd /opt/english-readalong
npx tsx --env-file=.env scripts/backfill-posters.ts            # 给服务器上的视频补抽封面并回填草稿
npx tsx --env-file=.env scripts/migrate-v03-standard-packs.ts  # 默认 dry-run，先核对 before/after
npx tsx --env-file=.env scripts/migrate-v03-standard-packs.ts --apply
pm2 reload english-readalong
```

- `practice_attempts` 的 `run_id`、`content_drafts` 的 `poster_path` 列由启动时 `addColumnIfMissing` 自动补，无需手工迁移
- 新增可选环境变量 `LFASR_PAUSE_MS`（断句停顿阈值，默认 700ms），不配即可
- 随代码封面 `content/media/posters/*.jpg` 随 rsync 自动同步，无需手工处理

### V0.3.6 教材内容可见性开关

- 新增 `app_settings` 表，启动时自动创建，无需手工迁移。
- **默认关闭**：家庭账号登录后看不到「教材内容」，直接落在「自定义内容」；管理员不受影响。
- 需要恢复所有账号可见时，在「管理 → 教材内容可见性」打开开关；状态存数据库，跨部署保留。
- 关闭只是访问控制，不会删除标准内容、草稿、素材或练习记录。

### V0.4 初始星星回填

部署脚本会在构建后、重启前执行 `npm run backfill:stars`。也可以手动执行：

```bash
ssh <user@host> "cd /opt/english-readalong && npm run backfill:stars"
```

- **切点只定一次**：首次执行会把上线切点与上线月份存进 `app_settings`
  （`v04_baseline_cutoff` / `v04_baseline_month`）。之后重复部署只折算切点之前的历史
  练习，不会把上线后的练习再折成新的 baseline。
- 输出会列出本次新增的 `账号 / 内容: +星星`，随后按账号打印 baseline 合计
  （如 `acct-xxx: 95 stars`），最后是本次插入行数。
- 预期量级：家长测试账号约 **95** 星；管理员约 **75** 星，另有约 **35** 星来自
  owner 为 NULL 的旧记录并入管理员（实际值取决于每句最高星合并结果）。
- 重复执行不会重复插入；回填失败不阻塞部署，修好后手动重跑即可。

常用命令：

```bash
ssh <user@VPS> "pm2 logs english-readalong"     # 看评分/转写日志（成功/失败/耗时）
ssh <user@VPS> "pm2 restart english-readalong"  # 改 .env 后重启生效
```

## 八、iPad 真机验收

V0.2 完整可勾选清单见 **`docs/acceptance-v02.md`**（票 13），覆盖登录、上传、
转写、两个校对工具、定稿门禁、标准内容制作、隐私隔离与竖屏布局。
V0.1 练习链路的 7 条快速冒烟仍有效：

1. iPad Safari 打开 `https://<域名>` → 登录后出现两个单元卡片
2. 进入 U2 → ▶ 开始 → 示范自动播放 → 播完进入录音态 → **首次会弹麦克风权限，选允许**
3. 读一句 → ✓ 读好了 → 拿到分数与星星（真讯飞评分）
4. 「🎧 听我读的」能回放；「↺ 再练一次这句」重录并刷新纪录
5. 自动流转到下一句；整单元练完出总星级
6. 飞行模式/断网重试 → 提示可重试、进度不丢
7. 退出登录后刷新 → 应回到登录页（V0.2 会话边界）

## 九、部署待办（spec 遗留，如实记录）

以下两项为 V0.2 spec 明确留到部署阶段合并处理的待办，**不阻塞功能验收**，
但正式对外（受邀家庭跨网访问）前应完成：

1. **域名备案**：国内 VPS 对外提供 Web 服务需完成域名 ICP 备案；备案期间部分
   厂商会要求网站可访问域名与主体一致。当前调试阶段先用现有环境跑通功能。
2. **防火墙 / IP 白名单调整**：ADR-0003 以登录鉴权取代白名单作为主访问控制后，
   防火墙策略需重新定档：是否继续只放行家庭 IP（最严）、放行受邀家庭出口 IP
   （中）、或全放行 80/443 仅靠登录+限速（最宽）。待备案落地后一并调整 ufw 与
   云厂商安全组。

## 十、常见问题

- **启动/上传报「生产环境未配置讯飞转写凭据」**：`.env` 缺 LFASR 三件套
  （票 13 生产守卫）。填好后 `pm2 restart english-readalong`；报错的草稿删掉重传即可。
- **重启后草稿一直「转写中」**：重启自动恢复轮询需要 LFASR 凭据（instrumentation）。
  没配凭据期间挂起的草稿不会自恢复，配好凭据重启进程；仍不动就删掉重传。
- **讯飞额度**：评测个人实名认证免费 500 次/天；LFASR 新用户礼包最多 50 小时/年。
  用超会调用失败并在 `pm2 logs` 里看到错误码。
- **动态 IP 变了打不开**：查新 IP（`curl ip.sb`）→ 更新 ufw 规则。
- **证书没签下来**：域名解析未生效或 80 端口被防火墙挡住（签发时 Caddy 需要可
  从家庭 IP 可达 80/443）。
- **ffmpeg 缺失**：上传时长校验（ffprobe）与「转写失败：…」里的抽音轨错误 →
  服务器 `apt install -y ffmpeg`。
- **VPS 磁盘增长**：自定义视频存 `data/uploads/`，单文件上限 200MB；留意磁盘，
  后续版本考虑清理/归档策略。
