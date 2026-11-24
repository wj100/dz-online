# dz-online 部署运维文档

## 一、访问地址

- **线上地址**：https://wangjun.work/dz/
- 域名：`wangjun.work`（托管在腾讯云 DNSPod），主域名 A 记录指向 `82.156.190.210`

## 二、部署架构

```
用户浏览器
    │  https://wangjun.work/dz/
    ▼
腾讯云 Lighthouse (82.156.190.210)
    │
    ├─ Caddy（反向代理 + HTTPS，端口 80/443）
    │     ├─ /dz/*            → 前端静态 /var/www/dz（SPA，base=/dz/）
    │     ├─ /dz/api/*        → 反代 localhost:3001（strip /dz）
    │     └─ /dz/socket.io/*  → 反代 localhost:3001（strip /dz，含 WebSocket）
    │
    └─ Node 服务端（pm2 管理，端口 3001）
          └─ SQLite：server/prisma/dev.db
```

## 三、服务器信息

| 项 | 值 |
|---|---|
| 云厂商 | 腾讯云 Lighthouse（轻量应用服务器） |
| 实例 ID | `lhins-8duhf3oi` |
| 地域 | 北京（ap-beijing） |
| 公网 IP | `82.156.190.210` |
| 系统 | Ubuntu 24.04 LTS，2 核 2GB |

> ⚠️ 该实例上还运行着 **Hermes Agent** 服务（占约 470MB 内存），部署德州扑克时不要动它。

## 四、目录与文件

| 路径 | 说明 |
|---|---|
| `/home/ubuntu/dz-online` | 项目代码（git clone，root 所有） |
| `/home/ubuntu/dz-online/server` | 服务端（Node + TS） |
| `/home/ubuntu/dz-online/server/.env` | 环境变量（JWT_SECRET 随机生成，勿泄露） |
| `/home/ubuntu/dz-online/server/prisma/dev.db` | SQLite 数据库 |
| `/var/www/dz` | 前端构建产物（dist 复制，caddy 用户所有） |
| `/etc/caddy/Caddyfile` | Caddy 反向代理配置 |
| `/etc/caddy/certs/wangjun.work.pem` | HTTPS 证书（证书链） |
| `/etc/caddy/certs/wangjun.work.key` | HTTPS 私钥 |

## 五、服务管理

### 1. Node 服务端（pm2）

```bash
pm2 list                    # 查看状态（进程名 dz-server）
pm2 logs dz-server          # 查看日志
pm2 restart dz-server       # 重启
cd /home/ubuntu/dz-online/server && pm2 start "npx tsx src/index.ts" --name dz-server  # 启动
```

### 2. Caddy（systemd）

```bash
systemctl status caddy      # 查看状态
systemctl reload caddy      # 重载配置（改 Caddyfile 后）
systemctl restart caddy     # 重启
```

### 3. 远程操作（无需 SSH）

腾讯云 TAT 可远程执行命令（已配置好 `tccli` 客户端 + OAuth 登录）：

```bash
# 本地执行远程命令（示例）
tccli tat RunCommand --region ap-beijing --InstanceIds '["lhins-8duhf3oi"]' \
  --Content "$(echo 'pm2 list' | base64)"
```

## 六、代码更新流程

> ⚠️ 服务器访问 GitHub 不稳定（大陆网络），`git pull` 经常失败。若 pull 失败，用 TAT 手动改文件或重新 clone。

标准流程：

```bash
# 1. 本地推送
cd dz-online && git add -A && git commit -m "..." && git push origin main

# 2. 服务器拉取 + 构建（通过 TAT 远程执行）
cd /home/ubuntu/dz-online && git pull          # 可能失败，失败则手动同步
cd client && npm run build                     # 重新构建前端
cp -r dist/* /var/www/dz/                       # 同步到 Caddy 目录
chown -R caddy:caddy /var/www/dz
cd ../server && npm install && pm2 restart dz-server   # 如有服务端改动
```

## 七、HTTPS 证书（重要）

### 当前证书

- 类型：腾讯云免费证书（TrustAsia DV Free）
- 有效期：**2026-11-24 ～ 2027-02-22（3 个月）**
- 证书 ID：`ccb8xHf6`

### 为什么用腾讯云证书而不是 Caddy 自动申请

Let's Encrypt 的 ACME HTTP/TLS challenge 在**中国大陆网络**下会失败（多视角验证时，境内验证节点访问 challenge 路径被污染，报 `reader size limit exceeded` / `Connection reset by peer`）。这是网络环境问题，无法靠配置解决。因此改用**腾讯云免费证书 + DNS 验证**（DNS 走 DNSPod，不受干扰）。

### 续期步骤（到期前手动操作）

```bash
# 1. 重新申请免费证书（手动 DNS 验证）
tccli ssl ApplyCertificate --DvAuthMethod DNS --DomainName wangjun.work --PackageType 83

# 2. 查验证记录值
tccli ssl DescribeCertificateDetail --CertificateId <新证书ID>   # 找 DvAuthDetail.DvAuthValue

# 3. 添加 DNS TXT 记录
tccli dnspod CreateRecord --Domain wangjun.work --SubDomain _dnsauth \
  --RecordType TXT --RecordLine "默认" --Value "<验证值>"

# 4. 等签发（约 2~5 分钟）后，下载证书
tccli ssl DescribeCertificateDetail --CertificateId <证书ID>   # CertificatePublicKey + CertificatePrivateKey

# 5. 更新到服务器
#    - 证书 → /etc/caddy/certs/wangjun.work.pem（CertificatePublicKey 含完整链）
#    - 私钥 → /etc/caddy/certs/wangjun.work.key
#    - chown caddy:caddy 两个文件
#    - systemctl reload caddy
```

## 八、已知问题

1. **外部 443 端口 TLS 间歇性 reset**：本机访问正常，外部 TCP 可达但 TLS 握手偶尔被 reset（腾讯云安全防护特征，可能是早期 ACME challenge 反复失败触发的限流）。浏览器自动重试通常能加载，WebSocket 依赖 Socket.io 自动重连。若持续，可在腾讯云控制台查 DDoS 防护告警或提工单。

2. **服务器访问 GitHub 不稳定**：`git pull` 可能失败（GnuTLS TLS 错误），需用 TAT 手动同步代码。

3. **免费证书 3 个月续期**：需手动续（见第七节），或用付费证书（1 年）避免频繁操作。

## 九、数据库备份

SQLite 单文件，直接复制即可备份：

```bash
cp /home/ubuntu/dz-online/server/prisma/dev.db /backup/dev-$(date +%F).db
```

> 当前数据：用户（User，含 chips/inPlayChips）、场次（GameSession）、玩家结算（GameSessionPlayer）。
