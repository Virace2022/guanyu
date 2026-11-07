# 发布说明

正式分发使用 npm 包 `guanyu`，GitHub Release 保存同版附件。工作流已配置，当前尚未正式发布；功能完成并确认发布后再执行首次建包、可信发布绑定和 tag 推送。

## 版本与产物

`version.json` 是唯一生产版本来源，格式为 `YYYY.<月×100+日>.N`。例如 `2026.1108.3` 表示 2026 年 11 月 8 日第 3 版，1 月 8 日写作 `108`。npm 版本、脚本 `@version` 与 tag `v2026.1108.3` 对应。根 `package.json` 的 `0.0.0` 仅标识未发布的开发工程。

准备下一版时运行 `npm run version:next`，按北京时间同日递增、跨日从 1 开始；也可在提交前直接修改版本文件，但必须符合相同规则。`npm run build` 不递增版本，可在同一版本反复检查。

| 产物 | 用途 |
| --- | --- |
| `dist/douyu.guanyu.user.js` | 完整安装脚本 |
| `dist/douyu.guanyu.meta.js` | 仅含用户脚本元数据，供管理器检查更新 |
| `dist/guanyu-<版本>.tgz` | 精简 npm 包，只有当版脚本、元数据、发布清单、README 和 LICENSE |
| `dist/SHA256SUMS` | 上述三个文件的 SHA-256 |
| `dist/npm/` | npm 打包的生成目录，不是源码包 |

构建检查完整脚本与更新元数据一致、脚本语法、必要许可及 npm 的实际打包清单。源码、截图、开发依赖和历史版本不进入 npm 包，所有产物不提交到 Git。

## 安装与更新地址

首次安装链接使用具体版本，例如：

```text
https://registry.npmmirror.com/guanyu/2026.1108.3/files/dist/douyu.guanyu.user.js
```

生产脚本和元数据包含固定入口：

```js
// @updateURL   https://registry.npmmirror.com/guanyu/latest/files/dist/douyu.guanyu.meta.js
// @downloadURL https://registry.npmmirror.com/guanyu/latest/files/dist/douyu.guanyu.user.js
```

管理器读取元数据中的新版本，再下载完整脚本。`latest` 由镜像重定向到具体版本路径；具体版本可长期缓存，不覆盖旧版本内容。镜像同步、入口缓存和管理器检查周期会影响更新出现的时间，不承诺即时更新。开发服务不使用生产更新地址。

首次正式发布还需在实际国内网络核对安装与旧版升级。GitHub Release 可直接下载同版完整脚本，npm 发布成功不等于国内镜像已同步。

## 一次性配置

1. 用有权发布该包的 npm 账号登录官方 registry，完成邮箱验证和发布所需的 2FA。
2. 首次建包需要维护者以 npm 登录态完成。新包也可按 npm 的 staged publishing 流程创建引导版本；引导操作留到正式首发时处理，避免占用计划发布的版本。
3. 包建立后，在 npm 包 Settings 的 Trusted Publisher 中绑定仓库 `Virace2022/guanyu`、workflow 文件名 `release.yml`，允许直接 `npm publish`。GitHub 登录账号关联不能替代该绑定。
4. 绑定完成后，GitHub-hosted runner 使用 OIDC 和 `id-token: write` 发包，不需要在仓库保存长期 npm Access Token。工作流固定 npm 11.19.1；配置新 Trusted Publisher 后应按 npm 要求及时完成首次验证发布。

当前尚未执行这些远程配置或首次发布。[npm Trusted Publisher 文档](https://docs.npmjs.com/trusted-publishers/)、[staged publishing 文档](https://docs.npmjs.com/staged-publishing/)。

## 日常发布

普通 main push 和 PR 只运行版本、签到、设置、背包检查与构建。正式发布前，将代码、版本和工作流同步到远端 main，并完成真实页面验收。

获准发布后，为相应 main 提交创建并推送与版本文件一致的 tag：

```powershell
$releaseVersion = (Get-Content -Raw version.json | ConvertFrom-Json).version
git tag "v$releaseVersion"
git push origin "v$releaseVersion"
```

tag 工作流核对版本与 main 归属，运行全部现有契约检查和一次构建；先准备带四个附件的 Release 草稿，再发布 npm，最后公开 Release 并标为 latest。CI 不回写源码、版本或 tag。GitHub Release 使用自动生成的更新说明。

## 失败与重跑

- npm 尚未成功时，Release 保持草稿；修正认证或服务问题后重跑失败工作流。
- npm 已成功时，重跑核对 registry 的 `dist.integrity` 与当前 tgz；相同则跳过上传，不同则停止并要求新版本。
- 已公开的 Release 核对四个附件的 SHA-256，不覆盖。草稿阶段可重传附件，再继续未完成步骤。
- 错误代码通过新版本修复，不覆盖同版本，也不依靠删除 npm 历史版本来重新发布。
