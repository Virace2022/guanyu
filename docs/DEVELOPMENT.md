# 开发说明

观鱼的工程标识为 `guanyu`，技术栈为 Vite、vite-plugin-monkey、TypeScript 和 Svelte 5。用户使用入口见 [README](../README.md)，功能契约见 [FEATURES](FEATURES.md)，模块与接口适配见 [ARCHITECTURE](ARCHITECTURE.md)。

## 本地构建

Node.js 版本需满足 `package.json`：`^20.19.0 || ^22.12.0 || >=24.0.0`。

在仓库根目录执行：

```powershell
npm ci
npm run build
```

构建产物为 `dist/douyu.guanyu.js`。通过用户脚本管理器导入该文件；管理器不支持文件导入时，可新建脚本，将产物完整内容粘贴进去并保存。启用后重新打开斗鱼直播间。

当前未配置正式下载、`@downloadURL` 或 `@updateURL`。本地重新构建后需手动更新已安装脚本。

## 开发调试

```powershell
npm run dev
```

服务固定在 `http://127.0.0.1:5173`，端口被占用时直接报错，不自动打开浏览器。通过用户脚本管理器安装服务提供的“开发 · 观鱼”，并保持服务运行；它支持热更新，不递增生产版本。开发项与生产项为独立安装项，在同一页面调试时只启用其中一个。

运行范围由 `vite.config.ts` 的用户脚本元数据定义：主站以数字开头的房间路径、`/beta/*`、`/topic/*` 和粉丝牌列表页，仅顶层页面，`document-idle` 执行。GM 跨源权限限定 `douyu.com` 与 `douyucdn.cn`。

## 检查命令

| 命令 | 检查范围 |
| --- | --- |
| `npm run check` | Svelte、TypeScript、Vite 配置与构建脚本 |
| `npm run test:sign` | 鱼吧、共享调度、粉丝家园与任务中心契约 |
| `npm run test:settings` | 设置预览、保存、放弃恢复与预览人数确认边界 |
| `npm run test:backpack` | 续牌数量、逐房赠送状态与账号切换隔离 |
| `npm run build` | 类型检查、生产打包、产物语法及必要许可 |

源码或依赖改动运行 `npm run check`；构建配置、入口、权限和分发改动运行 `npm run build`。根据受影响的功能运行对应契约检查。文档与截图修改核对内容、链接和图像即可。

真实页面适配只使用内置浏览器中的斗鱼页面，可直接注入构建产物；播放器相关交互在网页全屏下验收。直接注入不能替代用户脚本管理器安装、GM 跨源桥接和开发 HMR 的独立验收。类型、接口契约、真实 DOM、实际播放与人工听感分别记录证据，具体交互清单见 [UI 规范](UI.md#交互验收)。

## 版本与产物

生产版本使用北京时间 `YYYY.MM.DD.N`，保存在 `version.json`。构建先生成待验证版本，类型、打包、语法与许可检查全部成功后才写回版本；仅检查时使用 `npm run check`，避免为重复验证递增版本。

生产脚本使用 Oxc 压缩，保留元数据、换行、缩进及必要许可，不启用属性重命名、unsafe 压缩或 eval 解包。唯一运行图标为 `assets/brand/guanyu.svg`，仓库文档、截图和历史设计稿不进入运行包。

## 文档配图

README 的图片保存在 `docs/images/`。功能截图取自真实斗鱼页面，脚本版本为 `2026.11.08.3`。页面以 1600×1000 CSS 像素、2 倍像素密度渲染，保存无损 PNG 后裁到功能主体；细节图保留原始像素，不放大小图。README 中的缩略图链接到原图。

| 图片 | 内容与尺寸 |
| --- | --- |
| `team-editor.png` | 名单编辑器，2096×1520 |
| `team-layout.png` | 页面分组，2880×1096 |
| `multiscreen.png` | 网页全屏下的四路实际播放，2440×1784 |
| `multiscreen-volume.png` | 独立音量滑条，600×580 |
| `multiscreen-menu.png` | 画质与定点换房菜单，1280×620 |
| `multiscreen-picker-before.png` / `multiscreen-picker-after.png` | 官方大图选房与观鱼紧凑选房、快速取消的同区域局部对比，各 900×460 |
| `multiscreen-volume-before.png` / `multiscreen-volume-after.png` | 独立音量关闭与开启后的同区域局部对比，各 360×400 |
| `multiscreen-avatar-before.png` / `multiscreen-avatar-after.png` | 始终显示与仅显示头像的同区域局部对比，各 510×220 |
| `guanyu-meme.png` | “观鱼 / 关羽”介绍插画，1536×1024；按用户提供的三人合照生成，电视从左到右为午夜抹抹茶、寅子、主播阿飞 |

团播来自活动 59174；人物、队长、队员和红蓝队分配仅用于演示，不代表真实活动关系。四屏总览使用公开房间 71415、84452、5324055 和 302928；局部对比使用 71415、80432、320155 和 12485490，音量示例为午夜抹抹茶的 60%。选房前后保留同一候选来源，“开启前”恢复官方面板样式并隐藏观鱼已选栏，“开启后”展示紧凑布局与已选栏。其他两组仅切换对应设置，等待显示动画结束后拍摄。配图更新时保留这一说明，并备份、恢复演示用的设置与名单。
