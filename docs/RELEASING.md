# 发布说明

正式分发使用 npm 包 `guanyu-douyu`，源码仓库为 `Virace2022/guanyu`，GitHub Release 保存同版附件。工作流由版本 tag 触发；发布完成以 npm 正式版本可读取、对应 GitHub Release 已公开为准。

## 版本与产物

`version.json` 是唯一生产版本来源，格式为 `YYYY.<月×100+日>.N`。例如 `2026.1108.3` 表示 2026 年 11 月 8 日第 3 版，1 月 8 日写作 `108`。npm 版本、脚本 `@version` 与 tag `v2026.1108.3` 对应。根 `package.json` 的 `0.0.0` 仅标识未发布的开发工程。

准备下一版时运行 `npm run version:next`，按北京时间同日递增、跨日从 1 开始；也可在提交前直接修改版本文件，但必须符合相同规则。`npm run build` 不递增版本，可在同一版本反复检查。

| 产物 | 用途 |
| --- | --- |
| `dist/douyu.guanyu.user.js` | GitHub 渠道完整安装脚本 |
| `dist/douyu.guanyu.meta.js` | GitHub 渠道更新元数据 |
| `dist/guanyu-douyu-<版本>.tgz` | 精简 npm 包，包含当版四套 CDN 脚本、元数据、发布清单、README 和 LICENSE |
| `dist/SHA256SUMS` | 上述三个文件的 SHA-256 |
| `dist/npm/` | npm 打包的生成目录，不是源码包 |

构建只编译、压缩一次功能代码，再为四个 CDN 生成对应元数据。检查各渠道脚本与元数据一致、版本与安装身份相同、除更新地址外的元数据与功能代码相同、脚本语法、必要许可及 npm 的实际打包清单。源码、截图、开发依赖和历史版本不进入 npm 包，所有产物不提交到 Git。

## 安装与更新地址

五个渠道分别提供安装、检查更新与下载新版入口。CDN 首次安装链接使用具体版本，避免 `latest` 缓存导致新安装仍取得旧版；检查更新和下载新版使用本渠道稳定的 `@latest` 地址。GitHub 安装与更新都使用 latest Release 附件。准备版本时同步 README 和本节表格中的 CDN 安装版本。

| 渠道 | 首次安装 | 检查更新 | 下载新版 |
| --- | --- | --- | --- |
| GitHub Release | [user.js](https://github.com/Virace2022/guanyu/releases/latest/download/douyu.guanyu.user.js) | [meta.js](https://github.com/Virace2022/guanyu/releases/latest/download/douyu.guanyu.meta.js) | [user.js](https://github.com/Virace2022/guanyu/releases/latest/download/douyu.guanyu.user.js) |
| jsDelivr · Fastly | [user.js](https://fastly.jsdelivr.net/npm/guanyu-douyu@2026.1117.2/dist/fastly/douyu.guanyu.user.js) | [meta.js](https://fastly.jsdelivr.net/npm/guanyu-douyu@latest/dist/fastly/douyu.guanyu.meta.js) | [user.js](https://fastly.jsdelivr.net/npm/guanyu-douyu@latest/dist/fastly/douyu.guanyu.user.js) |
| jsDelivr · Quantil | [user.js](https://quantil.jsdelivr.net/npm/guanyu-douyu@2026.1117.2/dist/quantil/douyu.guanyu.user.js) | [meta.js](https://quantil.jsdelivr.net/npm/guanyu-douyu@latest/dist/quantil/douyu.guanyu.meta.js) | [user.js](https://quantil.jsdelivr.net/npm/guanyu-douyu@latest/dist/quantil/douyu.guanyu.user.js) |
| jsDelivr · 默认节点 | [user.js](https://cdn.jsdelivr.net/npm/guanyu-douyu@2026.1117.2/dist/douyu.guanyu.user.js) | [meta.js](https://cdn.jsdelivr.net/npm/guanyu-douyu@latest/dist/douyu.guanyu.meta.js) | [user.js](https://cdn.jsdelivr.net/npm/guanyu-douyu@latest/dist/douyu.guanyu.user.js) |
| jsdmirror | [user.js](https://cdn.jsdmirror.com/npm/guanyu-douyu@2026.1117.2/dist/jsdmirror/douyu.guanyu.user.js) | [meta.js](https://cdn.jsdmirror.com/npm/guanyu-douyu@latest/dist/jsdmirror/douyu.guanyu.meta.js) | [user.js](https://cdn.jsdmirror.com/npm/guanyu-douyu@latest/dist/jsdmirror/douyu.guanyu.user.js) |

GitHub 附件的元数据为：

```js
// @updateURL   https://github.com/Virace2022/guanyu/releases/latest/download/douyu.guanyu.meta.js
// @downloadURL https://github.com/Virace2022/guanyu/releases/latest/download/douyu.guanyu.user.js
```

例如 Fastly 专用脚本的元数据为：

```js
// @updateURL   https://fastly.jsdelivr.net/npm/guanyu-douyu@latest/dist/fastly/douyu.guanyu.meta.js
// @downloadURL https://fastly.jsdelivr.net/npm/guanyu-douyu@latest/dist/fastly/douyu.guanyu.user.js
```

管理器读取本渠道元数据中的新版本，再下载同渠道完整脚本。四套 npm 脚本位于 `dist/fastly/`、`dist/quantil/`、`dist/` 和 `dist/jsdmirror/`；默认节点保留原有 `dist/` 路径，使已安装的默认 jsDelivr 版本可沿旧地址升级。不能用其他域名直接替换路径，否则脚本内的渠道仍由该文件的元数据决定。

具体版本路径可长期缓存，不覆盖旧版本内容；`@latest` 由 jsDelivr 解析，[别名缓存](https://github.com/jsdelivr/jsdelivr#caching)可持续 7 天，更新受缓存与管理器检查周期影响。工作流只向官方 npm 发包，不调用其他镜像同步或 CDN purge 服务。开发服务不使用生产更新地址。

切换渠道时，从目标入口覆盖安装同名脚本。旧版已写入统一 jsDelivr 更新地址，无法追溯原来点击的下载域名；从 GitHub 或其他节点安装的旧版也需重新安装渠道版，才能改用所选更新源。脚本的 `@name` 与 `@namespace` 不变，不创建第二套安装身份或迁移用户数据。

### 远程验收

新版本发布并可从 CDN 读取后，运行：

```powershell
npm run release:verify
```

该命令分别请求五个公开渠道的首次安装脚本、更新元数据和新版下载脚本（GitHub 安装与下载相同，只请求一次），记录 HTTP 状态，并核对当前 `version.json` 版本、安装身份、本渠道更新地址，以及安装、更新和跨渠道功能代码的一致性。HTTP 错误、旧缓存版本、统一更新源或内容不一致都会返回失败；远程检查独立于本地构建，不自动发布、清缓存或重试。只有验证通过的渠道才在 README 启用安装链接。真实网络下的管理器安装与旧版升级仍需分别验收。

渠道分流从 `2026.1117.2` 开始提供，更早版本的同一路径不包含这些变体。新版本发布后须等待官方 registry 和 CDN 实际可读取，再更新 README 的可用渠道；不得覆盖已公开的同版附件或 npm 包。

管理器图标 `@icon` 使用仓库中的 `assets/brand/guanyu.svg`，经 jsDelivr 的 GitHub 路径按当前发布 tag 访问。图标不另存副本，也不加入 npm 发布包；页面内的小鱼继续内联，保留主题与悬停变色。

## 一次性配置

1. 用有权发布该包的 npm 账号登录官方 registry，完成邮箱验证和发布所需的 2FA。
2. 首次建包需要维护者以 npm 登录态完成。新包可按 npm 的 staged publishing 流程创建引导暂存包，npm 会公开 `0.0.0-stage` 占位版本。**首个正式版本发布成功前保留引导 stage**；此时拒绝唯一的 stage 会取消整个包的发布，并触发 24 小时同名发布限制。
3. 包建立后，在 npm 包 Settings 的 Trusted Publisher 中绑定仓库 `Virace2022/guanyu`、workflow 文件名 `release.yml`，允许直接 `npm publish`。GitHub 登录账号关联不能替代该绑定。
4. 绑定完成后，GitHub-hosted runner 使用 OIDC 和 `id-token: write` 发包，不需要在仓库保存长期 npm Access Token。工作流固定 npm 11.19.1；配置新 Trusted Publisher 后应按 npm 要求及时完成首次验证发布。

发布流程不执行 `npm stage reject` 或 `npm unpublish`；已发布版本出错时，通过新版本修复。

参考 [npm Trusted Publisher 文档](https://docs.npmjs.com/trusted-publishers/)、[staged publishing 文档](https://docs.npmjs.com/staged-publishing/)。

## 日常发布

普通 main push 和 PR 运行版本、签到、设置、背包、播放检查与构建。正式发布前，将代码、版本和工作流同步到远端 main，并完成真实页面验收。

获准发布后，为相应 main 提交创建并推送与版本文件一致的 tag：

```powershell
$releaseVersion = (Get-Content -Raw version.json | ConvertFrom-Json).version
git tag "v$releaseVersion"
git push origin "v$releaseVersion"
```

tag 工作流核对版本与 main 归属，运行全部现有契约检查和一次构建；先准备带四个附件的 Release 草稿，再发布 npm，最后公开 Release 并标为 latest。CI 不回写源码、版本或 tag。GitHub Release 使用自动生成的更新说明。公开后运行 `npm run release:verify`，并根据实测结果维护 README 安装入口；CDN 缓存未更新时不得报告该渠道通过。

## 失败与重跑

- npm 返回 `Your package is being processed` 时，上传已被接受，但 registry 可能仍返回 404、latest 仍为旧版。等待官方版本与压缩包可读后再验收 CDN；不要为处理等待而重复上传或递增版本。GitHub 工作流成功不能替代这一步。
- npm 尚未成功时，Release 保持草稿；修正认证或服务问题后重跑失败工作流。
- 整包取消发布后，npm 要求等待 24 小时才能再次发布同名包。冷却结束后先恢复包并核对 Trusted Publisher，再重跑原工作流；尚未发布的正式版本无需仅因等待而递增。规则见 [npm unpublish policy](https://docs.npmjs.com/policies/unpublish/)。
- npm 已成功时，重跑核对 registry 的 `dist.integrity` 与当前 tgz；相同则跳过上传，不同则停止并要求新版本。
- 已公开的 Release 核对四个附件的 SHA-256，不覆盖。草稿阶段可重传附件，再继续未完成步骤。
- 错误代码通过新版本修复，不覆盖同版本，也不依靠删除 npm 历史版本来重新发布。
