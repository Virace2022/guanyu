<h1 align="center"><img src="assets/brand/guanyu.svg" alt="" width="48" height="48" align="absmiddle" /> 观鱼</h1>

<p align="center">斗鱼网页看播增强：团播编排、任意房间多屏、独立音量与清晰度。</p>

<p align="center">
  <a href="#能做什么">功能概览</a> ·
  <a href="#怎样开始">安装使用</a> ·
  <a href="#维护说明">维护说明</a> ·
  <a href="docs/FEATURE-LIST.md">详细功能列表</a> ·
  <a href="docs/DEVELOPMENT.md">开发说明</a>
</p>

<p align="center"><img src="docs/images/guanyu-meme.png" alt="" width="800" /></p>

## 能做什么

| 你想要…… | 观鱼可以…… |
| --- | --- |
| 看懂团播里的人物和队伍 | 自己编排团长、队长和队员，用队色区分，分享名单，同时预览多个成员 |
| 同时看几个直播间 | 任意直播间开启官方多屏，自选房间，最多四屏；副屏也能发声，每路可单独调音量、切画质 |
| 页面清爽一点 | 隐藏顶图、礼物栏、活动浮窗和播放器下方的大块内容，整理聊天区和弹幕标记 |
| 听清声音、少调几次播放器 | 额外音量增益按房间记忆，自动选最高画质、进入网页全屏，滚轮调音量 |
| 快速查看房间和背包资料 | 直接看开播时长、公会、道具到期、背包价值和粉丝牌天数，手动用荧光棒续牌 |
| 少做重复操作 | 自动鱼吧签到、粉丝牌每日弹幕等任务，自定义播放器右键菜单 |

完整的开关、入口和用法见[详细功能列表](docs/FEATURE-LIST.md)。

## 怎样开始

1. 在浏览器中安装用户脚本管理器，例如 [Tampermonkey](https://www.tampermonkey.net/)。
2. 点击[安装观鱼](https://cdn.jsdelivr.net/npm/guanyu-douyu@2026.1108.7/dist/douyu.guanyu.user.js)，在脚本管理器中确认安装。也可从 [GitHub Release](https://github.com/Virace2022/guanyu/releases/latest) 下载 `douyu.guanyu.user.js` 后导入。脚本通过 npm 包 [`guanyu-douyu`](https://www.npmjs.com/package/guanyu-douyu) 分发，后续由脚本管理器检查更新。
3. 打开斗鱼直播间，点击小鱼进入设置：普通模式在右下角，网页全屏时在播放器的弹幕屏蔽控件左侧。

先按自己的习惯调整“优化”“播放”和“签到”：首次安装默认整理页面、在开播后进入网页全屏，并开启签到任务。普通设置可跨分类修改，最后点“保存全部”；关闭时可选择放弃。团播名单单独保存。

支持斗鱼主站直播间、`/beta/` 和 `/topic/` 活动页；粉丝牌列表页提供牌龄显示。首页、分类页和关注页不启动脚本。

## 团播：把成员整理成自己看得懂的名单

不用反复记谁在哪一组。观鱼读取活动成员，你可以添加队伍，把成员分成队长和队员，也可以在顶部单独放团长、嘉宾等人物。

![](docs/images/team-editor.png)

1. 从“设置 → 团播”打开名单，或在页面右侧的团播小鱼工具条中点“名单”。
2. 添加队伍，选中“队长”或“队员”，再点右侧成员加入。整张卡片都能拖动，右键可换队、改角色或编辑人物。
3. 给队伍选颜色，点“保存名单”，再切换“分组布局”。右侧成员的星形标记表示队长，圆点表示队员。

![](docs/images/team-layout.png)

名单按活动保存；“分享 / 导入”可以把编排交给其他人。还可以输入房间号或直播间链接，添加不在活动名单里的嘉宾。

想同时看看成员在做什么，可在团播工具条中点“开启预览”。预览默认静音，分组时优先显示独立人物和队长，“展开队员”可继续加入队员；双击画面可逐队放大。预览较多时会先确认数量，也可随时切回原始布局。

## 多屏：任意房间开启，声音和画质各自控制

斗鱼官方多屏原本只向部分团播、活动开放。观鱼将它扩展到普通直播间，**无需房间申请开通，可用房间号或链接加入任意斗鱼直播间**。本地模式最多四屏，包含当前房间。

观鱼为官方副屏补上声音开关、独立音量和清晰度选择。可以只听一路，也可以几路一起听、各调各的音量。

在“设置 → 多屏”中点“开启 / 编辑多屏”，选择候选房间；点“添加房间”可输入房间号或链接。候选会合并活动成员、关注和常用房间，添加候选后再选择播放。画面仍由斗鱼官方播放器承载，支持拖动排序。

![](docs/images/multiscreen.png)

| 操作 | 怎么用 |
| --- | --- |
| 只听一路，默认模式 | 点主播头像上的喇叭切换发声房间，底部播放器音量控制这一路 |
| 分别调节每一路 | 开启“独立控制各直播间音量”，悬停头像显示滑条；底部音量作为总比例 |
| 切换画质 | 右键主播头像或名字，进入“清晰度”；只切换所选画面 |
| 原地更换副屏 | 右键副屏标签，选“更换直播间”，保留这个位置 |
| 减少标签遮挡 | 在多屏设置中选择始终显示、仅显示头像或全部隐藏；隐藏后悬停原头像位置可唤出 |

独立音量下，房间设为 60%、底部总音量为 50%，实际音量就是 30%。标签默认集中在画面交界处，也可以改到各画面左下角。取消最后一个副屏即可回到单屏。

选房面板将官方的大图横向列表改成两行紧凑缩略图，候选多时在面板里滚动；顶部列出已选房间，点名字旁的“×”即可取消，当前主房间保留。

<details>
<summary>查看近景：独立音量、画质和换房</summary>

![](docs/images/multiscreen-volume.png)

![](docs/images/multiscreen-menu.png)

</details>

## 局部效果对比

| 功能 | 开启前 | 开启后 | 说明 |
| --- | --- | --- | --- |
| 紧凑选房与快速取消 | <a href="docs/images/multiscreen-picker-before.png"><img src="docs/images/multiscreen-picker-before.png" alt="" width="300" /></a> | <a href="docs/images/multiscreen-picker-after.png"><img src="docs/images/multiscreen-picker-after.png" alt="" width="300" /></a> | 官方大图改成两行缩略图，顶部已选房间点“×”就能取消。 |
| 独立控制各直播间音量 | <a href="docs/images/multiscreen-volume-before.png"><img src="docs/images/multiscreen-volume-before.png" alt="" width="180" /></a> | <a href="docs/images/multiscreen-volume-after.png"><img src="docs/images/multiscreen-volume-after.png" alt="" width="180" /></a> | 悬停头像调这一路，底部控件调总音量；音量跟随房间。 |
| 主播标签仅显示头像 | <a href="docs/images/multiscreen-avatar-before.png"><img src="docs/images/multiscreen-avatar-before.png" alt="" width="260" /></a> | <a href="docs/images/multiscreen-avatar-after.png"><img src="docs/images/multiscreen-avatar-after.png" alt="" width="260" /></a> | 减少常驻遮挡，头像位置固定；另可选择全部隐藏、悬停唤出。 |

## 还有这些日常功能

- **声音与播放**：在播放器增益按钮上调额外音量，按房间记住选择；额外增益上限可设为 +100%～+500%（你应该知道这功能是给谁准备的）。自动最高画质、网页全屏和滚轮调音量也可分别设置。
- **页面与弹幕**：按需保留顶图、礼物栏和活动内容，隐藏不想看的弹幕标记、进场提示或含链接消息。
- **背包与续牌**：查看道具到期、总价值和亲密度；从充值旁的荧光棒按钮打开计划，核对目标与数量后点“确认赠送”。本页会记录已送数量，再次确认仍会再送。
- **签到任务**：默认在后台处理鱼吧签到和粉丝牌每日弹幕等任务。弹幕任务向未完成的持牌房间各发一条 `.`，同账号多个标签页共用任务池，最多两路并发；进度自动保存，关闭浏览器后下次继续。官方确认全部完成后，当天不再查询或发送，北京时间零点后重新开始。设置中可查看进度和关闭任务，关闭设置窗口后继续运行。
- **快捷操作**：编排播放器右键菜单，快速开关礼物栏、镜像画面、查看主播配置或进入多屏。

各项默认值和行为规则见[功能说明](docs/FEATURES.md)。

## 维护说明

观鱼是我自己看斗鱼用的脚本，修复和功能调整以我的使用需求为主，没有固定更新计划。欢迎通过 [Issues](https://github.com/Virace2022/guanyu/issues) 反馈问题和建议，是否处理取决于我的需求与精力。

什么时候不看斗鱼了，这个项目也就结束维护了。源码始终按 [MIT 许可](LICENSE) 开放，你可以继续使用、修改，或 Fork 后自行维护。

## 项目文档

| 文档 | 内容 |
| --- | --- |
| [详细功能列表](docs/FEATURE-LIST.md) | 按十一类设置逐项查功能、入口和用法 |
| [功能说明](docs/FEATURES.md) | 功能契约、默认值与限制 |
| [开发说明](docs/DEVELOPMENT.md) | 本地构建、开发调试与检查命令 |
| [发布说明](docs/RELEASING.md) | 日期版本、自动发布、安装与更新地址 |
| [工程架构](docs/ARCHITECTURE.md) | 模块职责、数据流、官方接口适配与生命周期 |
| [UI 规范](docs/UI.md) | 视觉与交互约定 |
| [开发约定](AGENTS.md) | 维护与验证要求 |

由 [Virace](https://github.com/Virace2022) 开发，采用 [MIT 许可](LICENSE)。
