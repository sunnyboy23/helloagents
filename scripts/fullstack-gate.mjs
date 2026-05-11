#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getApplicableRouteContext } from './runtime-context.mjs'
import { readTurnState } from './turn-state.mjs'
import { getCurrentStateFile } from './fullstack-runtime-store.mjs'

function normalizePath(filePath = '') {
  return filePath ? normalize(resolve(filePath)) : ''
}

function readStdinJson() {
  try {
    return JSON.parse(readFileSync(0, 'utf-8'))
  } catch {
    return {}
  }
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function listMissingArtifacts(kbRoot) {
  return [
    'fullstack/docs/tasks.md',
    'fullstack/docs/agents.md',
    'fullstack/docs/upstream.md',
  ].filter((artifact) => !existsSync(join(kbRoot, artifact)))
}

function taskLocalRuntimeMissing(task = {}) {
  const runtime = task.local_runtime || {}
  return !runtime.inbox || !runtime.state || !existsSync(runtime.inbox) || !existsSync(runtime.state)
}

function collectTaskIssues(state = {}) {
  const tasks = Object.values(state.tasks || {})
  const openTasks = tasks
    .filter((task) => !['completed', 'skipped'].includes(task.status))
    .map((task) => `${task.task_id || task.id}: ${task.status || 'pending'} ${task.description || ''}`.trim())
  const missingLocalRuntime = tasks
    .filter(taskLocalRuntimeMissing)
    .map((task) => `${task.task_id || task.id}: ${task.project || 'unknown project'}`)
  return { tasks, openTasks, missingLocalRuntime }
}

function hasFullstackCompletionEvent(state) {
  const eventLog = state.global_runtime?.event_log
  if (!eventLog || !existsSync(eventLog)) return false
  const text = readFileSync(eventLog, 'utf-8')
  return /"event_type":"task_(completed|failed|blocked|partial)"/u.test(text)
}

function buildBlockReason(issues) {
  const lines = [
    '[Fullstack Gate] 当前是显式 ~fullstack 流程，不能在缺少全栈运行态证据时报告完成。',
  ]
  issues.forEach((issue) => {
    lines.push(`- ${issue}`)
  })
  lines.push('请先走 fullstack task store：确认需求 → 创建任务组 → 派发/启动任务 → 写项目本地状态 → 完成或阻塞任务 → 再收尾。')
  return lines.join('\n')
}

export function inspectFullstackCloseout({ cwd = process.cwd() } = {}) {
  const projectRoot = normalizePath(cwd)
  const kbRoot = join(projectRoot, '.helloagents')
  const stateFile = getCurrentStateFile({ projectRoot, kbRoot })
  const state = readJsonFile(stateFile)
  const issues = []

  if (!state) {
    return {
      ok: false,
      stateFile,
      issues: [`缺少 fullstack 当前任务状态：${stateFile}`],
    }
  }

  const missingArtifacts = listMissingArtifacts(kbRoot)
  if (missingArtifacts.length) {
    issues.push(`缺少 fullstack 文档：${missingArtifacts.join(', ')}`)
  }

  const { tasks, openTasks, missingLocalRuntime } = collectTaskIssues(state)
  if (!tasks.length) issues.push('fullstack 任务组没有任务。')
  if (openTasks.length) issues.push(`仍有未完成任务：${openTasks.slice(0, 5).join(' | ')}`)
  if (missingLocalRuntime.length) {
    issues.push(`项目本地 fullstack 状态不完整：${missingLocalRuntime.slice(0, 5).join(' | ')}`)
  }
  if (!hasFullstackCompletionEvent(state)) {
    issues.push('缺少 fullstack 任务完成/失败/阻塞事件记录。')
  }

  return {
    ok: issues.length === 0,
    stateFile,
    taskGroupId: state.task_group_id || '',
    issues,
  }
}

function main() {
  const payload = readStdinJson()
  const cwd = payload.cwd || process.cwd()
  const routeContext = getApplicableRouteContext({ cwd })
  if (routeContext?.skillName !== 'fullstack') {
    process.stdout.write(JSON.stringify({ suppressOutput: true }))
    return
  }

  const turnState = readTurnState(cwd)
  if (turnState?.role !== 'main' || turnState.kind !== 'complete') {
    process.stdout.write(JSON.stringify({ suppressOutput: true }))
    return
  }

  const result = inspectFullstackCloseout({ cwd })
  process.stdout.write(JSON.stringify(result.ok
    ? { suppressOutput: true }
    : { decision: 'block', reason: buildBlockReason(result.issues), suppressOutput: true }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
