// dsh-flowforge — DIY 工作流锻造：编排 → 自检 → 主对话执行。
// Host 侧：工作流存储、运行引擎（跳转/暂停/门禁）、AI 工具、client RPC。
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import Schema from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "flowforge";
export const inject = ["tools", "systemPrompt", "webServer"];

export const Config = Schema.object({
  dataDir: Schema.string()
    .default("")
    .description("工作流/运行状态存储目录。留空则使用 ~/.dsh-flowforge。"),
});

const GUIDANCE = `## DIY workflow forge (dsh-flowforge)
The user builds step-by-step workflows in a side panel. Each step has: name, prompt text, expected output, and an optional jump rule (fire on fail/pass/always, target step index).

When the user asks to run, validate, or continue a workflow ("执行工作流", "自检", "继续", "跳过" etc.), use the flowforge_* tools:

1. flowforge_workflow_get — fetch the workflow (no id = list summaries).
2. Audit it yourself BEFORE starting: logic contradictions, vague goals, missing info the steps assume, and whether the current environment (available tools/plugins) can actually fulfill each step. Report findings.
3. flowforge_run_start — starts the run. If it returns hard issues, STOP and report them; do not improvise around them. If it returns soft warnings, list them and ask the user to confirm ("知晓风险") before continuing. Never start without this call.
4. Loop: flowforge_step_begin → do the work in the conversation (use all your other tools as needed) → flowforge_step_finish with an honest status ("done"|"failed") and a short summary.
5. Jump rules configured by the user are executed strictly by the engine. If you believe an unplanned jump is needed, call flowforge_step_finish with proposeJumpTo and WAIT for explicit user approval — then flowforge_run_control {action:"approve-jump"}. Never jump on your own authority.
6. If flowforge_step_begin says the run is paused, or the user pauses, end your turn cleanly and wait. Resume only when the user says to continue.

Progress is rendered by the plugin panel from tool calls, so keep summaries short and factual. Never fabricate step results: every outcome must go through flowforge_step_finish.`;

const HARD = "hard";
const SOFT = "soft";

function defaultDataDir() {
  return process.env.DSH_FLOWFORGE_HOME || path.join(os.homedir(), ".dsh-flowforge");
}

function ok(data) {
  return { ok: true, value: { status: "ok", data } };
}
function fail(code, message) {
  return { ok: true, value: { status: "error", error: { code, message } } };
}

function newId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

// ---------------------------------------------------------------- validation

/** 确定性检查（与 UI「自检」按钮同一实现）。返回 issues 数组。 */
export function validateWorkflow(wf) {
  const issues = [];
  if (!wf || typeof wf !== "object") return [{ level: HARD, message: "工作流不存在或格式非法。" }];
  if (!Array.isArray(wf.steps) || wf.steps.length === 0) {
    issues.push({ level: HARD, message: "工作流没有任何步骤。" });
    return issues;
  }
  if (!String(wf.name ?? "").trim()) {
    issues.push({ level: SOFT, message: "工作流未命名。" });
  }
  const n = wf.steps.length;
  wf.steps.forEach((step, i) => {
    const at = `步骤 ${i + 1}`;
    if (!String(step?.text ?? "").trim()) {
      issues.push({ level: HARD, stepIndex: i, message: `${at}（${step?.name || "未命名"}）提示词为空。` });
    } else if (String(step.text).trim().length < 8) {
      issues.push({ level: SOFT, stepIndex: i, message: `${at} 提示词过短（不足 8 字），目标可能含糊。` });
    }
    if (!String(step?.name ?? "").trim()) {
      issues.push({ level: SOFT, stepIndex: i, message: `${at} 缺少步骤名。` });
    }
    if (!String(step?.expect ?? "").trim()) {
      issues.push({ level: SOFT, stepIndex: i, message: `${at} 未填写预期产出，自检与进度判断会变弱。` });
    }
    const jump = step?.jump;
    if (jump && jump.on && jump.on !== "none") {
      const to = Number(jump.to);
      if (!Number.isInteger(to) || to < 0 || to >= n) {
        issues.push({ level: HARD, stepIndex: i, message: `${at} 的跳转目标（第 ${jump.to + 1} 步）不存在。` });
      } else if (to === i) {
        issues.push({ level: HARD, stepIndex: i, message: `${at} 的跳转目标是它自己，会死循环。` });
      } else if (to < i) {
        issues.push({ level: SOFT, stepIndex: i, message: `${at} 向前跳转到第 ${to + 1} 步，注意可能造成循环，确认这是有意的。` });
      }
    }
  });
  return issues;
}

function hasHard(issues) {
  return issues.some((it) => it.level === HARD);
}

// ---------------------------------------------------------------- apply

export function apply(ctx, config = {}) {
  const dataDir = String(config.dataDir || "").trim() || defaultDataDir();
  const workflowsDir = path.join(dataDir, "workflows");
  const runsDir = path.join(dataDir, "runs");
  for (const dir of [workflowsDir, runsDir]) fs.mkdirSync(dir, { recursive: true });

  const historyFile = path.join(dataDir, "history.json");

  // ---- 存储 ----
  async function saveWorkflow(wf) {
    const clean = {
      id: String(wf.id || "").trim() || newId("wf"),
      name: String(wf.name ?? "").trim(),
      createdAt: wf.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      steps: (Array.isArray(wf.steps) ? wf.steps : []).map((s, i) => ({
        id: String(s?.id || `s${i + 1}`),
        name: String(s?.name ?? "").trim(),
        text: String(s?.text ?? ""),
        expect: String(s?.expect ?? "").trim(),
        jump: s?.jump && s.jump.on && s.jump.on !== "none"
          ? { on: String(s.jump.on), to: Number(s.jump.to) }
          : null,
      })),
    };
    const file = path.join(workflowsDir, `${clean.id}.json`);
    await fsp.writeFile(file, JSON.stringify(clean, null, 2), "utf8");
    return clean;
  }

  async function readWorkflow(id) {
    try {
      return JSON.parse(await fsp.readFile(path.join(workflowsDir, `${path.basename(String(id))}.json`), "utf8"));
    } catch {
      return null;
    }
  }

  async function listWorkflows() {
    let files = [];
    try {
      files = await fsp.readdir(workflowsDir);
    } catch {
      return [];
    }
    const out = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const wf = JSON.parse(await fsp.readFile(path.join(workflowsDir, f), "utf8"));
        out.push({ id: wf.id, name: wf.name, steps: wf.steps?.length ?? 0, updatedAt: wf.updatedAt });
      } catch {
        /* skip broken */
      }
    }
    out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return out;
  }

  async function recordHistory(text) {
    const t = String(text ?? "").trim();
    if (!t) return;
    let history = [];
    try {
      history = JSON.parse(await fsp.readFile(historyFile, "utf8"));
    } catch {
      /* empty */
    }
    if (!Array.isArray(history)) history = [];
    const found = history.find((h) => h.text === t);
    if (found) {
      found.count = (found.count ?? 1) + 1;
      found.at = Date.now();
    } else {
      history.push({ text: t, count: 1, at: Date.now() });
    }
    if (history.length > 500) history = history.slice(-500);
    await fsp.writeFile(historyFile, JSON.stringify(history, null, 2), "utf8");
  }

  async function readHistory() {
    try {
      const arr = JSON.parse(await fsp.readFile(historyFile, "utf8"));
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  // ---- 运行引擎（内存为主，落盘为辅） ----
  let run = null; // 活动运行

  function runSnapshot() {
    if (!run) return null;
    return {
      id: run.id,
      workflowId: run.workflowId,
      workflowName: run.workflowName,
      status: run.status,
      currentIndex: run.currentIndex,
      pendingDecision: run.pendingDecision ?? null,
      steps: run.steps.map((s, i) => ({ index: i, ...s })),
      issues: run.issues,
      updatedAt: Date.now(),
    };
  }

  async function persistRun() {
    if (!run) return;
    try {
      await fsp.writeFile(path.join(runsDir, `${run.id}.json`), JSON.stringify(runSnapshot(), null, 2), "utf8");
    } catch {
      /* best-effort */
    }
  }

  async function startRun(wf, confirmedSoft) {
    const issues = validateWorkflow(wf);
    if (hasHard(issues)) {
      return { started: false, hardBlock: true, issues };
    }
    const soft = issues.filter((it) => it.level === SOFT);
    if (soft.length > 0 && !confirmedSoft) {
      return { started: false, hardBlock: false, issues };
    }
    run = {
      id: newId("run"),
      workflowId: wf.id,
      workflowName: wf.name || "(未命名工作流)",
      status: "running",
      currentIndex: 0,
      pendingDecision: null,
      steps: wf.steps.map((s, i) => ({
        stepId: s.id,
        name: s.name || `步骤 ${i + 1}`,
        text: s.text,
        expect: s.expect || "",
        jump: s.jump ?? null,
        status: "pending",
        summary: "",
      })),
      issues,
    };
    await persistRun();
    return { started: true, issues, run: runSnapshot() };
  }

  function computeNext(i) {
    const step = run.steps[i];
    return step.jump ? { on: step.jump.on, to: step.jump.to } : null;
  }

  async function control(action, arg) {
    if (!run) return { error: "当前没有运行中的工作流。" };
    switch (action) {
      case "pause":
        if (run.status === "running") run.status = "paused";
        break;
      case "resume":
        if (run.status === "paused") run.status = "running";
        break;
      case "cancel":
        run.status = "cancelled";
        break;
      case "approve-jump": {
        if (run.status !== "awaiting-user" || !run.pendingDecision) {
          return { error: "没有待裁决的跳转。" };
        }
        run.currentIndex = run.pendingDecision.to;
        run.pendingDecision = null;
        run.status = "running";
        break;
      }
      case "reject-jump": {
        if (run.status !== "awaiting-user" || !run.pendingDecision) {
          return { error: "没有待裁决的跳转。" };
        }
        const failed = run.currentIndex;
        run.steps[failed].status = "failed";
        run.currentIndex = failed + 1;
        run.pendingDecision = null;
        run.status = run.currentIndex >= run.steps.length ? "done" : "running";
        if (run.status === "done") run.steps.forEach((s) => { if (s.status === "pending") s.status = "skipped"; });
        break;
      }
      default:
        return { error: `未知操作：${action}` };
    }
    await persistRun();
    return { run: runSnapshot(), ...(arg ?? {}) };
  }

  // ---- AI 工具 ----
  const tools = [
    defineTool({
      name: "flowforge_workflow_get",
      description:
        "Fetch a flowforge DIY workflow. Without workflowId, returns a list of saved workflows. Use before running to audit it.",
      output: { schema: { type: "string" }, render: (_args, value) => String(value ?? "") },
      parameters: {
        workflowId: {
          type: "string",
          description: "工作流 ID。留空则列出全部。",
        },
      },
      async execute(args) {
        if (args?.workflowId) {
          const wf = await readWorkflow(args.workflowId);
          if (!wf) return `找不到工作流 ${args.workflowId}。`;
          return JSON.stringify({ workflow: wf, issues: validateWorkflow(wf) }, null, 2);
        }
        return JSON.stringify({ workflows: await listWorkflows() }, null, 2);
      },
    }),
    defineTool({
      name: "flowforge_run_start",
      description:
        "Start executing a saved workflow. Performs hard structural checks. Returns hardBlock=true → STOP and report; returns soft issues → list them and ask the user to confirm before re-calling with confirmedSoft=true.",
      output: { schema: { type: "string" }, render: (_args, value) => String(value ?? "") },
      parameters: {
        workflowId: {
          type: "string",
          required: true,
          description: "要启动的工作流 ID。",
        },
        confirmedSoft: {
          type: "boolean",
          description: "用户已知晓软警告并同意继续时置 true。",
        },
      },
      async execute(args) {
        const wf = await readWorkflow(args.workflowId);
        if (!wf) return `找不到工作流 ${args.workflowId}。先用 flowforge_workflow_get 核对 ID。`;
        const result = await startRun(wf, Boolean(args.confirmedSoft));
        if (!result.started && result.hardBlock) {
          return [
            "HARD ISSUES — 工作流存在硬伤，禁止启动，请如实向用户报告并停止：",
            JSON.stringify(result.issues, null, 2),
          ].join("\n");
        }
        if (!result.started) {
          return [
            "SOFT WARNINGS — 启动被暂缓。把以下警告逐条讲给用户，请其确认「知晓风险」后，",
            "再用 confirmedSoft=true 重新调用本工具。不要替用户做决定：",
            JSON.stringify(result.issues.filter((i) => i.level === SOFT), null, 2),
          ].join("\n");
        }
        const first = result.run.steps[0];
        return [
          `运行已启动（runId=${result.run.id}）。共 ${result.run.steps.length} 步。`,
          result.issues.length ? `软警告（已放行）：${JSON.stringify(result.issues.filter((i) => i.level === SOFT))}` : "",
          "现在从第 1 步开始：调用 flowforge_step_begin 获取当前步骤详情，执行后用 flowforge_step_finish 汇报结果。",
          `第 1 步「${first.name}」提示词：${first.text}`,
        ]
          .filter(Boolean)
          .join("\n");
      },
    }),
    defineTool({
      name: "flowforge_step_begin",
      description: "Begin the current step of the active run. Returns the step prompt to execute, or a pause/cancel notice.",
      output: { schema: { type: "string" }, render: (_args, value) => String(value ?? "") },
      parameters: {},
      async execute() {
        if (!run) return "没有活动运行。先 flowforge_run_start。";
        if (run.status === "cancelled") return "运行已被用户终止。停止执行，做收尾汇报。";
        if (run.status === "paused") return "运行已被用户暂停。停止执行，等待用户明确说「继续」再调 flowforge_step_begin。";
        if (run.status === "awaiting-user") {
          const d = run.pendingDecision;
          return `等待用户裁决：是否同意跳转到第 ${d.to + 1} 步「${run.steps[d.to].name}」。用户同意后调 flowforge_run_control {action:"approve-jump"}，拒绝则 {action:"reject-jump"}。`;
        }
        if (run.currentIndex >= run.steps.length) {
          run.status = "done";
          await persistRun();
          return "所有步骤已完成（部分可能被跳过）。向用户做运行总结。";
        }
        const step = run.steps[run.currentIndex];
        step.status = "active";
        await persistRun();
        return [
          `第 ${run.currentIndex + 1}/${run.steps.length} 步「${step.name}」开始。`,
          `提示词：${step.text}`,
          step.expect ? `预期产出：${step.expect}` : "（该步未填预期产出）",
          step.jump ? `引擎预设跳转：${step.jump.on === "always" ? "无论如何" : step.jump.on === "fail" ? "失败时" : "成功时"} → 第 ${step.jump.to + 1} 步「${run.steps[step.jump.to].name}」` : "无预设跳转（完成则顺序下一步）",
          "完成该步后必须调用 flowforge_step_finish 汇报真实结果。",
        ].join("\n");
      },
    }),
    defineTool({
      name: "flowforge_step_finish",
      description:
        "Report the real outcome of the current step. status: done|failed. summary: 1-2 句事实。若认为需要非预设跳转，给 proposeJumpTo（0 基序号）并等待用户裁决。",
      output: { schema: { type: "string" }, render: (_args, value) => String(value ?? "") },
      parameters: {
        status: {
          type: "string",
          required: true,
          description: '步骤真实结果："done" 或 "failed"。',
        },
        summary: {
          type: "string",
          required: true,
          description: "1-2 句事实性摘要。",
        },
        proposeJumpTo: {
          type: "number",
          description: "提议跳转到的步骤序号（0 基）。仅在确有必要时提供。",
        },
      },
      async execute(args) {
        if (!run) return "没有活动运行。";
        const i = run.currentIndex;
        if (i >= run.steps.length) return "运行已结束。";
        const step = run.steps[i];
        step.summary = String(args.summary ?? "").slice(0, 500);
        const proposed = Number.isInteger(args.proposeJumpTo)
          ? args.proposeJumpTo
          : null;

        // 非预设跳转提议 → 交用户裁决
        if (proposed !== null) {
          if (proposed < 0 || proposed >= run.steps.length) {
            return `提议的跳转目标（第 ${proposed + 1} 步）不存在，无效。请如实汇报步骤结果（status=${args.status}），不要提议不存在的跳转。`;
          }
          run.status = "awaiting-user";
          run.pendingDecision = { from: i, to: proposed };
          await persistRun();
          return `已挂起等待用户裁决：是否从第 ${i + 1} 步跳到第 ${proposed + 1} 步「${run.steps[proposed].name}」。请把你的理由和两个选项明确讲给用户，等待其答复后再调 flowforge_run_control。`;
        }

        step.status = args.status === "done" ? "done" : "failed";
        const jump = computeNext(i);
        if (args.status === "failed" && jump && (jump.on === "fail" || jump.on === "always")) {
          run.currentIndex = jump.to;
        } else if (args.status === "done" && jump && (jump.on === "pass" || jump.on === "always")) {
          run.currentIndex = jump.to;
        } else {
          run.currentIndex = i + 1;
        }
        if (run.currentIndex >= run.steps.length) {
          run.status = "done";
          await persistRun();
          return "全部步骤处理完毕。向用户做运行总结（各步骤结果一览）。";
        }
        await persistRun();
        return [
          `已记录：第 ${i + 1} 步 ${step.status}。`,
          `下一步是第 ${run.currentIndex + 1} 步「${run.steps[run.currentIndex].name}」。`,
          "继续调用 flowforge_step_begin。",
        ].join("\n");
      },
    }),
    defineTool({
      name: "flowforge_run_control",
      description: "Control the active run. actions: pause|resume|cancel|approve-jump|reject-jump.",
      output: { schema: { type: "string" }, render: (_args, value) => String(value ?? "") },
      parameters: {
        action: {
          type: "string",
          required: true,
          description: "操作：pause | resume | cancel | approve-jump | reject-jump。",
        },
      },
      async execute(args) {
        const r = await control(args.action);
        if (r.error) return `失败：${r.error}`;
        if (args.action === "approve-jump") {
          return `跳转已获用户批准，当前在第 ${r.run.currentIndex + 1} 步「${r.run.steps[r.run.currentIndex].name}」。调用 flowforge_step_begin 继续。`;
        }
        if (args.action === "reject-jump") {
          return r.run.status === "done"
            ? "已拒绝跳转且无后续步骤，运行结束。向用户总结。"
            : "已拒绝跳转，顺序进入下一步。调用 flowforge_step_begin 继续。";
        }
        return `已执行 ${args.action}。运行状态：${r.run.status}。`;
      },
    }),
    defineTool({
      name: "flowforge_run_state",
      description: "Snapshot of the active run: per-step status, current index, pending decisions.",
      output: { schema: { type: "string" }, render: (_args, value) => String(value ?? "") },
      parameters: {},
      async execute() {
        return JSON.stringify(runSnapshot() ?? { active: false }, null, 2);
      },
    }),
  ];

  for (const t of tools) ctx.tools.register(t);
  ctx.systemPrompt.section({ name: "tool:flowforge", order: 110, text: GUIDANCE });

  // ---- client RPC ----
  const BUILTIN_LEXICON = [
    "查询 machine_all 有效机器台数", "按 IP 查机器台账", "统计各环境机器分布", "导出表格到 Excel",
    "读取 Excel 并汇总", "生成巡检报告", "生成方案文档 v0.1", "检查磁盘空间", "查看服务端口监听",
    "探活网段存活 IP", "重启指定服务前先确认", "批量检查 PVE 虚拟机状态", "克隆虚拟机模板",
    "查看最近登录用户", "核对备份任务覆盖", "列出防火墙规则", "生成变更影响面清单", "汇总故障/换件记录",
    "抓取网页内容并总结", "翻译并润色", "代码审查并给出修改建议", "跑测试并修复失败项", "提交 git 前先让我确认",
  ];

  async function suggest(query, limit = 8) {
    const q = String(query ?? "").trim();
    if (!q) return [];
    const history = await readHistory();
    const scored = [];
    for (const h of history) {
      if (h.text.includes(q) || q.includes(h.text)) {
        scored.push({ text: h.text, source: "history", score: 100 + (h.count ?? 1) * 5 + Math.min(50, (Date.now() - (h.at ?? 0)) / 86400000 * -1) });
      }
    }
    for (const b of BUILTIN_LEXICON) {
      if (b.includes(q) || q.includes(b) || b.split(/\s+/).some((w) => w && q.includes(w))) {
        scored.push({ text: b, source: "builtin", score: 50 });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const seen = new Set();
    return scored.filter((s) => !seen.has(s.text) && seen.add(s.text)).slice(0, limit).map(({ text, source }) => ({ text, source }));
  }

  const rpcHandler = async (endpoint, payload = {}) => {
    try {
      switch (endpoint) {
        case "state":
          return ok({
            workflows: await listWorkflows(),
            activeRun: runSnapshot(),
            panel: { version: 1 },
          });
        case "workflow/get": {
          const wf = await readWorkflow(payload.id);
          return wf ? ok({ workflow: wf }) : fail("not_found", "工作流不存在");
        }
        case "workflow/save": {
          const issues = validateWorkflow(payload.workflow);
          const saved = await saveWorkflow(payload.workflow);
          return ok({ workflow: saved, issues });
        }
        case "workflow/delete": {
          const id = path.basename(String(payload.id ?? ""));
          await fsp.rm(path.join(workflowsDir, `${id}.json`), { force: true });
          return ok({ deleted: id });
        }
        case "run/control": {
          const r = await control(payload.action);
          return r.error ? fail("control_failed", r.error) : ok({ run: r.run });
        }
        case "suggest":
          return ok({ items: await suggest(payload.query, payload.limit) });
        case "history/record":
          await recordHistory(payload.text);
          return ok({});
        default:
          return fail("unknown_endpoint", `未知 endpoint：${endpoint}`);
      }
    } catch (error) {
      return fail("internal", error?.message ?? String(error));
    }
  };

  ctx.inject(["webServer"], (webCtx) => {
    try {
      const conn = webCtx.connection ?? webCtx.get?.("connection");
      conn?.rpc?.handle?.("/dsh-flowforge", rpcHandler, { authority: "trusted-host" });
    } catch (error) {
      console.warn("[dsh-flowforge] rpc.handle failed:", error?.message ?? error);
    }
  });
}
