# 工程架构

观鱼构建为单个用户脚本，使用斗鱼原生播放器、页面和服务承载直播功能。功能契约见 [FEATURES](FEATURES.md)，界面约定见 [UI](UI.md)，运行命令见 [README](../README.md)。

## 工程与入口

| 部分 | 实现 |
| --- | --- |
| 开发与打包 | Vite + vite-plugin-monkey |
| 语言 | TypeScript 与已验证的 JS 模块，通过显式 imports 连接 |
| 自有界面 | Svelte 5、原生控件、dialog/popover；复杂交互按需引入 Bits UI |
| 运行入口 | `src/main.ts` → `src/core/bootstrap.ts` |
| 运行范围 | `https://www.douyu.com/` 下以数字开头的房间路径、`/beta/*`、`/topic/*` 与 `/member/cp/getFansBadgeList` 顶层页面，`document-idle` |

`bootstrap.start()` 创建配置、播放器与页面状态，再连接功能控制器、设置窗口、原生入口和右键菜单，返回统一释放函数。各功能分别等待自己的宿主，房间和节点变化通过订阅或适配层观察器传递。

## 模块职责

| 目录 | 职责 |
| --- | --- |
| `src/core/` | 启动、状态订阅、版本与释放组织 |
| `src/config/` | 默认值、校验、持久化和跨页通知 |
| `src/adapters/douyu/` | DOM、React Fiber、Webpack、官方服务和接口 |
| `src/features/` | 功能状态、业务规则、请求和调度 |
| `src/ui/` | 设置草稿、编辑器、即时操作、提示与显式样式 |

业务控制器通过适配层使用原生能力，UI 订阅状态并调用操作。设置窗口可以卸载，业务状态继续存在。选择器、服务发现和页面结构差异集中在适配层，不使用固定 Webpack 模块编号。

## 状态与存储

`createState` 提供轻量订阅。已保存配置、编辑草稿和本页运行状态分别持有，UI 控件不充当状态源。`SettingsStore.runtime` 合并已保存值与可撤回的显示预览，页面整理、弹幕和团播布局订阅此状态；签到、播放初始化等仍订阅已保存值。保存成功才写存储并清除预览，写入失败保留草稿；放弃或卸载窗口撤回预览，恢复最新保存值。

整条弹幕过滤在保存后才更新，避免预览期间丢弃后续消息。标记与进场提示通过显示样式预览，可在放弃时恢复。

`adapters/douyu/theme.ts` 优先观察官方 `data-mantine-color-scheme`。`ui/theme.ts` 合并手动主题和官方状态，向自有侧栏、预览标题、多屏选房和确认提示分发主题，`theme.css` 仅作用于自有主题宿主。`ui/edge-drag.ts` 处理侧栏指针拖动、键盘移动、视口与尺寸变化及释放。

页面增强通过 `--guanyu-page-accent` 共用主题色，独立窗口仍持有各自主题变量。续牌计划通过 `RoomApi` 批量补充主播头像；`glow-prompt.css` 显式挂载到窗口 Shadow DOM，原生消费行与多屏音量轨道复用官方结构、样式及资源。

任务中心的签到与观时领取由 `features/sign/points.ts` 分别执行并汇总结果。`task-request.ts` 的同源请求分支保留账号互斥、间隔、超时和释放，使用浏览器 fetch 处理任务中心 Cookie/CSRF；鱼吧等跨源请求继续使用 GM 桥接。

| 数据 | 存储键或范围 |
| --- | --- |
| 通用设置及各功能偏好 | `guanyu:settings:v1` |
| 主房间增益与恢复值 | `guanyu:gain:room:<真实房间号>` |
| 活动名单 | `guanyu:team:layout:v1:<活动标识>` |
| 团播分组与识别偏好 | `guanyu:team:preferences:v1` |
| 鱼吧/其他任务进度 | `guanyu:yuba:v1:<uid>`、`guanyu:daily-tasks:v1:<uid>` |
| 请求间隔与关注恢复 | `guanyu:task-gap:v1:<uid>`、`guanyu:follow-restore:v1:<uid>` |
| 共享检查请求与房间上下文 | `guanyu:task-retry:v1:<uid>:<daily或yuba>`、`guanyu:task-room:v1:<uid>` |
| 月消费每日汇总 | `guanyu:month-cost:v1:<uid>` |
| 月消费金额显隐 | `guanyu:month-cost:visible:v1:<uid>` |
| 预览、队员展开、镜像、分路音量和发声选择 | 本页/本次多屏运行状态 |

配置写入失败返回可识别错误；其他标签页的 storage 事件通知功能更新。名单和任务分别按活动、账号隔离。分享协议 `GUANYU1.` 使用 UTF-8 JSON 与 base64url，仅传活动和名单，导入只修改草稿。

## 播放与音频

`player.ts` 观察真实房间号、主媒体、音量宿主和原生全屏状态。`playback.ts` 调用官方网页全屏、画质和音量路径，原生音量存储的 `v` 保持二次 JSON 编码。

自动网页全屏复用 `room-page/controller.ts` 对 `/betard/<rid>` 的结果，仅对当前房间已开播且非轮播的状态执行。资料显示关闭时，播放功能仍可请求必要状态。

`volume-gain/controller.ts` 管理主房间倍率和记忆；`audio.ts` 通过 WeakMap 复用媒体音频源和 GainNode。释放时恢复单位增益，不强行断开已接管的音频上下文；HMR 复用同一资源，避免重复创建媒体源。

### 多屏音量

`multiscreen/audio.ts` 持有总音量、单路发声对象、各房间比例和静音恢复值。它不依赖 DOM 或 Svelte。

`multiscreen-audio.ts` 负责原生媒体和标签适配：

- 多屏期间仅在各媒体实例上接管 `volume/muted` 属性，保留原属性描述符；不修改全局媒体原型。
- 主视频向官方服务呈现当前底部音量，实际音量用原生属性描述符写入乘积，避免 SDK 回读后重复缩放。
- 副屏 SDK 的初始化/重连写入经过当前音量模式，音量按真实房间 ID 绑定。
- 标签克隆官方头像与名称结构，复用官方样式和喇叭图标；名称跳转仍调用官方回调，停用原左下角位置的跳转命中，保留加载重试。
- 标签与弹幕使用同级绘制顺序，插在弹幕之后、原生操作和编辑面板之前。布局按实际画面位置计算，原生位置避让展开的控制栏。
- 退出时恢复媒体实例属性、原标签与事件，清理自有层、观察器、帧任务和计时器。

`multi.independentVolume` 默认 false，`multi.centerLabels` 默认 true，两者保存后独立应用；布局和候选更新保留媒体节点。

## 团播与预览

`team.ts` 负责两类卡片识别、已提交 React Fiber 读取、真实成员和活动标识。`team-live/controller.ts` 持有活动名单、识别覆盖、开播状态与刷新调度。`TeamEditor.svelte` 只持有编辑草稿。

`team-card-preview.ts` 负责悬停借用和归还官方卡片组件，通过原位置占位引用维持名单发现的顺序与数量。官方开播图片来源随 `TeamSource` 传递，分组页面为队长和队员分别创建卡片行，主动多画面预览继续由既有 monitor 管理。

`team-layout.ts` 装饰原生卡片，管理统一高度、透明分组、浮动工具条、顶图和宿主尺寸恢复。`features/team-live/layout.ts` 提供非空队伍、实际列数及原生/自定义房间合并规则；自定义房间资料保存在名单内，不并入活动身份识别集合，原生资料优先。`ui/pointer-sort.ts` 负责手柄指针捕获、浮动 DOM、命中与边缘滚动，编辑器负责草稿实时换位和撤回。顶图外层与名单容器分别计算，只收回自身图层与顶部占位，导航间距交由 `room-layout.ts` 统一处理。`top-banner.ts` 处理非团播顶图，先确认播放器所属内容根及先后关系，再匹配已知图层，排除播放器内部和下方内容。

`ui/team-preview.ts` 为工具条和右键菜单提供统一的开启确认与空名单反馈，确认期间活动、布局或来源集合变化时不应用过期操作。

`team-live/preview/` 分工如下：

| 模块 | 职责 |
| --- | --- |
| `monitor.js` | 槽位、最多四个并发加载任务、可见性、回退、重试与资源释放 |
| `focus.js` | 逐队放大、同队暂停、可选高清原声及还原静音 |
| `stream-source.js` | 原生 HLS、低画质 FLV、原声来源、签名与地址续期 |
| `libraries.js` | 延迟加载 flv.js |

flv.js 1.6.2 从固定 npmmirror 地址按需加载，HLS 使用斗鱼 SDK。HLS 提前续期，连续 FLV 不周期重连；后台、全屏、屏幕外或收起时按槽位释放/恢复。

## 官方多屏与菜单

`multiscreen/controller.js` 组织候选、官方活动状态、刷新和启停；`rooms.js` 读取关注和房间资料；`panel.js` 增强选房面板并定位副屏右键目标。`feature.ts` 向设置暴露订阅和操作，并连接音量模型与适配器。

`adapters/douyu/multiscreen.js` 通过运行时能力发现官方服务，保存原名单，原子替换 battleList，使用 `fresh` 定点换人，保护主房间。关闭本地模式回到单屏；真实官方模式恢复原名单。

`player-menu.ts` 保留官方项并按配置插入动作，动作复用已有功能控制器，通过 `checked` 回调同步官方勾选前缀与 `aria-checked`，操作完成后立即刷新。`player-submenu.ts` 沿用官方子菜单结构与悬停/键盘行为。主播配置在入口启用后预读，结果按房间缓存，换房、关闭或释放时取消未完成请求。

## 页面与背包

`page.ts` 管理广告、活动、聊天高度和顶栏恢复；`barrage.ts` 处理原生标记、Shadow DOM 占位及 commentFilter 转发；`quick-dock.ts` 仅在确认 `#js-player-main` 直播间宿主后挂载小鱼，负责全屏重挂载，宿主消失时撤下入口。恢复时只撤回本模块样式或仍持有的原函数，不删除官方消息队列。

`room-layout.ts` 识别播放器在已知内容根中的直属区域，通过文档坐标和实际导航高度补足普通播放器的 8px、团播首个内容区的 32px 间距，网页全屏期间不重复计算。下方整理补足 24px 底部留白，逐层读取最上方内容的不透明背景供占位使用；各样式分别持有原值，关闭对应整理或释放时恢复。下方整理只标记该播放器区域之后、通过官方宿主和内容结构识别且不含受保护节点的模块，支持懒加载，关闭时撤回标记，不删除原生组件。

`native-shield.ts` 读取官方屏蔽元数据，以 `updateReducerShield/sendFlashShield` 整组应用七项偏好，保留未配置的隐藏项。就绪并应用后停止等待，仅进入房间和配置变化时重新应用。

`room-page/controller.ts` 管理直播/轮播资料与显示调度。`backpack-api.ts` 集中背包、粉丝牌、口袋、VIP、消费与赠送接口，`backpack-page.ts` 按原道具 ID 装饰页面。`backpack/controller.ts` 持有独立请求结果和待确认赠送计划；账号变化不复用旧计划，赠送失败不自动重发。

`backpack-page.ts` 将道具总亲密度留在背包，分别挂载月消费显隐、独立 VIP 提示、本房聊天工具栏牌龄和充值旁续牌按钮。`GlowPrompt.svelte` 与设置页调用同一个背包控制器的计划/赠送操作，窗口不持有独立业务。`ui/icons.ts` 复用线形图标并显式保留描边，避免原生 SVG 样式使图标不可见。

## 签到调度

`task-runner.ts` 长持账号级 Web Lock，统一鱼吧与其他任务的页面所有权；其他已匹配页面只同步状态或提交共享检查请求，接手时重新读取进度。共享真实房间号使缺少房间上下文的调度页也可处理需房间上下文的任务。`task-request.ts` 在请求时读取当前凭据，统一取消、超时、同源 Web Locks 与请求间隔，不持久保存凭据。`tasks.ts` 封装真实任务、鱼吧文章、等级和星推接口。`star-packet.ts` 通过官方事件和文字识别原生红包入口。

`sign/yuba.js` 和 `yuba-response.js` 管理鱼吧调度与成功判定；`daily.ts` 管理其他任务、逐房间结果、退避、官方进度和关注恢复；`feature.ts` 合并可订阅状态。进度按账号和北京时间保存，恢复未完成的关注还原操作优先于新增任务。

## 生命周期与样式

每项功能明确启动、配置变化、宿主重建和释放路径。后台业务与窗口生命周期分离；播放器与请求按功能自身的暂停/恢复契约组织，不全局伪造页面可见性。

自有窗口使用 Shadow DOM + dialog/popover，原生增强使用限定宿主的 CSS。样式通过 `?style` 显式导入，Svelte 使用 `emitCss: false`。页面宽度、状态刷新和布局调整不应重建播放实例。

## 构建与分发

- 入口显式导入依赖，构建单个 `dist/douyu.guanyu.js`，不整份嵌入仓库文档。
- Vite 使用 Oxc 的 compress/mangle，`codegen.removeWhitespace: false` 保留换行和缩进，CSS 使用 Lightning CSS。不启用属性重命名、unsafe 或 eval 解包。
- `scripts/licenses.mjs` 注入项目 MIT 正文及 Svelte 必要声明；`scripts/build.mjs` 检查产物语法与许可，全部成功后更新 `version.json`。
- 版本采用北京时间 `YYYY.MM.DD.N`；开发服务以“开发 · ”区分安装项，生产更新地址尚未配置。
- `assets/brand/guanyu.svg` 为唯一运行图标，由 `FishIcon.svelte` 和用户脚本元数据复用，当前内嵌。历史 PNG、设计稿与完整说明不进入运行包。
- `package.json` 当前为 `private: true`。后续 npm/OIDC 发布及固定版本 CDN 分发在发布任务中接入，不作为运行依赖。
