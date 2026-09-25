# Zotero Focus Columns 1.2.4 验收与发布记录

本版本只统一 Zotero 插件管理页显示的名称和描述，不改变插件 ID、首选项分支、同步标记、更新地址、功能行为或用户数据。

## 发布授权与验证范围

2026-09-25，用户采纳名称 `Zotero Focus Columns` 和中文描述“为文献列表添加期刊排名、哈希标签、状态和备注等自定义列。”，并明确要求通过正式发布让已安装插件自动更新。用户同时决定本轮不等待单独的 Zotero 实机验收。

- [x] `package.json`、`package-lock.json` 和 `addon/manifest.json` 版本统一为 `1.2.4`。
- [x] 插件管理页名称和描述按用户确认的文案写入源清单。
- [x] 插件 ID、更新地址、兼容范围及现有运行时数据合同保持不变。
- [x] 本地 `npm run verify` 通过，包括类型检查、131 项自动测试、仓库卫生、更新清单、构建和 XPI 内容检查；并直接读取 XPI 内的 `manifest.json` 核对名称、版本和描述。
- [ ] 在 Zotero 插件管理页实机确认新名称和中文描述；本轮按用户授权跳过，不记为通过。
- [ ] 通过 Zotero 自动更新入口完成升级并复查原有功能；需由已安装客户端在正式发布后执行，不记为发布前通过。

## 发布结果

- 正式版本：[Zotero Focus Columns 1.2.4](https://github.com/lllaterOn/zotero-focus-columns/releases/tag/v1.2.4)。
- 发布源码：`9de3e26bd6cc17024880148f5a63cf2f4ddaa1ab`，标签 `v1.2.4`。
- 发布同一份 Draft XPI，资产 ID `587442230`，未重建或替换；`SHA256SUMS` 资产 ID 为 `587442231`。
- XPI SHA-256：`a42c47c9ea42ce5832a2b75bae5e6efcede1b950b406a83cbcb23cd2725edd12`。发布前下载 GitHub 原始资产核对通过，发布后 GitHub 资产 ID、创建时间、大小和摘要保持一致。
- 标签构建、Draft 创建和 `publish-update` 工作流均通过。`updates.json` 已加入 `1.2.4` 的正式下载地址、同一 SHA-256 和 Zotero `10.0.*` 兼容范围。
- 已直接读取公开的 `raw.githubusercontent.com/lllaterOn/zotero-focus-columns/main/updates.json`，确认 Zotero 实际访问的更新清单包含上述版本、链接和摘要。
- 维护过程中没有启动或操控 Zotero；插件管理页显示和客户端自动更新效果仍待已安装客户端观察。
