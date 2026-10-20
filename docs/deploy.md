# 部署手册（票 07）

目标：应用部署到家庭 VPS，iPad 通过 `https://<域名>` 访问练习。
硬约束：**iPad 麦克风要求 HTTPS**，所以必须有域名 + TLS 证书（本方案用 Caddy 自动签发 Let's Encrypt）。
访问控制：**ADR-0002** —— 不做登录，防火墙只放行家庭宽带 IP。

## 一、一次性服务器准备（Ubuntu/Debian；CentOS 把 apt 换成 yum/dnf）

```bash
ssh <user@你的VPS>
apt update && apt install -y curl git ffmpeg
# Node 22（NodeSource）
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

## 三、防火墙（ADR-0002：只放行家庭宽带 IP）

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
若 VPS 厂商有安全组，同样只放行 SSH + 家庭 IP 的 80/443。

## 四、Caddy（自动 HTTPS）

```bash
scp deploy/Caddyfile <user@VPS>:/etc/caddy/Caddyfile   # 本地执行
# 在 VPS 上写入域名并启动：
ssh <user@VPS> "sed -i 's/{\$DOMAIN}/<你的域名>/' /etc/caddy/Caddyfile && systemctl reload caddy"
# 证书自动签发与续期，无需手动管理
```

## 五、部署与更新（每次发版）

```bash
./scripts/deploy.sh <user@VPS> <你的域名>
```

脚本做的事：rsync 代码（`.env` 单独传、服务器 `data/` 运行数据不动）→ `npm ci && npm run build` → pm2 平滑重启。
首次部署前确认本地 `.env` 已填讯飞密钥（`XFYUN_APPID/XFYUN_API_KEY/XFYUN_API_SECRET`）。

常用命令：

```bash
ssh <user@VPS> "pm2 logs english-readalong"     # 看评分调用日志（成功/失败/耗时）
ssh <user@VPS> "pm2 restart english-readalong"
```

## 六、iPad 手工验收清单（票 07 验收）

1. iPad Safari 打开 `https://<域名>` → 出现两个单元卡片
2. 进入 U2 → ▶ 开始 → 示范自动播放 → 播完进入录音态 → **首次会弹麦克风权限，选允许**
3. 读一句 → ✓ 读好了 → 拿到分数与星星（真讯飞评分）
4. 「🎧 听我读的」能回放；「↺ 再练一次这句」重录并刷新纪录
5. 自动流转到下一句；整单元练完出总星级
6. 飞行模式/断网重试 → 提示可重试、进度不丢
7. 换蜂窝网络（非家庭 WiFi）打开 → 应被防火墙拒绝（白名单外的访问被拒）

## 七、常见问题

- **讯飞额度**：个人实名认证免费 500 次/天；用超会调用失败并在 `pm2 logs` 里看到错误码。
- **动态 IP 变了打不开**：查新 IP（`curl ip.sb`）→ 更新 ufw 规则。
- **证书没签下来**：域名解析未生效或 80 端口被防火墙挡住（签发时 Caddy 需要从家庭 IP 可达 80/443）。
- **ffmpeg 缺失**：录音提交报"录音处理失败"→ 服务器 `apt install -y ffmpeg`。
