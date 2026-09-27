# iOS 个人签名准备清单

## 你需要自己准备

- [ ] 一个可登录且能完成双重认证的 Apple Account；Apple ID 密码/验证码不要发给 Codex、写入项目或 GitHub Secrets。
- [ ] 在 Xcode Accounts 或 Apple Developer Account 中确认自己的 Personal Team / Team ID。Team ID 只提供给确实需要的 CI 配置；不要把它误当密码。
- [ ] 确认 `com.lxmusic.mobile` 能被 Personal Team 接受并创建开发 profile。若 Apple 报 ID 已占用，不要随机改名，先决定一个稳定新 ID。
- [ ] 本人 iPhone、解锁密码、可信 USB 数据线；在设备上信任此电脑，并准备按提示开启 Developer Mode。
- [ ] Windows 上从 Sideloadly 官方渠道取得程序及需要的 Apple 设备驱动/iTunes 组件。
- [ ] 从成功的 GitHub Actions run 下载 `ios-unsigned-ipa-<Run ID>` artifact，解压后拿到 `LXMusic-unsigned.ipa`。
- [ ] 预留免费签名到期后重新签名安装的维护方式（通常约每 7 天刷新）。

## 若之后决定让 GitHub Actions 做签名

- [ ] 先决定使用付费 Developer Program 的手动证书/profile，还是确认 Personal Team 是否能够安全自动化；当前 workflow 不读取签名材料。
- [ ] 准备匹配的 Apple Development `.p12`（须含 private key）、其导出密码、与 `com.lxmusic.mobile`/证书/设备相符且未过期的 `.mobileprovision`。
- [ ] 只把签名文件编码后的值及 `.p12` 密码存进受限的 GitHub Actions Secrets；非机密 Team ID/Bundle ID 优先使用 Variables。
- [ ] 绝不把 Apple Account 密码、app-specific password、2FA 验证码/恢复码或任何私钥提交到 Git。
- [ ] 规划证书吊销、profile 更新、secret 轮换、临时 keychain 清理和 Runner 日志脱敏。
- [ ] 首次签名 job 只对受信任分支/受保护 Environment 开放，并验证最终签名和嵌入的 profile。

## 本阶段不需要提供给项目

- [ ] 不需要把 Apple ID、密码、Team ID、证书或 profile 交给 Codex。
- [ ] 不需要在 Windows 安装 Xcode；Xcode 构建由 GitHub Actions macOS Runner 执行。
- [ ] 不要尝试安装当前未签名 IPA；需先在 Sideloadly 重签，或未来在有匹配凭据的 CI 中签名。
