# 桌面抛掷动作测试版

此包为基于 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 的非官方改版，版本 `0.3.8-throw-motion.1`。上游基线为 `0.3.8`，提交 `c696095c5786e0eeb25fec0f37a9cdcf30059151`。

新增默认大肥鱼的甩出、侧撞、撞顶、落地动作和 `><` 碰撞表情；贴地时恢复正常站姿，不持续蹲下。动画已参照原版待机配色校正。自定义画面在首帧准备好后交接，不通过叠加两个姿态完成过渡，避免闪烁和双影。过渡片段加速、悬空循环原速。

沿用 0.3.8 的弹弓、分步物理、位置控制、占用锁和点播回执。外部明确点播动画具有显示优先级；用户开始拖动会取消被打断的点播。其他角色不套用大肥鱼的新视频。只增强桌面模式，网页宠物沿用上游显示。

## 安装与恢复

先退出 DSH，将发布附件 `dsh-pet-0.3.8-throw-motion.1.tgz` 下载到自己的电脑。使用 DSH 桌面应用自带 CLI 执行以下命令，路径替换成实际下载文件位置，profile 替换成自己使用的 profile：

```text
dsh plugin --profile desktop add ./dsh-pet-0.3.8-throw-motion.1.tgz
```

重新启动 DSH 后生效。该包使用原有 `dsh-pet` 名称，是替换安装，不能与官方同名插件重复加载。无需复制用户配置或粘贴 API Key；动画运行时不调用模型。

恢复官方 0.3.8：退出 DSH，执行 `dsh plugin --profile desktop add dsh-pet@0.3.8`，再启动 DSH。彻底移除插件可用 `dsh plugin --profile desktop remove dsh-pet`。这些命令不需要删除用户数据目录；不要为恢复动画去清空 DSH 会话或凭据。

官方商城升级可能覆盖改版。这里只声明已实际验证的兼容范围，不保证之后的官方版本可以直接覆盖安装自定义运行文件。

## 开发与验证

在仓库 `dsh-pet` 目录运行 `npm ci`、`npm run build`、`npm test`、`npm run test:motion`，完整打包检查用 `npm pack`。安装包包含构建后的宿主、客户端、运行壳和必要动画，不依赖开发者机器的目录或补丁安装记录。

`npm run preview:motion` 启动只读本机预览。它只提供仓库公开资源，支持视频范围读取，不连接真实 DSH、不读取用户会话或凭据。打开显示的预览地址后，可用 Playwright CLI 的 `run-code --filename ../tools/throw-preview/check-actions.js`、`check-handoff.js`、`check-physics.js` 和 `check-upstream.js` 验证动作、衔接及新版接口。各测试以当前预览页为入口，没有写死本机绝对路径。

本次优先验证 Windows x64 桌面环境。macOS、Linux 和真实多显示器跨窗口手势不能由隔离浏览器测试代替，尚未验证的项目不声明为通过。素材条件见 [MEDIA-NOTICE.md](MEDIA-NOTICE.md)。
