# LX Music Mobile iOS 移植技术审计与计划

> 审计范围：`E:\洛雪音乐\lx-music-mobile-master` 当前工作树。只读检查；未安装依赖、未改动既有源代码。本文是移植计划，不代表 iOS target 已经可以编译或运行。仓库没有 `node_modules`，本机是 Windows，无法执行 CocoaPods/Xcode 验证；以下凡未实测之处均明确标为 TODO。

## 结论摘要

- 项目适合继续做 iOS：它是 React Native 应用，已有 `ios/` Xcode/Podfile 骨架，播放器依赖所用的 lyswhut TrackPlayer fork也包含 iOS 原生实现。
- 当前不能认定“可编译”：iOS 工程有占位 Bundle ID、空的定位用途说明、缺少应用图标内容/Podfile.lock，且若干启动必经原生模块只有 Android 注册实现。`react-native-local-media-metadata` 自述 Android-only，所检查的 fork 没有实际 iOS 实现。
- 最大难点不是重写 UI，而是完整替代用户音源脚本的 Android QuickJS bridge（其在 app 启动中无条件初始化），并同时把 Android 文件/权限/原生模块调用从共享 JS 路径中隔离出来。
- 目标音乐后台播放、锁屏和控制中心控制有较好的复用基础；须启用 iOS Audio Background Mode 并验证 fork API、元数据、队列和硬件按键。

## 1. 项目技术栈

| 项目 | 当前情况 |
|---|---|
| UI / JS | React 18.2.0、React Native 0.73.11、TypeScript/JavaScript |
| 导航 | `react-native-navigation` 7.39.2，`AppDelegate.mm` 使用 RNN bootstrap |
| 播放 | 固定 Git SHA 的 `react-native-track-player` 2.1.2 fork；JS 服务注册和队列管理在 `src/plugins/player` |
| JS 引擎 | Android `hermesEnabled=true`、`newArchEnabled=false`；iOS 是否采用 Hermes 取决于 RN/CocoaPods 配置，需在 Runner 验证 |
| 状态/存储 | `src/store` 中的项目自有 store/actions/hooks（不是 `redux` / `react-redux` 包）；AsyncStorage 2.1.2 |
| 网络 | RN `fetch`（`src/utils/request.js` 等）及自有音源请求/同步逻辑 |
| 原生 | Android Java 手工注册多个 NativeModule；iOS 尚无对应的 app 自有模块实现 |
| 构建 | Android Gradle；iOS Podfile + Xcode project/scheme 已存在。GitHub Actions 当前 release workflow 只编 Android |

## 2. 当前目录结构（与移植有关）

- `android/`：Gradle、Manifest、Java activity/application 与 Cache/Crypto/Lyric/UserApi/Utils 原生包；QuickJS wrapper 依赖也在 `android/app/build.gradle`。
- `ios/`：已有 Podfile、`LxMusicMobile.xcodeproj` / scheme、`AppDelegate.mm`、Info.plist、LaunchScreen、测试 target、AppIcon catalog 骨架。不是已完成的 iOS 移植；无项目自有 iOS NativeModule 源文件、无 Podfile.lock，图标集没有实际图像。
- `src/core/`：启动编排、播放器、音源/用户脚本、同步、文件/权限和桌面歌词功能入口。
- `src/plugins/`：TrackPlayer、持久化、同步等功能层。
- `src/utils/`：Android NativeModule facade、文件系统、权限/Toast/设备信息等跨层工具。
- `src/components/`、`src/screens/`、`src/navigation/`、`src/theme/`、`src/lang/`、`src/resources/`：共享 UI、布局、资源和多语言。
- `.github/workflows/`：Android release 与测试/辅助 workflow；无 iOS build workflow。

## 3. 兼容性总览与 A：可直接复用的部分

在验证无 Android 隐式依赖并满足 ATS/路径条件后，以下大部分 JS 业务可共享：React UI、主题/语言、列表与播放页面、设置/用户列表、歌词解析（`lrc-file-parser`）、音源业务与 JSON 处理、Redux-like 项目 store、AsyncStorage 数据模型、gzip/编码/解析等纯 JS 逻辑、TrackPlayer JS 队列/控制逻辑、RN `fetch`、RN `Image`/图片显示和基础 slider/pager。网络图片/音源是否可用仍取决于 URL、ATS/TLS、服务端 header 和图片格式。

未发现 `react-native-webview` 或 WebView 使用，故不需要迁移 WebView。

## 4. Android-only 原生能力（C）及改造方向

Java 文件位于 `android/app/src/main/java/cn/toside/music/mobile/`；没有项目自有 Kotlin 源码。`MainApplication.java` 手动注册包：

| 模块 | Android 当前职责 | iOS 处理建议 |
|---|---|---|
| `cache/CacheModule` | 查询/清理应用缓存 | 改走沙盒缓存目录的跨平台实现，或为确实需要的 API 写 iOS bridge；验证清理范围，避免误删用户文件 |
| `crypto/CryptoModule`, `AES.java`, `RSA.java` | RSA/AES/SHA1，部分同步调用 | 对齐算法、padding、编码、签名格式；优先跨平台 JS/受维护 RN 包，否则以 Security/CommonCrypto 实现 iOS bridge。不能简单用不兼容算法替换 |
| `lyric/LyricModule`、`LyricView`、`LyricPlayer` 等 | Android 悬浮桌面歌词、overlay 权限、窗口与事件 | iOS 不允许任意其他 app 上方桌面悬浮窗。保留 app 内歌词页/歌词显示；平台化隐藏“桌面歌词”设置或明确解释不可用。Android 实现保留不动 |
| `userApi/UserApiModule`、`QuickJS.java`、`JavaScriptThread`、handlers | 执行用户音源脚本、线程隔离、请求/事件 bridge | 必须提供兼容的 iOS QuickJS runtime + bridge 或选定经核验的跨平台 QuickJS 库。Hermes 不是可直接等价替换的隔离脚本 API；脚本兼容、超时/取消、安全性和事件契约均需测试 |
| `utils/UtilsModule` / helpers | 退出、ABI/APK 安装、保持屏幕常亮、IPv4、设备名、通知设置、分享、系统语言、窗口、电池优化、屏幕事件 | 逐 API 替代：无 iOS APK 安装/ABI/电池忽略/Android 退出语义；分享用 RN Share/系统 share sheet；常亮用 RN/iOS 支持 API；系统语言和尺寸优先 RN API；其余写 iOS facade 或条件化。无意义能力不应在 iOS 调用 |
| `MainActivity` / `MainApplication` | Android 生命周期、back handler、原生包注册、Hermes | 以现有 AppDelegate/RNN iOS bootstrap 为入口；核对 RNN 要求的 AppDelegate hooks 与依赖 autolink |

注意：`Platform.OS === 'android'` 搜索命中很少，不代表功能跨平台。`src/utils/tools.ts` 直接导入 `PermissionsAndroid`、`ToastAndroid`、`BackHandler`；多个 NativeModule facade 在模块顶部直接解构 `NativeModules.*`。需在调用边界做平台实现，而不是只看 `Platform.OS` 文本命中。桌面歌词和用户脚本 init 均从启动路径进入。

## 5. iOS 已有内容及完成度（E）

有 iOS scaffold：Podfile 使用 RN autolinking、`min_ios_version_supported`、Flipper 开关与 `use_react_native!`；Xcode scheme/target、RNN AppDelegate bootstrap、Bundle JS build phase 均在。`package.json` 也有 `ios: react-native run-ios` 脚本。

但目前没有证明过 `pod install` 或 Xcode build 成功。未看到项目自有 iOS 原生模块；`Info.plist` 的 `NSLocationWhenInUseUsageDescription` 为空、ATS 禁 arbitrary loads（允许 local networking）、`UIRequiredDeviceCapabilities` 仍写 `armv7`；工程仍需设置真实唯一 Bundle ID、版本/build number、图标和所需 capability。部署目标在 Xcode project 中是 iOS 13.4（Podfile 实际由 RN helper 决定，需 Runner 确认二者一致）。这些配置应在首轮 macOS 验证中逐项校正，不能把空文案/armv7 当作已适配。

## 6. 文件、权限、通知与系统集成

### 文件系统 / 本地文件 / 下载缓存

`src/utils/fs.ts` 同时包装 `react-native-fs` 和自有 `react-native-file-system`。其 `Dirs.CacheDir`、`Dirs.DocumentDir`、常规读写、gzip 和 RNFS 下载有可复用基础；Android 专有部分是 `Dirs.SDCardDir`、`AndroidScoped.openDocumentTree/openDocument` 和持久化 URI 权限。iOS 应使用 app sandbox（Caches/Documents）并为用户选取的外部文件/文件夹接入 UIDocumentPicker/security-scoped URL（或受支持的文件选择库），处理授权生命周期；不能映射成 Android 外置盘路径。审计期间确认该 file-system fork 存在 iOS source/podspec，但其 iOS API 完整性、autolinking 和行为仍需 macOS 实测，故不可把 `AndroidScoped` 当成已有 iOS 能力。

`react-native-fs` 有 iOS 支持并暴露 iOS download 选项，但现有调用主要下载到临时路径；需测试暂停/续传/后台回调和 App 终止行为。TrackPlayer cache 与普通下载是不同路径。音乐下载实现当前存在注释/不完整逻辑；iOS MVP 不应宣称已支持完整下载。数据导入导出须接 iOS document picker。

### 权限

- iOS sandbox 通常不申请 Android 式全盘存储权限；移除共享流程对 `PermissionsAndroid` 的无条件依赖，将“导出/选择文件”转换成用户主动 picker 授权。
- `NSLocationWhenInUseUsageDescription` 目前为空；若产品没有定位功能，应核查为何存在并移除无用声明，而非填造理由。
- 音乐后台音频是 Background Modes 能力，不是通知/定位权限。用户可选择在系统媒体控制界面操作，无须为普通播放申请推送权限。
- 按需评估 local network 权限提示、蓝牙/音频路由权限；TODO：确认实际使用的 API 是否要求 `NSLocalNetworkUsageDescription` / Bonjour 声明。勿预先声明未使用的权限。

### 网络/ATS、通知、图片、歌词

- 请求由全局 `fetch` 和自有 request helper 执行。Info.plist 当前 `NSAllowsArbitraryLoads=false` 且 local networking true；源码版本列表包含一个 HTTP URL，用户音源也可能返回 HTTP。盘点所有业务源实际 scheme，优先迁移 HTTPS；如确实需要例外，按域名设置最小 ATS 例外，避免全局放开。同步/自定义音源的明文 HTTP 也要真机检查。
- 当前所谓通知栏播放控制由 TrackPlayer Android foreground notification 实现；iOS 对应锁屏/控制中心 Now Playing，不是复制 Android notification channel。`checkNotificationPermission`、`UtilsModule` 的通知设置跳转和“通知未授权”提示需要 iOS 条件化。TrackPlayer audio controls 不应误报成需要通知权限。
- 图片主要用 RN `Image` 与 `Image.prefetch`；专辑封面可用作 Now Playing artwork，需验证远程 URL、缩放、缓存、HTTPS 与大图内存行为。`react-native-local-media-metadata` fork README 标 Android-only；检查的仓库树没有其实际 iOS native source，且本项目 metadata helper 中多个调用已注释。若启用本地音频标签读取/封面/歌词，需 iOS 实现或替代库，否则标注受限。
- LRC 解析为 JS 可复用；进度与当前行更新可在前台歌词界面复用。Android 悬浮歌词不可跨到 iOS 桌面；控制中心完整歌词/自定义 lyric metadata 是否受 iOS 与该 fork 支持，TODO 真机验证，不承诺歌词逐行在系统界面展示。

## 7. 音频与播放器方案（D、7–9）

播放器是最有利的复用点：`src/plugins/player/{index,utils,service,playList}.ts` 已用 TrackPlayer 做 setup、queue、seek/play/pause、远程事件、metadata 更新，并映射 `title`、`artist`、`album`、`artwork`、`duration`。JS service 已监听 RemotePlay/Pause/Next/Previous、RemoteSeek/Stop。固定 lyswhut fork 的对应源码树含 iOS Swift 实现和 podspec，说明不是 Android-only 播放器；但该项目固定 SHA 的 fork/API 兼容性和 RN 0.73.11 build 未在此环境实测。

| 目标 | 初步判断 | 前置条件/待验证 |
|---|---|---|
| 后台播放 | 可实现，复用 TrackPlayer iOS audio session/backend | Xcode target 开 Background Modes → Audio（`UIBackgroundModes` audio）；真机锁屏、前后台切换、断网、音频焦点/来电验证 |
| 锁屏控制 | 可实现 | iOS Now Playing info + remote command center 由 fork 管理；真机验证命令映射 |
| 控制中心播放控制 | 可实现 | 同上；不是 Android notification channel |
| 播放/暂停 | JS handler 已具备 | `RemotePlay/RemotePause` 在 iOS 触发、恢复状态正确 |
| 上一首/下一首 | JS handler 已具备 | 队列边界、上一首语义与 TrackPlayer iOS remote command 验证 |
| 标题/歌手/专辑封面 | JS 已有字段 | Now Playing metadata 字段与封面 URL/缓存确认；关闭“通知图片”设置时预期无 artwork |
| 歌词/滚动歌词 | 非承诺项 | Android 通知歌词/桌面歌词不是 iOS 等价功能；系统界面 lyric metadata TODO |
| 蓝牙/耳机媒体按键 | 理论可用 | iOS remote commands 接收来自耳机/车载蓝牙的 play/pause/next/previous；不同设备/耳机映射和抢占行为真机验证，蓝牙路由本身无需自建 Android 式 service |

`react-native-background-timer` 虽有 iOS native 部分，但 iOS 会挂起普通 JS；它不能让应用任意后台常驻，也不能作为持续计时/刷新/保活保证。让系统允许的是活跃音频会话。后台时仅依靠系统音频播放与受限生命周期回调，不承诺后台继续执行全部音源脚本、同步、歌词轮询或任意网络任务。

## 8. 依赖清单与 iOS 风险（G、26）

以下为当前 `package.json` 全部 production dependencies（版本是 package 范围/固定 Git SHA；本审计未安装包）。第三方 native pod 的最终兼容性以 `npm ci` 后 `pod install` 与 Xcode 编译为准。

| 依赖 | 初步分类 / 风险 |
|---|---|
| `@craftzdog/react-native-buffer` 6.1.2、`he` 1.2.0、`iconv-lite` 0.7.3、`lrc-file-parser` 2.4.2、`pako` 2.2.0、`message2call` 0.1.3 | JS 层依赖，初步可复用；message2call 的网络/原生依赖链 TODO 核验 |
| `@react-native-async-storage/async-storage` 2.1.2 | 有 iOS 原生实现，Pod/autolink 实测 |
| `@react-native-clipboard/clipboard` 1.16.3（package 范围 `^1.14.3`） | 有 iOS 实现，autolink 与 RN 0.73 兼容性实测 |
| `@react-native-community/slider` 4.5.7 | 有 iOS 原生实现；检查样式/事件差异 |
| `react-native-background-timer` lyswhut SHA | 有 iOS 实现；后台 timer 不等于后台常驻，需避免错误依赖语义 |
| `react-native-exception-handler` 2.10.10 | 原生依赖；iOS handler 是否实现/与当前 RN API 兼容 TODO，崩溃处理不能阻塞构建 |
| `react-native-file-system` lyswhut SHA | fork 有 iOS source/podspec，但文档偏 Android、iOS API 覆盖需逐项核验；`AndroidScoped` 明确不可复用 |
| `react-native-fs` 2.20.0 | 有 iOS 原生支持；沙盒路径/后台下载与当前调用需验证 |
| `react-native-local-media-metadata` lyswhut SHA | 高风险：README 表明 Android-only；仓库树未见实际 iOS native 实现，虽有 podspec glob 不等于支持。若启用需 iOS 替代/实现；当前部分 wrapper 调用已注释 |
| `react-native-navigation` 7.39.2 | 支持 iOS，但要求正确 AppDelegate bootstrap、pods、bundle ID；RN 0.73/RNN 7 集成待实编 |
| `react-native-pager-view` 6.7.1 | 有 iOS 原生组件，Pod/布局/手势实测 |
| `react-native-quick-base64` 2.2.2、`react-native-quick-md5` 3.0.9 | 含 native/JSi 路径，分别核实 podspec、iOS 源码、Hermes/JSC与 RN 0.73 兼容；首轮编译风险 |
| `react-native-track-player` lyswhut SHA（标 2.1.2） | fork 有 iOS Swift/backend；目标功能基础良好，但 API/编译/Background Mode 必须验证 |
| `react-native-vector-icons` 10.2.0 | 有 iOS 字体资源配置要求；按其版本方式确认 pod/font registration 与图标显示 |

dev tooling 风险：RN 0.73.11 与 `@react-native/babel-preset`、`@react-native/metro-config`、`@react-native/typescript-config` 声明 `^0.74.89` 不齐；本次不升级，但应作为构建可复现性风险先记录并在 Runner 首轮验证。`package-lock.json` v3 有锁定版本。Android-only QuickJS 依赖 `wang.harlon.quickjs:wrapper-android:2.4.0` 是 Gradle implementation，不是 package.json npm dependency，因此 iOS 不会自动得到对应 runtime。

开发依赖完整盘点（不打包进 production app，但影响 Windows/CI 的 JS bundle、lint、类型检查）：`@babel/core` 7.29、`@babel/eslint-parser` 7.28、`@babel/plugin-proposal-export-namespace-from` 7.18、`@babel/preset-env` 7.29、`@babel/runtime` 7.29、`@react-native/babel-preset` 0.74.89、`@react-native/metro-config` 0.74.89、`@react-native/typescript-config` 0.74.89、`@tsconfig/react-native` 3.0.9、`@types/he` 1.2.3、`@types/react` 18.3、`@types/react-native` 0.72.8、`@types/react-native-background-timer` 2.0.2、`@types/react-native-vector-icons` 6.4、`babel-plugin-module-resolver` 5.0、`changelog-parser` 3.0、`eslint-config-standard` 17.1、`eslint-config-standard-with-typescript` 43、`eslint-plugin-react` 7.37、`eslint-plugin-react-hooks` 5.2、`typescript` 5.9。CLI/build tooling由 lockfile 的 RN CLI 依赖提供。所有以上版本均以 `package.json` 声明范围/版本为准；实际解析版本以 lockfile 为准。它们本身不是 iOS 原生 Pods；重点风险是 RN preset/Metro/typescript config 比 RN 本体高一个 minor 线，及类型包不一定和 RN 0.73 API 同步。

## 9. 需要修改的现有文件（实施阶段，不是本次审计修改）

预计按阶段评估以下文件，不应一次性大改：

- `src/core/init/index.ts`、`src/core/init/userApi/index.ts`、`src/utils/nativeModules/userApi.ts`：把用户脚本运行时初始化/bridge 做成平台适配；启动不能在 iOS 因缺失 NativeModule 崩溃。
- `src/utils/fs.ts`、`src/components/common/ChoosePath/*`、`src/core/common.ts`：将 AndroidScoped/外置路径/权限检查换成平台 facade 与 iOS document picker；保留 Android 行为。
- `src/utils/tools.ts`、`src/utils/nativeModules/utils.ts`、`src/utils/nativeModules/{cache,crypto,lyricDesktop}.ts` 及其调用者：消除原生模块顶层解构缺失、把 toast/退出/权限/缓存/密码/桌面歌词等定义成明确平台能力。
- `src/core/desktopLyric.ts`、歌词设置相关 `src/screens/Home/Views/Setting/**`：隐藏/解释 iOS 不支持桌面悬浮歌词；保留 Android UI/能力。
- `src/utils/version.js`：Android APK 自动更新不可移植；iOS 版本检查/download/install 逻辑需禁用或另设更新提示（iOS app 不能自行安装 IPA）。
- `src/plugins/player/{utils,service,playList}.ts`：播放器主体优先复用，只在 iOS API/元数据行为测试发现差异时改；审查 `exitApp`/RemoteStop、歌词和 artwork 逻辑。
- `src/core/init/player/*`、`src/core/player/player.ts`、`src/utils/tools.ts`：去除 Android 通知权限/电池优化假设和后台 timer 保活假设。
- `ios/LxMusicMobile/Info.plist`、`ios/LxMusicMobile.xcodeproj/project.pbxproj`、`ios/Podfile`、`ios/LxMusicMobile/AppDelegate.mm`：Bundle ID、版本、deployment target、权限文案、ATS、后台音频、图标、RNN/Pods 配置；仅按实测需要修改。
- `.github/workflows/` 新增独立 iOS workflow，并可调整 release workflow 仅做合并上传；避免 iOS 重复创建现有 Android tag 或改变其产物。
- `package.json` / `package-lock.json`：只有经兼容性验证后才修改/替换依赖；应保留 Android 所需包并提交 lockfile 同步变更。当前审计不做依赖变更。

## 10. 预计新增文件（实施阶段）

- `src/utils/platform/` 或同类结构下的 iOS 实现与共享接口：user script runtime、文件/文档 picker、通知/设备工具、crypto/cache facade。具体文件名/API TODO，需在确认跨平台依赖方案后定稿。
- 若选 RN iOS QuickJS 原生方案：对应 `ios/...` Swift/Objective-C bridge 与 podspec/依赖配置（仅在许可证、来源、兼容性审查通过后新增）；不复制未知来源代码。
- iOS 原生测试/JS 单测：加密向量、脚本兼容、文件授权、播放器 metadata/事件覆盖。
- `.github/workflows/ios-build.yml`（或在现有 workflow 中新增隔离 job），`ExportOptions.plist`/构建脚本（按签名路线决定是否需要并安全管理）。
- iOS AppIcon 图片内容可由项目自有资源生成并填充现有 asset catalog，不需要新建 `ios/` 目录。

## 11. GitHub Actions macOS 构建方案（H）

建议新建独立 macOS job，先手动/分支触发验证，成熟后再接 release：

1. checkout；安装固定 Node 18+（匹配 `.nvmrc`）、Ruby/CocoaPods（按项目/RN要求固定版本）；执行 `npm ci`，而不是 `npm install`；在 `ios/` 执行 `pod install --deployment`（首次审计可不加 deployment，提交稳定 `Podfile.lock` 后再加）。
2. 使用 macOS runner 与 Xcode；查询 scheme/SDK，`xcodebuild -workspace ios/LxMusicMobile.xcworkspace -scheme LxMusicMobile -configuration Release -sdk iphoneos ...`。首次先 build/test 到 `.app`/archive，再处理签名和 IPA。
3. 编译 Hermes/JSC、Pods、RNN、所有 native module；将 DerivedData、Pods cache、npm cache 做缓存时按 lockfile key，失败时保留日志。
4. 上传 IPA 为 Actions artifact；不要在 iOS job 执行现有 Android tag 创建动作；版本由 package version 映射，但正式发布应避免与 Android tag race。
5. 真机安装与后台/蓝牙/锁屏 QA 由 iPhone 完成；模拟器不能验证 Sideloadly、真实音频中断/耳机按键和签名安装全流程。

Windows 可完成：JS/TS 代码审计与大部分共享层实现、平台分流、文档/配置编辑、静态 lint/类型检查（装依赖前遵循项目现状）、GitHub workflow 编写、JS 单测/逻辑测试、manifest/plist 文本核对。Windows 不能本地运行 Xcode、CocoaPods 的 iOS 集成、iOS 编译/link、archive/export、Apple provisioning/codesign、iOS simulator 或设备运行。

必须在 macOS/Xcode Runner：`pod install`、iOS Pods/native module 验证、Xcode compile/link/archive、Hermes/JSC 和架构检查、签名/export IPA。必须在真实 iPhone（由用户侧完成）验证安装、锁屏/控制中心、蓝牙键、背景/中断和权限弹窗。Windows 无需 Mac 的限制不妨碍先开发共享 TS/JS，但不能完成端到端 iOS 验证。

## 12. IPA 与签名方案

IPA 是签名后的 iOS app 分发容器。常见可行路线：

1. **推荐稳健路线（Apple Developer Program）**：GitHub Actions 使用受保护的签名 secrets（Apple Distribution/Development certificate `.p12`、密码、provisioning profile、team/bundle ID，或 App Store Connect API key + 自动签名），解密到临时 keychain，`xcodebuild archive` + `-exportArchive` 导出适合目标设备/分发方式的 IPA，再清理临时 keychain/profile。私钥和 profile 不进仓库或日志。具体 distribution/profile 类型需按 Sideloadly 安装方式验证；开发者签名 IPA 的设备 UDID 必须在 profile 中（Ad Hoc）。
2. **个人 Sideloadly 重新签名路线**：Actions 产出未分发签名的构建产物/可供重签名的 IPA，用户下载后用 Sideloadly 在本地用自己的 Apple ID 给 iPhone 安装/签名。必须实测无签名 IPA 的打包方式与 Sideloadly 兼容性；Apple 免费个人签名通常有有效期/应用数量限制，需周期性重签。若用户不配置开发者证书，GitHub 不能替其生成有效个人 provisioning profile。

严禁把 Apple ID 密码、证书私钥以明文提交。选择路线、team、bundle ID、是否付费开发者帐号、Apple provisioning、bundle capability 是实施前 TODO。Sideloadly 是安装/签名工具，不负责修复缺失原生代码或构建失败。

## 13. 主要风险与待确认项

1. **P0 用户音源脚本运行时**：启动无条件 `initUserApi`，Android QuickJS bridge 无 iOS 实现会使功能不可用或启动失败。需验证一款合法、维护中、兼容 RN 0.73/Hermes 的 iOS QuickJS 方案及现有脚本 API 覆盖率；TODO。
2. **P0 原生依赖编译**：多个 Git fork/Quick native packages、RNN 7、RN 0.73.11 首次 Pods/Xcode 编译未验证。dev tooling 还有 RN 0.73 与 0.74 preset/config 版本偏差。
3. **P1 Android API 共用调用**：Permission、Toast、NativeModules facade 顶层解构、桌面歌词、APK update 等可能在 iOS 运行时 throw；静态搜 `Platform.OS` 不足以覆盖。
4. **P1 文件访问**：Android tree URI/外置 SD card 无 iOS 等价物；需定义 picker 后授权、备份/导入导出体验。
5. **P1 协议/安全/兼容性**：HTTP 音源与 ATS、用户脚本能力/安全隔离、QuickJS 行为、TLS 与 Header、Crypto 算法兼容。
6. **P1 播放器 fork**：虽然有 iOS source，未知 fixed SHA 在 RN 0.73 上是否可 Pod 编译；远程控制、封面、背景模式及播放中断必须真机测试。
7. **功能差异**：iOS 桌面悬浮歌词、APK 自更新、全盘/SD 卡扫描、电池优化白名单无法照搬；以平台化 UX 替代，不影响 Android。
8. **发布签名**：Actions secrets/Apple Developer account/设备 UDID 管理；个人免费侧载的重签周期与安装数量限制。
9. **工程配置**：占位 Bundle ID、空定位用途说明、armv7 capability、无图标内容、target/deployment/version/ATS 需核验。

## 14. 分阶段开发计划（建议 7 阶段）

1. **基线与可编译性**：固定 Node/Xcode/CocoaPods 组合；Windows 侧核对 package/lock/调用图；Actions 仅做 `npm ci` + `pod install` + unsigned build，拿到首份真实错误清单。确认版本错配但先不盲目升级。
2. **跨平台边界整理**：为权限、toast、退出、存储路径、设备/系统工具、通知提示建立平台 facade；先保持 Android 行为不变，检查无 iOS NativeModule 顶层访问。
3. **启动阻断项/用户音源**：选择并实现经审查的 iOS QuickJS 与用户 API bridge；或在产品确认前定义受限 iOS 行为（这会损失“尽量保留功能”目标，需用户确认）。补脚本兼容测试。
4. **文件与系统功能替代**：iOS sandbox/document picker；加密/cache bridge 或跨平台实现；桌面歌词、APK 更新、Android 权限入口做平台化 UX；metadata 若产品仍需要则选可编译 iOS 实现。
5. **播放器与体验**：启用 Audio Background Mode，测试 TrackPlayer iOS 后端、锁屏/控制中心/蓝牙命令、metadata artwork、耳机/电话中断；调节只涉及必要的 JS/Info.plist。
6. **签名 IPA 与真机回归**：落实 Bundle ID、图标、签名路线和 Actions secrets；自动导出 IPA；Sideloadly 安装本人设备，做全功能回归与保留 Android 回归。
7. **发布/维护**：独立 workflow 上传版本化 IPA artifact；文档化重签/有效期/隐私权限；后续升级原生依赖前逐一回归 iOS 与 Android。

## 15. 第一阶段拟改文件（实施建议；本次未改）

首阶段目标是探明构建/阻断，不宜先改大量功能。优先只在验证后动：

1. `.github/workflows/ios-build.yml`（新增）：macOS `npm ci`、Pods、Xcode unsigned build/归档诊断与 artifact。
2. `ios/Podfile` / 提交 `ios/Podfile.lock`：Pods 可复现后锁定；lockfile 应由 macOS CocoaPods 生成。
3. `ios/LxMusicMobile.xcodeproj/project.pbxproj`、`ios/LxMusicMobile/Info.plist`：设置真实 bundle id、target 和必须的 capability/metadata；不要猜隐私用途文案。
4. `package.json` / `package-lock.json`：如第一轮 build 证明版本错配/原生依赖无 iOS 支持，再对最小范围修正并重新验证，不能本阶段先升级所有包。
5. 后续跨平台保护优先从 `src/core/init/index.ts`、`src/utils/tools.ts`、`src/utils/fs.ts`、`src/utils/nativeModules/*` 开始；QuickJS 具体方案确定后再改用户脚本路径。

**本审计实际变更：仅创建本文件；没有改源代码、安装/升级依赖或创建 iOS 目录。**
