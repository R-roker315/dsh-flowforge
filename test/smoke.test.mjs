// 冒烟测试：桩掉 @deepseek-ai/* 依赖，直接驱动 apply() 的引擎与 RPC。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { apply, validateWorkflow } from "../index.js";

// ---- 桩 ----
const registeredTools = [];
const sections = [];
const rpcRoutes = new Map();
const ctx = {
  tools: { register: (t) => registeredTools.push(t) },
  systemPrompt: { section: (s) => sections.push(s) },
  inject(deps, fn) {
    if (deps[0] === "webServer") {
      fn({ connection: { rpc: { handle: (route, handler) => rpcRoutes.set(route, handler) } } });
    }
  },
};

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "flowforge-test-"));
apply(ctx, { dataDir });

const rpc = async (endpoint, payload) => {
  const handler = rpcRoutes.get("/dsh-flowforge");
  assert.ok(handler, "RPC 路由未注册");
  const res = await handler(endpoint, payload);
  assert.equal(res.ok, true);
  return res.value.status === "ok" ? res.value.data : { __error: res.value.error };
};

// ---- 1. validateWorkflow ----
assert.deepEqual(validateWorkflow(null).map((i) => i.level), ["hard"]);
assert.ok(validateWorkflow({ name: "", steps: [] }).some((i) => i.level === "hard"));
const selfLoop = { name: "x", steps: [{ name: "a", text: "hello world", expect: "y", jump: { on: "fail", to: 0 } }] };
assert.ok(validateWorkflow(selfLoop).some((i) => i.level === "hard" && /死循环/.test(i.message)));
const badTarget = { name: "x", steps: [{ name: "a", text: "hello world", jump: { on: "fail", to: 9 } }] };
assert.ok(validateWorkflow(badTarget).some((i) => i.level === "hard" && /不存在/.test(i.message)));
console.log("✓ validateWorkflow");

// ---- 2. 保存 + 状态 ----
const wf = {
  name: "测试流程",
  steps: [
    { name: "第一步", text: "查询机器台账并逐项汇报", expect: "一张表" },
    { name: "第二步", text: "生成报告文件并写盘", expect: "md 文件", jump: { on: "fail", to: 2 } },
    { name: "第三步", text: "收尾总结并归档运行日志", expect: "归档完成" },
  ],
};
const saved = await rpc("workflow/save", { workflow: wf });
assert.ok(saved.workflow.id.startsWith("wf-"));
assert.deepEqual(saved.issues, []);
const state = await rpc("state");
assert.equal(state.workflows.length, 1);
console.log("✓ workflow/save + state");

// ---- 3. 软警告门禁 ----
const wfSoft = { name: "有警告", steps: [{ name: "a", text: "短", expect: "" }] };
const savedSoft = await rpc("workflow/save", { workflow: wfSoft });
assert.ok(savedSoft.issues.some((i) => i.level === "soft"));
console.log("✓ soft issues detected");

// ---- 4. 工具：启动门禁 → 步进 → 预设跳转 → 完成 ----
const tool = (name) => {
  const t = registeredTools.find((x) => x.name === name);
  assert.ok(t, `缺少工具 ${name}`);
  return (args) => t.execute(args, { signal: undefined, name, arguments: args });
};
const runStart = tool("flowforge_run_start");
const stepBegin = tool("flowforge_step_begin");
const stepFinish = tool("flowforge_step_finish");
const runControl = tool("flowforge_run_control");
const runState = tool("flowforge_run_state");
const wfGet = tool("flowforge_workflow_get");

const list = JSON.parse(await wfGet({}));
assert.equal(list.workflows.length, 2);
const got = JSON.parse(await wfGet({ workflowId: saved.workflow.id }));
assert.equal(got.workflow.name, "测试流程");

// 硬伤工作流拒绝启动
const badWf = await rpc("workflow/save", { workflow: { name: "坏", steps: [{ name: "a", text: "" }] } });
const hardOut = await runStart({ workflowId: badWf.workflow.id });
assert.match(hardOut, /HARD ISSUES/);

// 正常启动
const okOut = await runStart({ workflowId: saved.workflow.id });
assert.match(okOut, /运行已启动/);

// 第 1 步
let begin = await stepBegin({});
assert.match(begin, /第 1\/3 步/);
let fin = await stepFinish({ status: "done", summary: "台账已查" });
assert.match(fin, /第 2 步/);

// 第 2 步失败 → 预设跳转到第 3 步（跳过收尾前置，直接进入最后一步）
begin = await stepBegin({});
assert.match(begin, /第 2\/3 步/);
assert.match(begin, /失败时 → 第 3 步/);
fin = await stepFinish({ status: "failed", summary: "报告生成失败" });
assert.match(fin, /第 3 步/);

// 第 3 步完成 → 全部结束
begin = await stepBegin({});
assert.match(begin, /第 3\/3 步/);
fin = await stepFinish({ status: "done", summary: "总结完毕" });
assert.match(fin, /全部步骤/);
const snap = JSON.parse(await runState({}));
assert.equal(snap.status, "done");
assert.equal(snap.steps[1].status, "failed"); // 第 2 步保留失败记录
console.log("✓ run engine (start/preset-jump/complete)");

// ---- 5. 非预设跳转裁决流 ----
await runStart({ workflowId: saved.workflow.id });
await stepBegin({});
const propose = await stepFinish({ status: "failed", summary: "需要跳过", proposeJumpTo: 2 });
assert.match(propose, /等待用户裁决/);
const st = JSON.parse(await runState({}));
assert.equal(st.status, "awaiting-user");
assert.equal(st.pendingDecision.to, 2);
const rej = await runControl({ action: "reject-jump" });
assert.match(rej, /顺序进入/);
const st2 = JSON.parse(await runState({}));
assert.equal(st2.status, "running");
assert.equal(st2.currentIndex, 1); // 拒绝跳转 → 顺序进入第 2 步
assert.equal(st2.steps[0].status, "failed");
console.log("✓ AI-proposed jump decision flow");

// ---- 6. 暂停/继续/终止 ----
await runStart({ workflowId: saved.workflow.id, confirmedSoft: false });
assert.match(await runControl({ action: "pause" }), /paused/);
assert.match(await stepBegin({}), /暂停/);
assert.match(await runControl({ action: "resume" }), /running/);
assert.match(await runControl({ action: "cancel" }), /cancelled/);
console.log("✓ pause/resume/cancel");

// ---- 7. 联想与历史 ----
await rpc("history/record", { text: "查询 machine_all 有效机器台数" });
const sugs = await rpc("suggest", { query: "机器", limit: 8 });
assert.ok(sugs.items.length > 0);
assert.ok(sugs.items.some((s) => s.source === "history"));
console.log("✓ suggest + history");

// ---- 8. 删除 ----
await rpc("workflow/delete", { id: badWf.workflow.id });
const after = await rpc("state");
assert.equal(after.workflows.length, 2); // 测试流程 + 有警告（坏流程已删）
assert.ok(!after.workflows.some((w) => w.id === badWf.workflow.id));
console.log("✓ workflow/delete");

console.log("\nALL SMOKE TESTS PASSED");
