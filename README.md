# dsh-flowforge ⚒

**流程锻造** —— DSH Desktop 插件。用"逐条添加提示词"的方式锻造你的个人 DIY 工作流，自检通过后交给主对话 AI 按步骤执行。

## 功能

- **右上角编排面板**：横向输入框逐条添加提示词；输入时给出联想词（本地词库 + 你的输入历史）辅助精准表达
- **富编辑**：步骤重命名、单步编辑、中间插入、删除、拖拽排序、一键清空、工作流命名
- **每步四要素**：步骤名 + 提示词正文 + 预期产出 + 跳转条件（失败时/成功时/无论如何 → 指定步骤）
- **自检**：生成后即时结构检查——硬伤（空提示词、跳转目标不存在、自环）⛔ 阻断执行；软警告（提示词过短、缺预期产出等）⚠️ 需"知晓风险"确认后才放行
- **AI 深度审查**：执行前 AI 在主对话里审计逻辑矛盾、信息缺失、当前环境工具能力是否支撑每一步
- **执行**：主对话通道——AI 用你已装的全部插件能力逐步干活，执行过程在聊天里完整可见
- **跳转治理**：预设跳转由引擎严格执行；计划外的跳转 AI 只能提议，必须你批准（面板一键批准/拒绝）
- **运行面板**：步骤清单实时状态（▶当前 / ✓完成 / ✗失败 / –跳过），支持暂停 / 继续 / 终止
- **沉淀与分享**：工作流本地保存复用，导出/导入 `.flowforge.json`，天然形成可分享的工作流模板生态

## 安装（DSH Desktop）

方式一（推荐，generation 安装）：
1. 设置 → 插件市场 → 安装（上架后可用）
2. 或本地包安装：把本目录打包为 tar.gz 放入插件缓存后从设置启用

方式二（开发调试）：
1. `npm install`（装 @deepseek-ai/dsh-tools 以便 `npm run check`）
2. 将目录放入 DSH 插件加载路径，重启 DSH

## 使用

1. 点输入区右下角 **⚒ 锻造** 按钮，打开右上角面板
2. 输入提示词 → 回车或点「添加」，重复至步骤齐全（可用联想词）
3. 填步骤名/预期产出/跳转条件（可选）→ 拖拽调整顺序
4. 点 **自检**：硬伤必须修，软警告知情可选
5. 点 **▶ 执行**：AI 在主对话中先自审再逐步执行；面板「运行」页实时看进度，可暂停/继续/终止
6. **保存** 后可在「工作流库」复用；**导出** JSON 分享给他人导入

## 数据位置

工作流、运行记录、输入历史存于 `~/.dsh-flowforge/`（可用配置项 `dataDir` 或环境变量 `DSH_FLOWFORGE_HOME` 重定向）。

## v1 边界（roadmap）

- 条件分支（多路 if/else）：数据结构已预留，功能排 v2
- AI 增强联想：v1 为本地词库+历史，v1.1 计划经会话通道叠加 LLM 联想
- 工作流模板市场：基于导入/导出 JSON 的社区分享

## 协议说明（开发者）

- client↔host：`connection.rpc.call("/dsh-flowforge", endpoint, payload)` ↔ host 侧 `webServer.register({kind:"prefix", path:"/dsh-flowforge"})` HTTP 路由（POST JSON，`requestRejection` 鉴权）
- 执行触发：客户端 `remote.session.prompt({sessionId, mode:"steer", content:[{type:"text",...}]})`
- AI 工具：`flowforge_workflow_get / run_start / step_begin / step_finish / run_control / run_state`
- UI 槽位：`conversation.composer.dock`

## License

MIT
