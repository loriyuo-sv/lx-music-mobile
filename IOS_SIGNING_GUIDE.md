# iOS Personal Team 签名说明

本阶段仅准备项目配置与说明，不导入证书、不生成证书或 provisioning profile，也不保存 Apple 账号凭据。iOS App Target 的 Bundle ID 为 `com.lxmusic.mobile`；Team ID 和 provisioning profile 暂不设置。

## 1. 获取 Team ID

- 使用 Apple Account 登录 [Apple Developer](https://developer.apple.com/account/) 后，在 Account / Membership details 查看 Team ID。若只有免费个人开发能力，Xcode 中通常显示为 `Personal Team`；从 Apple Developer 网站查看 Membership 信息不一定能看到免费团队的所有管理功能。
- 也可在 Xcode 的 Settings（或 Preferences）> Accounts 选中 Apple Account，查看该账号下的 Personal Team。Team ID 是一串字母数字标识，不是 Apple ID 邮箱。
- Team ID 不是密码。只有在确实需要 Xcode Cloud/CI 配置时，才把它当作非机密 workflow variable；不要硬编码成当前项目的固定值，因为用户的 Team ID 各不相同。

## 2. 在 Xcode 中使用 Personal Team

在已登录 Apple Account 的 Mac 上打开 `ios/LxMusicMobile.xcworkspace`，选择 `LxMusicMobile` scheme 和 `LxMusicMobile` app target，在 Signing & Capabilities 中：

1. 开启 Automatically manage signing。
2. Team 选择该 Apple Account 的 `Personal Team`。
3. 确认 Bundle Identifier 是 `com.lxmusic.mobile`，且该标识尚未被此团队占用。
4. 连接本人 iPhone，选为运行目的地并允许 Xcode 注册设备及创建/更新开发 profile。
5. 首次运行时按 iOS 提示启用 Developer Mode，并在设备上信任用于开发的 Apple Account。

项目现已把 app/test targets 的 `CODE_SIGN_STYLE` 设为 `Automatic`，但 `DEVELOPMENT_TEAM`、`PROVISIONING_PROFILE_SPECIFIER` 都留空。用户必须在 Xcode 选择自己的 Team；不能将一位用户的 Team ID 写进共享项目。

## 3. Development Signing

### Personal Team（免费个人签名）

- Xcode 自动管理签名时会为选定设备创建/更新 Apple Development identity 和 Development provisioning profile；通常有效期较短（免费 provisioning 通常约 7 天），到期后需重新签名/安装。
- Personal Team 有设备数、同时安装应用数、功能 entitlement 等限制；不等同于付费 Apple Developer Program。后台音频并非 Apple 签名 entitlement，项目的 `UIBackgroundModes: audio` 只是声明后台音频用途。
- `com.lxmusic.mobile` 格式合法，通常可以用于个人开发，但是否能注册取决于该账号/团队中的 App ID 是否冲突，以及 Apple 当时允许的 Personal Team 功能。最终以 Xcode/Sideloadly 接受该 ID 并成功生成 profile 为准。不要用随机 ID；若提示该 ID 已占用，须由用户决定新的固定 Bundle ID。

### 付费 Apple Developer Program / 手动 profile

在 [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/) 注册显式 App ID `com.lxmusic.mobile`，建立 Apple Development certificate，把本人 iPhone UDID 注册为设备，然后创建 iOS App Development profile（选择 App ID、证书和设备），下载 `.mobileprovision`。手动导出私钥时必须把 certificate 和对应 private key 一起导出为 `.p12`；只有证书文件并不能签名。

免费 Personal Team 通常由 Xcode 自动创建和维护开发 profile，不应假设可在 Developer 网站手动创建任意 profile。没有 Mac 时，可在 Windows 上用 Sideloadly 对当前未签名 IPA 做个人签名安装；如坚持由 GitHub Actions 签名，则必须先安全取得匹配的证书私钥和有效 profile，并验证 Apple 对该 Personal Team 的自动化支持。

## 4. GitHub Actions 可用的信息与 Secrets

当前 workflow 仅安装依赖、核验 Release build settings、执行无签名构建和上传未签名 IPA；它没有 Apple 证书或账号 secrets，也不应接收它们。

如未来改成 CI 签名，可在确认方案和权限后使用受限 GitHub Actions Secrets 保存：

- `IOS_CERTIFICATE_P12_BASE64`：包含私钥的 `.p12` 编码内容。
- `IOS_CERTIFICATE_PASSWORD`：该 `.p12` 的导出密码。
- `IOS_PROVISIONING_PROFILE_BASE64`：匹配的 `.mobileprovision`。
- 必要时的 `APPLE_TEAM_ID`。Team ID、Bundle ID 通常不是机密，也可放 Repository/Environment Variables，而非 Secrets。

通过保护分支/Environment、最小权限、短保留期和只对受信任分支运行，限制 secrets 暴露；在临时 macOS keychain 导入证书，签完后清理。不要在日志打印 base64、密码或证书内容。Personal Team 的 profile/签名有效期短；CI 长期稳定性不能想当然。

## 5. 绝不可提交到 Git

- Apple ID 密码、App-specific password、双重认证验证码/恢复码。
- 私钥文件、`.p12`、`.p8`、keychain、证书导出密码。
- provisioning profile（应视为敏感签名材料）、设备 UDID 清单（除非明确需要且限制访问）。
- GitHub token、任何 Actions secret 值。

不要把以上材料写入源码、`Info.plist`、workflow 明文、报告、提交信息、构建日志或 issue。若曾泄露，立即撤销/轮换相关凭据。

## 6. Windows + GitHub Actions 签名路径

Windows 本机不能运行 Xcode，也不能创建 Xcode-managed Personal Team provisioning profile。可在 Windows 编辑项目，GitHub macOS Runner 负责 CocoaPods、Xcode 构建和签名。只有在安全取得有效 `.p12` + private key、密码、profile 之后，才可将它们存为 GitHub Secrets，再在受保护的 macOS job 中临时导入并执行 archive/export；当前阶段没有加入这些 secrets 或签名命令。

对于免费 Personal Team，比较现实的路径是 GitHub Actions 产出未签名 IPA，然后在 Windows 上用 Sideloadly 通过 Apple Account 对 IPA 重签并安装。若以后必须在 Actions 完成个人签名，先单独验证 free team 是否支持可重复取得/更新的证书和 profile；否则需要带 Xcode 账号授权的 Mac 流程或付费开发者账号支持的签名流程。

## 7. 用 Sideloadly 安装

1. 从 Sideloadly 官方网站安装 Windows 版，并使用官方 Apple 设备驱动/iTunes 组件；用 USB 连接 iPhone 并在设备上点“信任此电脑”。
2. 从 Actions artifact 下载 `ios-unsigned-ipa-<Run ID>`，解压外层 artifact ZIP，取出其中的 `LXMusic-unsigned.ipa`。
3. 在 Sideloadly 选择 IPA 和本人设备，填写 Apple Account 并依提示完成 Apple 验证；账号凭据只输入 Sideloadly，不交给项目或 GitHub。
4. 开始 sideload 后，检查 Sideloadly 输出是否成功；设备上若要求，启用 Developer Mode，并在 VPN 与设备管理/设备管理中信任开发者。
5. 免费个人签名通常需在约 7 天后重新签名安装；保存原 IPA 并按 Sideloadly 的后续刷新方式维护。未签名 artifact 自身不能直接安装。

## 8. 当前 iOS 隐私与后台配置核查

- 网络：iOS 没有通用的“网络权限”提示。工程沿用 ATS 默认禁止任意 HTTP 的配置，同时允许本地网络；不增加网络权限项。
- 背景音频：此音乐应用使用 `react-native-track-player`，已在 iOS Info.plist 声明 `UIBackgroundModes = audio`，以允许系统在后台继续处理音频。真实后台行为仍需真机验证。
- 锁屏/控制中心媒体控制不是单独的隐私权限；需播放器 iOS 原生实现和系统 Now Playing/remote command 配置，另行验证。
- 未找到应用主动请求麦克风、地理位置或蓝牙访问的 iOS 代码，因此不添加麦克风/蓝牙权限。删除了原先空值的 `NSLocationWhenInUseUsageDescription`；若将来引入实际定位功能再补充有意义的用途说明。
