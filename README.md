# Focus Columns

Focus Columns 是一个面向 Zotero 10 的独立插件，为个人文献工作流提供四个紧凑的条目列表列、两个条目面板信息行，以及可选的跨电脑同步。

本仓库是私人软件仓库。版权所有，未授予公开复制、分发或再许可权限。

## 功能

- **期刊标签列**：从本地缓存读取期刊分级；缓存缺失时可通过用户自行配置的 EasyScholar 密钥获取。支持批量更新和确认删除，手动删除的结果不会被自动补全立即恢复。
- **#标签列**：显示原生 Zotero 标签中以 `#` 开头的标签，并在列中隐藏第一个 `#`。
- **状态列**：使用原生彩色 `/` 标签；`/yes`、`/ing`、`/no` 属于互斥状态组。
- **简记列**：将简记保存在条目 `Extra` 字段的 `remark:` 行，同时保留其他内容。
- **条目面板**：通过 Zotero 官方 `ItemPaneInfoRow` API 显示期刊标签和简记。
- **跨电脑同步**：可独立同步期刊标签和非敏感插件设置，网络上传与下载由 Zotero 自身负责。

四个条目列表列和两个条目面板信息行具有彼此独立的开关。

## 兼容性与已知限制

- 支持 Zotero `10.0.*`。
- 条目面板使用官方信息行 API。Zotero 10 只提供 `start`、`afterCreators` 和 `end` 三个位置，并且信息行只能返回字符串，因此不能精确插入任意原生字段之后，也不能显示彩色内联徽章。
- 同一主排序值的条目继续使用 Zotero 的次级和后备排序；插件不会把条目 ID 塞入排序键。
- 私人 GitHub Release 无法被 Zotero 匿名更新器访问，因此本项目不提供原生自动更新。

## 安装与更新

1. 登录拥有本私人仓库访问权限的 GitHub 账户。
2. 打开仓库的 **Releases** 页面，下载 `zotero-focus-columns-<version>.xpi`。
3. 在 Zotero 中打开“工具 → 插件”，从文件安装 XPI。
4. 更新版本时下载新的 XPI，并重复从文件安装。

安装后在 Zotero 设置中打开 **Focus Columns**，按需启用六个功能开关并填写本机 EasyScholar 密钥。

## 跨电脑同步

同步默认关闭。“同步期刊标签”和“同步插件设置”可以独立选择。

启用后，插件在个人文献库中使用以下可见对象：

- 父条目类型：软件；默认标题：`Personal Zotero Addons`
- 父条目 `Extra` 标记：`personal-zotero-addons-container: 1`
- Focus Columns 子笔记标题：`Focus Columns`

同步笔记只保存期刊标签、允许同步的设置、内容哈希和修订信息，不保存 EasyScholar 密钥、同步开关、本机连接信息或设备标识。关闭同步或卸载插件不会删除共享条目和子笔记。对象被移入回收站后，插件会暂停，而不是静默创建替代品。

插件只更新本机 Zotero 笔记。需要立即上传或下载时，请使用 Zotero 自带的同步按钮。另一台电脑应先完成 Zotero 同步，再安装并启用插件。两端同时修改同一同步内容时，插件会要求选择保留完整的本机版本或 Zotero 版本，不做静默合并。

## 本机数据

- 期刊缓存：`<Zotero data directory>/focus-columns-publications.json`
- 同步备份：`<Zotero data directory>/focus-columns-backups/`
- 简记：条目 `Extra` 中的一行 `remark: <text>`
- 状态和 `#` 标签：原生 Zotero 标签
- EasyScholar 密钥：仅保存在本机 Zotero 首选项中

本机 Zotero 数据、数据库、缓存、日志、密钥和运行 profile 不属于软件仓库，也不得提交到 Git。

## 开发与维护

要求 Node.js 22 或更高版本：

```powershell
npm ci
npm run verify
```

完整验证包括类型检查、自动测试、仓库卫生检查、构建和 XPI 内容检查。构建产物位于：

```text
dist/zotero-focus-columns-<version>.xpi
```

推荐的多端工作流：

```text
拉取 main → 创建 codex/<task> → 修改并验证 → 提交并推送 → PR → 合并
```

切换电脑前先提交并推送；另一台电脑开始工作前先拉取 `main`。详细合同见 [架构说明](docs/ARCHITECTURE.md)、[开发说明](docs/DEVELOPMENT.md) 和 [1.0.0 人工验收清单](docs/MANUAL_ACCEPTANCE_1.0.0.md)。
