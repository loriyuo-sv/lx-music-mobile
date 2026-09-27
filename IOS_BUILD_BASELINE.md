# iOS 构建基线（第一次 macOS Runner 验证）

## 当前记录状态

**等待 GitHub Actions 执行。** 本次运行环境是 Windows，且工作目录 `E:\洛雪音乐\lx-music-mobile-master` 不是 Git repository（`git rev-parse --show-toplevel` 返回 `fatal: not a git repository`）。因此无法从本机推送/触发 workflow，也不能运行 CocoaPods/Xcode。这里不伪造 Runner 版本、Pod 结果、Xcode 错误或“前 10 条真实错误”。

workflow 已新增为 `.github/workflows/ios-build.yml`。将文件提交并推送到 GitHub（或在 Actions 页面手动运行 `iOS Build Baseline`）后，它会在 `macos-15` 上执行安装与无签名 device SDK 编译；无论成功/失败都会上传 `ios-build-logs-<run id>` 完整日志 artifact，并在 Actions Summary 摘录诊断行。构建步骤没有 `continue-on-error`，也没有生成/上传 IPA。**当前无法断言 GitHub Actions 已成功启动；必须在推送后检查 run。**

## 1–5. Runner 与本地工程基线

| 项目 | 当前状态 |
|---|---|
| macOS Runner | Workflow 指定 `macos-15`；真实 image/Xcode patch 版本等待 run 输出 |
| Node.js | `.nvmrc` 为 `v18`；workflow 使用 `actions/setup-node@v4` 的 `node-version-file`。真实 `node --version` 记在 artifact 的 `toolchain.log` |
| CocoaPods | 由 GitHub hosted macOS image 提供；workflow 记录 `pod --version`，实际版本待 Runner |
| Xcode | 由 hosted image 提供；workflow 记录 `xcodebuild -version`，实际版本待 Runner |
| iOS Deployment Target | Xcode project 的 Debug/Release app/test 配置能查到 `13.4`；Podfile 使用 RN 的 `min_ios_version_supported`，最终 Pod deployment target 待 `pod install` 日志核对 |
| Bundle Identifier | app Debug/Release 使用占位值 `org.reactjs.native.example.$(PRODUCT_NAME:rfc1034identifier)`；不是用户最终 bundle ID，现阶段不签名 |
| Workspace | 检查时没有 `ios/*.xcworkspace`；预期 `pod install` 生成 `ios/LxMusicMobile.xcworkspace` |
| Xcode project/scheme | 存在 `ios/LxMusicMobile.xcodeproj` 与共享 scheme `LxMusicMobile` |
| CocoaPods lockfile | 当前无 `ios/Podfile.lock`；首轮 `pod install` 会解析并生成，建议成功后审查并提交，后续 CI 改成 `pod install --deployment` |

## 6–9. Pods、React Native、Hermes 与 Flipper

- `ios/Podfile` 是 RN 0.73 风格配置：通过 Node `require.resolve` 定位 `react-native/scripts/react_native_pods.rb`，执行 `prepare_react_native_project!`、`use_native_modules!`、`use_react_native!`、`react_native_post_install`，deployment target 来自 `min_ios_version_supported`。
- Podfile 没有显式列第三方 `pod`；原生 pods 主要通过 RN autolinking 从 npm dependencies 解析。workflow 会先执行锁文件安装 `npm ci --verbose`，保存 `npx react-native config` 输出，再执行 `pod install --verbose`，因此能定位自动链接结果/失败位置。
- 预期原生 iOS 依赖包括 React Native / Hermes（配置由 RN 脚本决定）、ReactNativeNavigation、AsyncStorage、Clipboard、Slider、BackgroundTimer、FileSystem、RNFS、PagerView、Quick Base64/MD5、TrackPlayer、Vector Icons 及其它声明原生 podspec 的依赖。**实际 pod 清单必须以首轮 `pod install` 的 `Podfile.lock` / 日志为准**；不要将这一预期列表当成解析成功证明。
- Android `android/gradle.properties` 显示 `hermesEnabled=true`、`newArchEnabled=false`。iOS 是否启用 Hermes 应以 `pod install` 的 RN 配置和 `xcodebuild` 宏/编译输出来确认；不能从 Android 属性推断。
- Podfile 声明 `FlipperConfiguration.enabled`，并支持 `NO_FLIPPER=1` 禁用；本 baseline 不设置 `NO_FLIPPER`，保留原配置验证。package.json 没有直接声明 `react-native-flipper`。Pods 是否实际包含 Flipper，以 `pod install` 为准。

## 10–11. iOS 原生源码与工程配置检查

- 项目 iOS app 原生源码目前为 Objective-C/Objective-C++：`ios/LxMusicMobile/AppDelegate.h`、`AppDelegate.mm`、`main.m`；测试为 `ios/LxMusicMobileTests/LxMusicMobileTests.m`。未发现项目自有 Swift 源文件。
- `AppDelegate.mm` 创建 `RCTBridge` 并调用 `ReactNativeNavigation bootstrapWithBridge:`；这条 RNN/RN 集成将由 Xcode 编译验证。
- `ios/LxMusicMobile.xcodeproj/project.pbxproj` 含 app/test targets、Pods 静态库引用、React Native JS bundle build phase、iOS 13.4 deployment target、Swift version 5.0、C++20、`ENABLE_BITCODE=NO`。Bundle ID 仍为 RN 示例占位值，版本为 `1.0` / build `1`。本阶段不改这些值，以便观察原始工程构建基线。
- 没有预置 workspace 或 `Podfile.lock`；空图标 asset 可能产生 warning/error，取决于当前 Xcode 的构建校验。实际以日志定性。

## 12. 构建执行结果（等待 Runner）

| 检查 | 结果 |
|---|---|
| GitHub Actions 是否成功启动 | **未触发 / 未知**：当前 checkout 不是 Git repository，无法推送触发；需 GitHub run URL 与 run ID |
| npm ci | 未运行（Windows 未执行安装；由 macOS workflow 执行） |
| React Native autolink 配置 | 未运行 |
| `pod install` 是否成功 | **未知 / 待 Runner** |
| `xcodebuild` 是否成功 | **未知 / 待 Runner**；仅在先前步骤成功后执行 |
| Xcode 编译失败在哪一步 | **无实测数据** |
| 构建日志 artifact | workflow 将完整保存 npm、RN config、CocoaPods、Xcode、toolchain 日志；run 完成后下载 `ios-build-logs-<run id>` |
| IPA / 签名 | 未执行；本 workflow 只 build，不 archive/export/sign、不生成 IPA |

### 第一批错误与前 10 条真实错误

目前没有 macOS 编译日志，故**第一批错误及前 10 条真实错误均待 GitHub Actions run 填入**。不能把静态风险预判伪装成构建错误。

Runner 执行后，请优先保存完整 artifact 原文；再从首次失败阶段记录 Xcode/CocoaPods 原始行号、错误文本和文件路径。不要只粘贴 Actions Summary 的 grep 摘录，因为完整上下文只在 log artifact 中。

| 序号 | 日志阶段 | 原始错误（逐字） | 对应文件/依赖 | 分类 | 优先级 | 状态 |
|---:|---|---|---|---|---|---|
| 1–10 | 待 Runner | 待填入原始错误；当前没有真实构建日志 | 待判定 | 按下方分类表 | 待判定 | 未验证 |

## 13. 错误分类规则

同一根因可能跨多个类别；以**首个导致阶段失败的根因**为主分类，其余标为关联影响。静态代码风险另列，不能记作构建错误。

| 分类 | 纳入内容 | 常见证据/位置 |
|---|---|---|
| A. CocoaPods 错误 | pod repo/spec 下载、Ruby DSL、podspec、deployment target、锁文件、依赖解析/集成失败 | `pod-install.log`、Podfile、具体 podspec/Podfile.lock |
| B. React Native 配置错误 | `react_native_pods.rb` 定位、CLI/autolink、RN scripts、Hermes/new architecture 配置错误 | `npm-ci.log`、`react-native-config.log`、Pod install/build phases |
| C. Objective-C/Swift 编译错误 | `.m/.mm/.h/.swift` 语法/API/模块/头文件编译失败 | `xcodebuild.log` 的 `CompileC` / `SwiftCompile` / `error:` |
| D. 第三方依赖不支持 iOS | 不存在 iOS podspec/source、仅 Android 原生依赖被 autolink 纳入或 vendor 源码 iOS 编译不兼容 | 具体 npm package 的 podspec/source 和 Xcode/PODS target |
| E. Android-only 原生模块 | app 自有 NativeModule 在 iOS 无注册/实现，或 JS 运行期访问 undefined 原生模块 | NativeModule facade/调用栈；注意它可能是 runtime 问题而非 Xcode 编译错误 |
| F. JavaScript/TypeScript 错误 | Metro bundle、Babel、TypeScript/JS 语法或 bundling 失败 | Xcode “Bundle React Native code and images” phase、Metro 输出、源文件 |
| G. Xcode 工程配置错误 | scheme/workspace、plist、asset catalog、build setting、签名配置（本 workflow 禁签）等 | `.pbxproj`、`Info.plist`、xcassets、xcodebuild invocation |
| H. 其他 | runner 网络/工具链/证书外因素、资源/磁盘、未归类失败 | toolchain/step 日志 |

### 当前静态风险（不是已发生错误）

| 风险 | 关联文件 | 分类预判 | 优先级 |
|---|---|---|---|
| 项目 JS 依赖配置版本偏差可能使 Metro/RN pod 脚本行为不匹配 | `package.json`、`package-lock.json`、RN config | B / F | P1；等真实错误确认后处理 |
| 原生依赖 podspec/autolink 对 RN 0.73 / iOS 编译兼容未实测 | 各 npm dependency、`ios/Podfile` | A / D / C | P0；基线主要目标 |
| Bundle ID 是示例占位值 | `ios/LxMusicMobile.xcodeproj/project.pbxproj` | G | P2；此阶段未签名 build 通常无需真实 ID，后续签名前改 |
| icon catalog 没有图像 | `ios/LxMusicMobile/Images.xcassets/AppIcon.appiconset/Contents.json` | G | P2；观察 Xcode 实际是否阻断 |
| QuickJS 用户音源、桌面歌词、文件权限 NativeModule 没有 app 自有 iOS 实现的证据 | `android/.../userApi`、`android/.../lyric`、`src/utils/nativeModules/*` | E / D | P1；主要是 runtime/功能移植阶段，不先改业务代码 |

## 14. 建议修复顺序

1. **先确认首个真实失败点及完整上下文**：下载 artifact；从 npm/RN config/Pods/Xcode 阶段顺序定位，别先修后续级联报错。
2. **P0 工具链 / CocoaPods 解析 / RN autolinking**：仅针对日志中的具体 package、podspec、Node/Ruby/Xcode 要求修复；Pod install 成功后生成并审阅 `Podfile.lock`，提交后固定依赖图。
3. **P0 原生 iOS 编译 / 第三方支持**：按每个失败的 Pods target 单独确认支持范围和 upstream/fork；不删除依赖、不用注释/continue-on-error 掩盖；确认 Android-only package 是否错误参与 iOS autolink。
4. **P1 JS bundle / Babel / Metro**：区分 JS 源码错误与配置版本错配；优先最小兼容修正，不升级 React Native。
5. **P1 Xcode project/plist/build settings**：修复实际阻断编译的项目配置；占位 Bundle ID、AppIcon、权限文案与签名相关配置按实际需要拆后续工作，避免把警告误判成 compile blocker。
6. **再处理运行时 Android-only 功能**：原生编译通过后进入用户脚本、文件访问、权限、歌词等平台适配；本 baseline 不修改业务代码。

## 15. 完成基线需要的 GitHub 操作

1. 将 `.github/workflows/ios-build.yml` 与本文档提交并推送到 GitHub。
2. 在 Actions 中查看 `iOS Build Baseline` workflow；push/PR 会自动触发，也可在 Actions 页面使用 `workflow_dispatch`。
3. 记录 run URL/ID、`toolchain.log` 中的实际 Node/CocoaPods/Xcode 版本、`pod install` 与 `xcodebuild` 结果。
4. 下载并保留 `ios-build-logs-<run id>`；按上述 A–H 表把首批真实错误逐条回填本文档，再确定下一步改动范围。

**本机静态检查不等同于 macOS 基线构建。本文件当前没有任何伪造的构建结论或错误记录。**
