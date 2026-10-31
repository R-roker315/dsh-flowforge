// dsh-flowforge 客户端：输入区入口按钮 + 右上角编排面板。
// 协议参照官方 dsh-ppt：window.__ModuleLoader__.load + slots.register + connection.rpc.call。
window.__ModuleLoader__.load({
  id: "dsh-flowforge",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const react_jsx_runtime = require("react/jsx-runtime");
    const react = require("react");

    const inject = ["slots", "connection", "remote"];
    const PLUGIN_ID = "dsh-flowforge";
    const TOGGLE_EVENT = "dsh-flowforge-toggle";

    // ------------------------------------------------------------ rpc client
    function createFlowforgeClient(rpc) {
      return {
        async call(endpoint, payload = {}, signal) {
          const outer = await rpc.call(`/${PLUGIN_ID}`, endpoint, payload, signal);
          if (!outer.ok) throw new Error(outer.error?.message ?? "RPC 调用失败");
          const inner = outer.value;
          if (!inner || typeof inner !== "object" || !("status" in inner)) {
            throw new Error("flowforge 返回了无效响应");
          }
          if (inner.status === "error") throw new Error(inner.error?.message ?? "flowforge 内部错误");
          return inner.data;
        },
      };
    }

    // ------------------------------------------------------------ styles
    const CSS = `
.ff-panel{position:fixed;top:12px;right:12px;width:560px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);
  display:flex;flex-direction:column;background:var(--dsw-specific-input-major,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);
  border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(0,0,0,.12));border-radius:12px;
  box-shadow:var(--dsw-shadow-lv3,0 8px 32px rgba(0,0,0,.18));z-index:9999;font:inherit}
.ff-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(0,0,0,.08))}
.ff-head b{flex:1;font-size:14px}
.ff-body{overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.ff-foot{display:flex;flex-wrap:wrap;gap:6px;padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(0,0,0,.08))}
.ff-btn{border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(0,0,0,.15));background:transparent;color:inherit;
  border-radius:8px;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.ff-btn:hover{background:var(--dsw-alias-state-business-primary-light,rgba(0,0,0,.05))}
.ff-btn.primary{background:var(--dsw-alias-state-business-primary,#2563eb);border-color:transparent;color:#fff}
.ff-btn.danger{color:#dc2626}
.ff-btn:disabled{opacity:.45;cursor:not-allowed}
.ff-dockbtn{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(0,0,0,.15));
  background:transparent;color:var(--dsw-alias-label-secondary,#666);border-radius:999px;padding:2px 10px;font:inherit;font-size:12px;cursor:pointer}
.ff-dockbtn[data-on="1"]{border-color:var(--dsw-alias-state-business-primary,#2563eb);color:var(--dsw-alias-state-business-primary,#2563eb)}
.ff-addrow{display:flex;gap:6px;position:relative}
.ff-input{flex:1;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(0,0,0,.2));border-radius:8px;padding:6px 10px;font:inherit;font-size:13px;background:transparent;color:inherit}
.ff-input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary,#2563eb)}
.ff-sug{position:absolute;top:calc(100% + 4px);left:0;right:56px;background:var(--dsw-specific-input-major,#fff);
  border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(0,0,0,.15));border-radius:8px;box-shadow:var(--dsw-shadow-lv2,0 4px 16px rgba(0,0,0,.12));
  max-height:220px;overflow:auto;z-index:20}
.ff-sug-item{padding:6px 10px;font-size:12px;cursor:pointer;display:flex;gap:6px;align-items:center}
.ff-sug-item:hover,.ff-sug-item[data-sel="1"]{background:var(--dsw-alias-state-business-primary-light,rgba(37,99,235,.08))}
.ff-sug-tag{font-size:10px;color:var(--dsw-alias-label-tertiary,#999);border:1px solid currentColor;border-radius:4px;padding:0 3px}
.ff-step{border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(0,0,0,.1));border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:6px;background:transparent}
.ff-step[data-drag="1"]{opacity:.4}
.ff-step-head{display:flex;align-items:center;gap:6px}
.ff-drag{cursor:grab;color:var(--dsw-alias-label-tertiary,#999);user-select:none;font-size:14px}
.ff-num{font-size:11px;color:var(--dsw-alias-label-tertiary,#999);min-width:22px}
.ff-step textarea{width:100%;box-sizing:border-box;min-height:44px;resize:vertical;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(0,0,0,.15));
  border-radius:6px;padding:5px 8px;font:inherit;font-size:12.5px;background:transparent;color:inherit}
.ff-row2{display:flex;gap:6px}
.ff-row2>*{flex:1;min-width:0}
.ff-jump{display:flex;gap:6px;align-items:center;font-size:11.5px;color:var(--dsw-alias-label-secondary,#777)}
.ff-select{border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(0,0,0,.15));border-radius:6px;padding:2px 4px;font:inherit;font-size:11.5px;background:transparent;color:inherit}
.ff-issues{border:1px solid #f59e0b;border-radius:8px;padding:8px;font-size:12px;max-height:180px;overflow:auto}
.ff-issue-hard{color:#dc2626}
.ff-issue-soft{color:#b45309}
.ff-wflist{display:flex;flex-direction:column;gap:4px}
.ff-wfitem{display:flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(0,0,0,.1));border-radius:8px;padding:6px 8px;font-size:12.5px}
.ff-wfitem b{flex:1;cursor:pointer}
.ff-run{border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(0,0,0,.12));border-radius:10px;padding:8px;font-size:12.5px;display:flex;flex-direction:column;gap:4px}
.ff-run-step{display:flex;gap:6px;align-items:baseline}
.ff-st-done{color:#16a34a}
.ff-st-failed{color:#dc2626}
.ff-st-active{color:#2563eb;font-weight:600}
.ff-st-pending{color:var(--dsw-alias-label-tertiary,#999)}
.ff-st-skipped{color:var(--dsw-alias-label-tertiary,#999);text-decoration:line-through}
.ff-status{font-size:12px;color:var(--dsw-alias-label-secondary,#777)}
.ff-err{color:#dc2626;font-size:12px;white-space:pre-wrap}
.ff-tabs{display:flex;gap:2px}
.ff-tab{border:none;background:transparent;padding:4px 10px;font:inherit;font-size:12.5px;cursor:pointer;border-radius:8px;color:var(--dsw-alias-label-secondary,#777)}
.ff-tab[data-on="1"]{background:var(--dsw-alias-state-business-primary-light,rgba(37,99,235,.1));color:var(--dsw-alias-state-business-primary,#2563eb)}
`;

    function injectStyles() {
      if (document.getElementById("dsh-flowforge-css")) return;
      const style = document.createElement("style");
      style.id = "dsh-flowforge-css";
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    // ------------------------------------------------------------ helpers
    const STATUS_TEXT = {
      running: "执行中", paused: "已暂停", "awaiting-user": "等待你裁决",
      done: "已完成", cancelled: "已终止",
    };
    const STEP_ICON = { done: "✓", failed: "✗", active: "▶", pending: "·", skipped: "–" };
    const STEP_CLS = {
      done: "ff-st-done", failed: "ff-st-failed", active: "ff-st-active",
      pending: "ff-st-pending", skipped: "ff-st-skipped",
    };

    function newStep() {
      return { id: `s${Math.random().toString(36).slice(2, 8)}`, name: "", text: "", expect: "", jump: null };
    }

    function buildKickoff(wf) {
      return [
        `请执行 flowforge 工作流「${wf.name || "(未命名)"}」（ID: ${wf.id}）。`,
        "流程：1) 用 flowforge_workflow_get 读取；2) 先自审：逻辑矛盾、信息缺失、当前环境工具能力能否支撑每一步，有问题如实报告；",
        "3) 用 flowforge_run_start 启动（返回软警告时逐条列出并等我确认「知晓风险」，硬伤则停下）；",
        "4) 逐步 flowforge_step_begin / flowforge_step_finish 汇报真实结果；预设跳转由引擎执行，非预设跳转必须先征得我同意。",
      ].join("\n");
    }

    // ------------------------------------------------------------ panel
    function FlowforgePanel({ client, remote, sessionId, open, onToggle }) {
      const [tab, setTab] = react.useState("forge"); // forge | library | run
      const [name, setName] = react.useState("");
      const [steps, setSteps] = react.useState([]);
      const [currentId, setCurrentId] = react.useState("");
      const [issues, setIssues] = react.useState(null);
      const [error, setError] = react.useState("");
      const [workflows, setWorkflows] = react.useState([]);
      const [run, setRun] = react.useState(null);
      const [query, setQuery] = react.useState("");
      const [sugs, setSugs] = react.useState([]);
      const [sugSel, setSugSel] = react.useState(0);
      const [dragIndex, setDragIndex] = react.useState(null);
      const [busy, setBusy] = react.useState(false);

      const refreshState = react.useCallback(async () => {
        try {
          const data = await client.call("state");
          setWorkflows(data.workflows ?? []);
          setRun(data.activeRun ?? null);
        } catch (e) {
          setError(String(e.message ?? e));
        }
      }, [client]);

      react.useEffect(() => {
        if (!open) return undefined;
        injectStyles();
        refreshState();
        const timer = setInterval(refreshState, 1500);
        return () => clearInterval(timer);
      }, [open, refreshState]);

      const guard = async (fn) => {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          await fn();
        } catch (e) {
          setError(String(e.message ?? e));
        } finally {
          setBusy(false);
        }
      };

      // ---- 步骤编辑 ----
      const addStep = (text) => {
        const t = String(text ?? "").trim();
        if (!t) return;
        setSteps((s) => [...s, { ...newStep(), text: t }]);
        setQuery("");
        setSugs([]);
        client.call("history/record", { text: t }).catch(() => {});
      };
      const patchStep = (i, patch) =>
        setSteps((s) => s.map((st, k) => (k === i ? { ...st, ...patch } : st)));
      const removeStep = (i) => setSteps((s) => s.filter((_, k) => k !== i));
      const insertStep = (i) =>
        setSteps((s) => [...s.slice(0, i), newStep(), ...s.slice(i)]);
      const move = (from, to) => {
        if (to < 0 || to >= steps.length || from === to) return;
        setSteps((s) => {
          const copy = [...s];
          const [it] = copy.splice(from, 1);
          copy.splice(to, 0, it);
          return copy;
        });
      };

      // ---- 联想 ----
      react.useEffect(() => {
        if (!open) return undefined;
        const q = query.trim();
        if (!q) {
          setSugs([]);
          return undefined;
        }
        const timer = setTimeout(() => {
          client.call("suggest", { query: q, limit: 8 })
            .then((d) => {
              setSugs(d.items ?? []);
              setSugSel(0);
            })
            .catch(() => {});
        }, 220);
        return () => clearTimeout(timer);
      }, [query, open, client]);

      const onQueryKey = (e) => {
        if (sugs.length === 0) {
          if (e.key === "Enter") addStep(query);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSugSel((v) => Math.min(v + 1, sugs.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSugSel((v) => Math.max(v - 1, 0));
        } else if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          addStep(sugs[sugSel]?.text ?? query);
        } else if (e.key === "Escape") {
          setSugs([]);
        }
      };

      // ---- 工作流 CRUD ----
      const buildWorkflow = () => ({
        id: currentId,
        name,
        steps: steps.map((s) => ({
          ...s,
          jump: s.jump && s.jump.on && s.jump.on !== "none" ? s.jump : null,
        })),
      });
      const save = () =>
        guard(async () => {
          const data = await client.call("workflow/save", { workflow: buildWorkflow() });
          setCurrentId(data.workflow.id);
          setIssues(data.issues ?? []);
          await refreshState();
        });
      const load = (wf) =>
        guard(async () => {
          const data = await client.call("workflow/get", { id: wf.id });
          const w = data.workflow;
          setCurrentId(w.id);
          setName(w.name);
          setSteps(w.steps ?? []);
          setIssues(null);
          setTab("forge");
        });
      const remove = (id) =>
        guard(async () => {
          await client.call("workflow/delete", { id });
          if (id === currentId) setCurrentId("");
          await refreshState();
        });
      const doExport = () => {
        const blob = new Blob([JSON.stringify(buildWorkflow(), null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${name || "workflow"}.flowforge.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      };
      const doImport = (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const wf = JSON.parse(String(reader.result));
            setCurrentId("");
            setName(String(wf.name ?? ""));
            setSteps(Array.isArray(wf.steps) ? wf.steps.map((s) => ({ ...newStep(), ...s })) : []);
            setIssues(null);
          } catch {
            setError("导入失败：不是合法的 flowforge JSON。");
          }
        };
        reader.readAsText(file);
      };

      // ---- 自检 & 执行 ----
      const selfCheck = () =>
        guard(async () => {
          const data = await client.call("workflow/save", { workflow: buildWorkflow() });
          setCurrentId(data.workflow.id);
          setIssues(data.issues ?? []);
          if ((data.issues ?? []).length === 0) setError("");
        });
      const start = () =>
        guard(async () => {
          if (!currentId) {
            const data = await client.call("workflow/save", { workflow: buildWorkflow() });
            setCurrentId(data.workflow.id);
          }
          if (!remote?.session?.prompt) throw new Error("未获得 remote 通道，无法驱动主对话。");
          const res = await remote.session.prompt({
            sessionId,
            mode: "steer",
            content: [{ type: "text", text: buildKickoff({ ...buildWorkflow(), id: currentId }) }],
          });
          if (res && res.ok === false) throw new Error(res.error?.message ?? "发送失败");
          client.call("history/record", { text: `▶ 执行工作流：${name || currentId}` }).catch(() => {});
          setTab("run");
          await refreshState();
        });
      const runControl = (action, promptAfter) =>
        guard(async () => {
          await client.call("run/control", { action });
          await refreshState();
          if (promptAfter && remote?.session?.prompt) {
            await remote.session.prompt({
              sessionId,
              mode: "steer",
              content: [{ type: "text", text: promptAfter }],
            });
          }
        });

      const jumpTargetOptions = (selfIndex) =>
        steps.map((s, i) => ({ i, label: `${i + 1}. ${s.name || "(未命名)"}` })).filter((o) => o.i !== selfIndex);

      // ---- render ----
      return react_jsx_runtime.jsx("div", {
        className: "ff-panel",
        role: "dialog",
        children: [
          react_jsx_runtime.jsxs("div", { className: "ff-head", children: [
            react_jsx_runtime.jsx("b", { children: "⚒ 流程锻造 FlowForge" }),
            react_jsx_runtime.jsxs("div", { className: "ff-tabs", children: [
              react_jsx_runtime.jsx("button", { className: "ff-tab", "data-on": tab === "forge" ? "1" : "0", onClick: () => setTab("forge"), children: "编排" }),
              react_jsx_runtime.jsx("button", { className: "ff-tab", "data-on": tab === "library" ? "1" : "0", onClick: () => { refreshState(); setTab("library"); }, children: "工作流库" }),
              react_jsx_runtime.jsx("button", { className: "ff-tab", "data-on": tab === "run" ? "1" : "0", onClick: () => { refreshState(); setTab("run"); }, children: "运行" }),
            ] }),
            react_jsx_runtime.jsx("button", { className: "ff-btn", onClick: onToggle, children: "收起" }),
          ] }),

          tab === "forge" && react_jsx_runtime.jsxs("div", { className: "ff-body", children: [
            react_jsx_runtime.jsxs("div", { className: "ff-addrow", children: [
              react_jsx_runtime.jsx("input", {
                className: "ff-input",
                placeholder: "输入提示词，回车/Tab 采纳联想，点击「添加」入列…",
                value: query,
                onChange: (e) => setQuery(e.target.value),
                onKeyDown: onQueryKey,
              }),
              react_jsx_runtime.jsx("button", { className: "ff-btn primary", onClick: () => addStep(query), children: "添加" }),
              sugs.length > 0 && react_jsx_runtime.jsx("div", { className: "ff-sug", children:
                sugs.map((s, i) => react_jsx_runtime.jsxs("div", {
                  className: "ff-sug-item", "data-sel": i === sugSel ? "1" : "0",
                  onMouseDown: (e) => { e.preventDefault(); addStep(s.text); },
                  onMouseEnter: () => setSugSel(i),
                  children: [
                    react_jsx_runtime.jsx("span", { children: s.text }),
                    react_jsx_runtime.jsx("span", { className: "ff-sug-tag", children: s.source === "history" ? "历史" : "词库" }),
                  ],
                }, `${s.text}-${i}`))
              }),
            ] }),

            steps.length === 0 && react_jsx_runtime.jsx("div", { className: "ff-status", children: "还没有步骤。逐条输入提示词，构建你的专属工作流。" }),

            steps.map((s, i) => react_jsx_runtime.jsxs("div", {
              className: "ff-step", draggable: true, "data-drag": dragIndex === i ? "1" : "0",
              onDragStart: () => setDragIndex(i), onDragEnd: () => setDragIndex(null),
              onDragOver: (e) => e.preventDefault(),
              onDrop: (e) => { e.preventDefault(); move(dragIndex, i); setDragIndex(null); },
              children: [
                react_jsx_runtime.jsxs("div", { className: "ff-step-head", children: [
                  react_jsx_runtime.jsx("span", { className: "ff-drag", title: "拖拽排序", children: "⠿" }),
                  react_jsx_runtime.jsx("span", { className: "ff-num", children: `${i + 1}.` }),
                  react_jsx_runtime.jsx("input", {
                    className: "ff-input", style: { flex: 1 }, placeholder: "步骤名",
                    value: s.name, onChange: (e) => patchStep(i, { name: e.target.value }),
                  }),
                  react_jsx_runtime.jsx("button", { className: "ff-btn", title: "在此后插入空步骤", onClick: () => insertStep(i + 1), children: "＋" }),
                  react_jsx_runtime.jsx("button", { className: "ff-btn danger", onClick: () => removeStep(i), children: "删" }),
                ] }),
                react_jsx_runtime.jsx("textarea", {
                  placeholder: "提示词正文（这一步让 AI 做什么）",
                  value: s.text, onChange: (e) => patchStep(i, { text: e.target.value }),
                }),
                react_jsx_runtime.jsx("input", {
                  className: "ff-input", placeholder: "预期产出（给自检与进度判断用，可留空）",
                  value: s.expect, onChange: (e) => patchStep(i, { expect: e.target.value }),
                }),
                react_jsx_runtime.jsxs("div", { className: "ff-jump", children: [
                  react_jsx_runtime.jsx("span", { children: "跳转：" }),
                  react_jsx_runtime.jsxs("select", {
                    className: "ff-select",
                    value: s.jump?.on ?? "none",
                    onChange: (e) => {
                      const on = e.target.value;
                      patchStep(i, { jump: on === "none" ? null : { on, to: jumpTargetOptions(i)[0]?.i ?? 0 } });
                    },
                    children: [
                      react_jsx_runtime.jsx("option", { value: "none", children: "无（顺序执行）" }),
                      react_jsx_runtime.jsx("option", { value: "fail", children: "失败时" }),
                      react_jsx_runtime.jsx("option", { value: "pass", children: "成功时" }),
                      react_jsx_runtime.jsx("option", { value: "always", children: "无论如何" }),
                    ],
                  }),
                  s.jump && react_jsx_runtime.jsxs("select", {
                    className: "ff-select",
                    value: s.jump.to,
                    onChange: (e) => patchStep(i, { jump: { ...s.jump, to: Number(e.target.value) } }),
                    children: jumpTargetOptions(i).map((o) =>
                      react_jsx_runtime.jsx("option", { value: o.i, children: `→ 第 ${o.label}` }, o.i)),
                  }),
                ] }),
              ],
            }, s.id)),
          ] }),

          tab === "library" && react_jsx_runtime.jsxs("div", { className: "ff-body", children: [
            react_jsx_runtime.jsx("div", { className: "ff-status", children: "已保存的工作流（点击名称载入编排页）：" }),
            react_jsx_runtime.jsx("div", { className: "ff-wflist", children:
              workflows.length === 0
                ? react_jsx_runtime.jsx("div", { className: "ff-status", children: "（空）先在编排页保存一个工作流。" })
                : workflows.map((wf) => react_jsx_runtime.jsxs("div", { className: "ff-wfitem", children: [
                    react_jsx_runtime.jsx("b", { onClick: () => load(wf), title: "载入", children: wf.name || wf.id }),
                    react_jsx_runtime.jsx("span", { className: "ff-status", children: `${wf.steps} 步` }),
                    react_jsx_runtime.jsx("button", { className: "ff-btn", onClick: () => { setCurrentId(wf.id); setName(wf.name); load(wf); }, children: "载入" }),
                    react_jsx_runtime.jsx("button", { className: "ff-btn danger", onClick: () => remove(wf.id), children: "删" }),
                  ] }, wf.id))
            }),
          ] }),

          tab === "run" && react_jsx_runtime.jsxs("div", { className: "ff-body", children: [
            !run && react_jsx_runtime.jsx("div", { className: "ff-status", children: "当前没有运行。在编排页点「执行」启动。" }),
            run && react_jsx_runtime.jsxs("div", { className: "ff-run", children: [
              react_jsx_runtime.jsxs("div", { children: [
                react_jsx_runtime.jsx("b", { children: run.workflowName }),
                react_jsx_runtime.jsx("span", { className: "ff-status", children: `　${STATUS_TEXT[run.status] ?? run.status} · 第 ${Math.min(run.currentIndex + 1, run.steps.length)}/${run.steps.length} 步` }),
              ] }),
              run.steps.map((s) => react_jsx_runtime.jsxs("div", { className: "ff-run-step", children: [
                react_jsx_runtime.jsx("span", { className: STEP_CLS[s.status] ?? "", children: STEP_ICON[s.status] ?? "·" }),
                react_jsx_runtime.jsx("span", { className: STEP_CLS[s.status] ?? "", children: `${s.index + 1}. ${s.name}` }),
                s.summary && react_jsx_runtime.jsx("span", { className: "ff-status", children: `— ${s.summary}` }),
              ] }, s.stepId)),
              run.status === "awaiting-user" && run.pendingDecision && react_jsx_runtime.jsx("div", { className: "ff-issue-soft", children:
                `AI 提议跳转到第 ${run.pendingDecision.to + 1} 步，请在主对话中答复；或在下方点按钮裁决。` }),
              react_jsx_runtime.jsxs("div", { className: "ff-row2", style: { marginTop: 6 }, children: [
                run.status === "running" && react_jsx_runtime.jsx("button", { className: "ff-btn", disabled: busy, onClick: () => runControl("pause"), children: "⏸ 暂停" }),
                run.status === "paused" && react_jsx_runtime.jsx("button", { className: "ff-btn primary", disabled: busy, onClick: () => runControl("resume", "继续执行 flowforge 工作流。"), children: "▶ 继续" }),
                run.status === "awaiting-user" && react_jsx_runtime.jsx("button", { className: "ff-btn primary", disabled: busy, onClick: () => runControl("approve-jump", "我同意这次跳转，请继续。"), children: "✓ 批准跳转" }),
                run.status === "awaiting-user" && react_jsx_runtime.jsx("button", { className: "ff-btn", disabled: busy, onClick: () => runControl("reject-jump", "我拒绝这次跳转，请按顺序继续。"), children: "✗ 拒绝跳转" }),
                run.status !== "done" && run.status !== "cancelled" && react_jsx_runtime.jsx("button", { className: "ff-btn danger", disabled: busy, onClick: () => runControl("cancel"), children: "■ 终止" }),
              ] }),
            ] }),
          ] }),

          issues && issues.length > 0 && react_jsx_runtime.jsxs("div", { className: "ff-issues", children: [
            react_jsx_runtime.jsx("div", { style: { fontWeight: 600, marginBottom: 4 }, children: "自检结果：" }),
            issues.map((it, i) => react_jsx_runtime.jsxs("div", { className: it.level === "hard" ? "ff-issue-hard" : "ff-issue-soft", children: [
              it.level === "hard" ? "⛔ " : "⚠️ ",
              it.message,
            ] }, i)),
          ] }),
          issues && issues.length === 0 && react_jsx_runtime.jsx("div", { className: "ff-status", children: "✓ 自检通过：无结构性问题（AI 深度审查在执行前进行）。" }),
          error && react_jsx_runtime.jsx("div", { className: "ff-err", children: error }),

          react_jsx_runtime.jsxs("div", { className: "ff-foot", children: [
            react_jsx_runtime.jsx("input", {
              className: "ff-input", style: { maxWidth: 150 }, placeholder: "工作流名称",
              value: name, onChange: (e) => setName(e.target.value),
            }),
            react_jsx_runtime.jsx("button", { className: "ff-btn", disabled: busy, onClick: save, children: "保存" }),
            react_jsx_runtime.jsx("button", { className: "ff-btn", disabled: busy, onClick: selfCheck, children: "自检" }),
            react_jsx_runtime.jsx("button", { className: "ff-btn primary", disabled: busy || steps.length === 0, onClick: start, title: "自审+执行都会在主对话中进行", children: "▶ 执行" }),
            react_jsx_runtime.jsx("button", { className: "ff-btn", onClick: doExport, children: "导出" }),
            react_jsx_runtime.jsx("label", { className: "ff-btn", style: { display: "inline-flex", alignItems: "center", cursor: "pointer" }, children: [
              "导入",
              react_jsx_runtime.jsx("input", { type: "file", accept: ".json,application/json", style: { display: "none" }, onChange: doImport }),
            ] }),
            steps.length > 0 && react_jsx_runtime.jsx("button", { className: "ff-btn danger", onClick: () => { setSteps([]); setIssues(null); }, children: "清空" }),
          ] }),
        ],
      });
    }

    // ------------------------------------------------------------ apply
    function apply(ctx) {
      const connection = ctx.get("connection");
      const remote = ctx.remote ?? null;
      const client = createFlowforgeClient(connection.rpc);

      let open = false;
      const setOpen = (v) => {
        open = v;
        window.dispatchEvent(new CustomEvent(TOGGLE_EVENT, { detail: { open } }));
      };

      const Dock = () => {
        const [on, setOn] = react.useState(open);
        react.useEffect(() => {
          const listener = (e) => setOn(Boolean(e.detail?.open));
          window.addEventListener(TOGGLE_EVENT, listener);
          return () => window.removeEventListener(TOGGLE_EVENT, listener);
        }, []);
        return react_jsx_runtime.jsx("button", {
          className: "ff-dockbtn",
          "data-on": on ? "1" : "0",
          onClick: () => setOpen(!open),
          title: "流程锻造：DIY 工作流编排与执行",
          children: "⚒ 锻造",
        });
      };

      const DockWithPanel = (props) => {
        const [panelOpen, setPanelOpen] = react.useState(open);
        react.useEffect(() => {
          const listener = (e) => setPanelOpen(Boolean(e.detail?.open));
          window.addEventListener(TOGGLE_EVENT, listener);
          return () => window.removeEventListener(TOGGLE_EVENT, listener);
        }, []);
        return react_jsx_runtime.jsxs(react.Fragment, {
          children: [
            react_jsx_runtime.jsx(Dock),
            panelOpen && react_jsx_runtime.jsx(FlowforgePanel, {
              client, remote, sessionId: props.sessionId, open: panelOpen,
              onToggle: () => setOpen(false),
            }),
          ],
        });
      };

      ctx.slots.inject("conversation.composer.dock", () =>
        ctx.slots.register(
          {
            name: "conversation.composer.dock",
            id: PLUGIN_ID,
            order: 30,
            inject: (sessionId) => ({ sessionId }),
          },
          DockWithPanel,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
