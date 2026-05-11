import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  buildHomeEnv,
  createHomeFixture,
  createPackageFixture,
  createTempDir,
  writeJson,
  runNode,
  readText,
  writeText,
} from './helpers/test-env.mjs'
import { getSessionStatePath, parseStdoutJson, writeSettings } from './helpers/runtime-test-helpers.mjs'

test('codex notify gates only main complete turns from turn-state', () => {
  const { root: pkgRoot } = createPackageFixture()
  const home = createHomeFixture()
  const env = buildHomeEnv(home)
  const project = createTempDir('helloagents-turn-state-')
  const notifyScript = join(pkgRoot, 'scripts', 'notify.mjs')
  const turnStateScript = join(pkgRoot, 'scripts', 'turn-state.mjs')

  writeSettings(home, { output_format: true })
  writeText(
    getSessionStatePath(project),
    [
      '# 恢复快照',
      '',
      '## 主线目标',
      '完成当前审计收尾',
      '',
      '## 正在做什么',
      '整理当前方案包',
      '',
      '## 方案',
      '.helloagents/plans/202604100101_audit',
      '',
      '## 下一步',
      '补齐方案包并完成收尾',
      '',
    ].join('\n'),
  )
  writeText(join(project, '.helloagents', 'plans', '202604100101_audit', 'requirements.md'), '# audit requirements\n')
  writeText(join(project, '.helloagents', 'plans', '202604100101_audit', 'plan.md'), '# audit plan\n')
  writeText(join(project, '.helloagents', 'plans', '202604100101_audit', 'tasks.md'), '# audit tasks\n\n- [ ] still open\n')

  let result = runNode(notifyScript, ['codex-notify', JSON.stringify({
    type: 'agent-turn-complete',
    client: 'codex-tui',
    cwd: project,
    'last-assistant-message': '审计完成',
  })], {
    cwd: project,
    env,
  })
  assert.equal(result.stdout, '')

  result = runNode(turnStateScript, ['write'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      role: 'subagent',
      kind: 'complete',
      phase: 'verify',
    }),
  })
  parseStdoutJson(result)
  result = runNode(notifyScript, ['codex-notify', JSON.stringify({
    type: 'agent-turn-complete',
    client: 'codex-tui',
    cwd: project,
    'last-assistant-message': '审计完成',
  })], {
    cwd: project,
    env,
  })
  assert.equal(result.stdout, '')

  result = runNode(turnStateScript, ['write'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      role: 'main',
      kind: 'waiting',
      phase: 'plan',
      taskSummary: '审计支付链路风险',
      reasonCategory: 'missing-input',
      reason: '用户尚未给出当前审计范围。',
    }),
  })
  parseStdoutJson(result)
  result = runNode(notifyScript, ['codex-notify', JSON.stringify({
    type: 'agent-turn-complete',
    client: 'codex-tui',
    cwd: project,
    'last-assistant-message': '审计完成',
  })], {
    cwd: project,
    env,
  })
  assert.equal(result.stdout, '')

  result = runNode(turnStateScript, ['write'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      role: 'main',
      kind: 'complete',
      phase: 'consolidate',
      taskSummary: '完成支付链路审计',
    }),
  })
  parseStdoutJson(result)
  result = runNode(notifyScript, ['codex-notify', JSON.stringify({
    type: 'agent-turn-complete',
    client: 'codex-tui',
    cwd: project,
    'last-assistant-message': '审计完成',
  })], {
    cwd: project,
    env,
  })
  let payload = parseStdoutJson(result)
  assert.equal(payload.decision, 'block')
  assert.match(payload.reason, /unfinished tasks|missing a trustworthy structured contract/)

  result = runNode(turnStateScript, ['read'], {
    cwd: project,
    env,
    input: JSON.stringify({ cwd: project }),
  })
  payload = parseStdoutJson(result)
  assert.equal(payload.state, null)

  result = runNode(notifyScript, ['codex-notify', JSON.stringify({
    type: 'agent-turn-complete',
    client: 'codex-tui',
    cwd: project,
    'last-assistant-message': '等待后台终端完成',
  })], {
    cwd: project,
    env,
  })
  assert.equal(result.stdout, '')
})

test('fullstack closeout blocks completion without task store evidence', () => {
  const { root: pkgRoot } = createPackageFixture()
  const home = createHomeFixture()
  const env = buildHomeEnv(home)
  const project = createTempDir('helloagents-fullstack-gate-missing-')
  const notifyScript = join(pkgRoot, 'scripts', 'notify.mjs')
  const turnStateScript = join(pkgRoot, 'scripts', 'turn-state.mjs')

  writeSettings(home, { output_format: true })

  let result = runNode(notifyScript, ['route'], {
    cwd: project,
    env,
    input: JSON.stringify({ cwd: project, prompt: '~fullstack 完善指标采集三个核心看板' }),
  })
  parseStdoutJson(result)

  result = runNode(turnStateScript, ['write'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      role: 'main',
      kind: 'complete',
      phase: 'verify',
      taskSummary: '完善指标采集三个核心看板',
    }),
  })
  parseStdoutJson(result)

  result = runNode(notifyScript, ['codex-notify', JSON.stringify({
    type: 'agent-turn-complete',
    client: 'codex-tui',
    cwd: project,
    durationMs: 103000,
    'last-assistant-message': '完成指标看板',
  })], {
    cwd: project,
    env,
  })
  const payload = parseStdoutJson(result)
  assert.equal(payload.decision, 'block')
  assert.match(payload.reason, /Fullstack Gate/)
  assert.match(payload.reason, /缺少 fullstack 当前任务状态/)
})

test('fullstack closeout allows completion with task store evidence', () => {
  const { root: pkgRoot } = createPackageFixture()
  const home = createHomeFixture()
  const env = buildHomeEnv(home)
  const project = createTempDir('helloagents-fullstack-gate-ready-')
  const notifyScript = join(pkgRoot, 'scripts', 'notify.mjs')
  const turnStateScript = join(pkgRoot, 'scripts', 'turn-state.mjs')
  const taskGroupId = '202605070901_metrics_dashboards'
  const localProject = join(project, 'dashboard')
  const inbox = join(localProject, '.helloagents', 'fullstack', 'inbox', `${taskGroupId}.be-nodejs-main.task.json`)
  const localState = join(localProject, '.helloagents', 'fullstack', 'state', `${taskGroupId}.json`)
  const globalEventLog = join(project, '.helloagents', 'fullstack', 'tasks', 'events.ndjson')

  writeSettings(home, { output_format: true })
  writeText(join(project, '.helloagents', 'fullstack', 'docs', 'tasks.md'), '# tasks\n')
  writeText(join(project, '.helloagents', 'fullstack', 'docs', 'agents.md'), '# agents\n')
  writeText(join(project, '.helloagents', 'fullstack', 'docs', 'upstream.md'), '# upstream\n')
  writeJson(inbox, { task_id: 'T1', task_group_id: taskGroupId })
  writeJson(localState, { task_id: 'T1', status: 'completed' })
  writeText(globalEventLog, `${JSON.stringify({
    event_type: 'task_completed',
    task_group_id: taskGroupId,
    task_id: 'T1',
  })}\n`)
  writeJson(join(project, '.helloagents', 'fullstack', 'tasks', 'current.json'), {
    task_group_id: taskGroupId,
    status: 'completed',
    global_runtime: {
      event_log: globalEventLog,
    },
    tasks: {
      T1: {
        task_id: 'T1',
        engineer_id: 'be-nodejs-main',
        project: localProject,
        description: '完善指标采集三个核心看板',
        status: 'completed',
        local_runtime: {
          inbox,
          state: localState,
        },
      },
    },
  })

  let result = runNode(notifyScript, ['route'], {
    cwd: project,
    env,
    input: JSON.stringify({ cwd: project, prompt: '~fullstack 完善指标采集三个核心看板' }),
  })
  parseStdoutJson(result)

  result = runNode(turnStateScript, ['write'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      role: 'main',
      kind: 'complete',
      phase: 'verify',
      taskSummary: '完善指标采集三个核心看板',
    }),
  })
  parseStdoutJson(result)

  result = runNode(notifyScript, ['codex-notify', JSON.stringify({
    type: 'agent-turn-complete',
    client: 'codex-tui',
    cwd: project,
    durationMs: 103000,
    'last-assistant-message': '完成指标看板',
  })], {
    cwd: project,
    env,
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)

  assert.equal(existsSync(join(home, '.helloagents', 'runtime', 'turn-state.json')), false)
})

test('stop allows structured waiting turn-state and clears it', () => {
  const { root: pkgRoot } = createPackageFixture()
  const home = createHomeFixture()
  const env = buildHomeEnv(home)
  const project = createTempDir('helloagents-turn-state-waiting-')
  const notifyScript = join(pkgRoot, 'scripts', 'notify.mjs')
  const turnStateScript = join(pkgRoot, 'scripts', 'turn-state.mjs')

  writeSettings(home)
  writeJson(join(project, 'package.json'), {
    name: 'turn-state-waiting-project',
    scripts: {
      build: 'node -e "process.exit(1)"',
    },
  })

  let result = runNode(turnStateScript, ['write'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      role: 'main',
      kind: 'waiting',
      phase: 'clarify',
      reasonCategory: 'ambiguity',
      reason: '当前需求存在影响实现结果的真实歧义。',
    }),
  })
  parseStdoutJson(result)

  result = runNode(notifyScript, ['stop'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      lastAssistantMessage: '当前任务已完成，等待您的下一步指示。',
    }),
  })
  let payload = parseStdoutJson(result)
  assert.equal(payload.suppressOutput, true)

  result = runNode(turnStateScript, ['read'], {
    cwd: project,
    env,
    input: JSON.stringify({ cwd: project }),
  })
  payload = parseStdoutJson(result)
  assert.equal(payload.state, null)
})

test('turn-state rejects waiting without blocker details', () => {
  const { root: pkgRoot } = createPackageFixture()
  const home = createHomeFixture()
  const env = buildHomeEnv(home)
  const project = createTempDir('helloagents-turn-state-invalid-')
  const turnStateScript = join(pkgRoot, 'scripts', 'turn-state.mjs')

  const result = runNode(turnStateScript, ['write'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      role: 'main',
      kind: 'waiting',
      phase: 'clarify',
    }),
  })

  assert.notEqual(result.status, 0)
  assert.match(`${result.stderr}${result.stdout}`, /requires reasonCategory and reason/)
})

test('stop blocks explicit auto when turn-state is missing', () => {
  const { root: pkgRoot } = createPackageFixture()
  const home = createHomeFixture()
  const env = buildHomeEnv(home)
  const project = createTempDir('helloagents-stop-auto-missing-')
  const notifyScript = join(pkgRoot, 'scripts', 'notify.mjs')

  writeSettings(home)

  let result = runNode(notifyScript, ['route'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      prompt: '~auto continue the current task until done',
    }),
  })
  parseStdoutJson(result)

  result = runNode(notifyScript, ['stop'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      lastAssistantMessage: '我先停在这里，等你决定下一步。',
    }),
  })

  const payload = parseStdoutJson(result)
  assert.equal(payload.decision, 'block')
  assert.match(payload.reason, /显式 ~auto 本轮不应直接停下/)
  assert.match(payload.reason, /缺少主代理 turn-state/)
})

test('codex notify blocks explicit auto when turn-state is missing', () => {
  const { root: pkgRoot } = createPackageFixture()
  const home = createHomeFixture()
  const env = buildHomeEnv(home)
  const project = createTempDir('helloagents-codex-auto-missing-')
  const notifyScript = join(pkgRoot, 'scripts', 'notify.mjs')

  writeSettings(home, { output_format: true })

  let result = runNode(notifyScript, ['route'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      prompt: '~auto continue the current task until done',
    }),
  })
  parseStdoutJson(result)

  result = runNode(notifyScript, ['codex-notify', JSON.stringify({
    type: 'agent-turn-complete',
    client: 'codex-tui',
    cwd: project,
    'last-assistant-message': '我先停在这里，等你决定下一步。',
  })], {
    cwd: project,
    env,
  })

  const payload = parseStdoutJson(result)
  assert.equal(payload.decision, 'block')
  assert.match(payload.reason, /显式 ~auto 本轮不应直接停下/)
  assert.match(payload.reason, /缺少主代理 turn-state/)
})

test('stop ignores completion-looking text when turn-state is missing', () => {
  const { root: pkgRoot } = createPackageFixture()
  const home = createHomeFixture()
  const env = buildHomeEnv(home)
  const project = createTempDir('helloagents-turn-state-missing-')
  const notifyScript = join(pkgRoot, 'scripts', 'notify.mjs')

  writeSettings(home, { ralph_loop_enabled: false })
  writeText(
    join(project, '.helloagents', 'plans', '202604200101_feature', 'tasks.md'),
    [
      '# feature',
      '',
      '## 任务列表',
      '- [ ] 收尾验证',
      '',
    ].join('\n'),
  )

  const result = runNode(notifyScript, ['stop'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      lastAssistantMessage: '当前任务已完成，等待您的下一步指示。',
    }),
  })
  const payload = parseStdoutJson(result)
  assert.equal(payload.suppressOutput, true)
  assert.equal(payload.decision, undefined)
})

test('stop delivery gate prefers structured turn-state over completion text', () => {
  const { root: pkgRoot } = createPackageFixture()
  const home = createHomeFixture()
  const env = buildHomeEnv(home)
  const project = createTempDir('helloagents-turn-state-stop-')
  const notifyScript = join(pkgRoot, 'scripts', 'notify.mjs')
  const turnStateScript = join(pkgRoot, 'scripts', 'turn-state.mjs')

  writeSettings(home, { ralph_loop_enabled: false })
  writeText(
    join(project, '.helloagents', 'plans', '202604200101_feature', 'tasks.md'),
    [
      '# feature',
      '',
      '## 任务列表',
      '- [ ] 收尾验证',
      '- [√] 已完成任务',
      '',
    ].join('\n'),
  )

  let result = runNode(turnStateScript, ['write'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      role: 'main',
      kind: 'waiting',
      phase: 'clarify',
      reasonCategory: 'ambiguity',
      reason: '当前需求存在影响实现结果的真实歧义。',
    }),
  })
  parseStdoutJson(result)

  result = runNode(notifyScript, ['stop'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      lastAssistantMessage: '当前任务已完成，等待您的下一步指示。',
    }),
  })
  let payload = parseStdoutJson(result)
  assert.equal(payload.suppressOutput, true)

  result = runNode(turnStateScript, ['write'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      role: 'main',
      kind: 'complete',
      phase: 'consolidate',
    }),
  })
  parseStdoutJson(result)

  result = runNode(notifyScript, ['stop'], {
    cwd: project,
    env,
    input: JSON.stringify({
      cwd: project,
      lastAssistantMessage: '收尾摘要已写入。',
    }),
  })
  payload = parseStdoutJson(result)
  assert.equal(payload.decision, 'block')
  assert.match(payload.reason, /unfinished tasks/)
})
