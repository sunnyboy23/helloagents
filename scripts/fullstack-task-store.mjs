import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { ensureRuntimeDirs, getCurrentStateFile } from './fullstack-runtime-store.mjs'

export const DEFAULT_FULLSTACK_REQUIRED_ARTIFACTS = [
  {
    key: 'fullstack/docs/tasks.md',
    description: '全栈任务文档，记录任务拆解、负责人、完成标准和验证方式',
  },
  {
    key: 'fullstack/docs/agents.md',
    description: '子职能分工文档，记录 orchestrator / backend / frontend / qa 的责任边界',
  },
  {
    key: 'fullstack/docs/upstream.md',
    description: 'upstream 索引文档，记录跨项目依赖、阻塞项和同步状态',
  },
]

function nowIso() {
  return new Date().toISOString()
}

function readJsonFile(filePath, fallback = {}) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return fallback
  }
}

function writeJsonFile(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
}

function normalizeArtifactKey(value) {
  let text = String(value || '').trim().replace(/\\/gu, '/')
  if (text.startsWith('./')) text = text.slice(2)
  if (text.startsWith('.helloagents/')) text = text.slice('.helloagents/'.length)
  return text
}

function artifactMatches(requiredKey, recordedKey) {
  const normalizedRequired = normalizeArtifactKey(requiredKey)
  const normalizedRecorded = normalizeArtifactKey(recordedKey)
  return (
    normalizedRequired === normalizedRecorded
    || normalizedRecorded.endsWith(normalizedRequired)
    || normalizedRequired.endsWith(normalizedRecorded)
  )
}

function extractRecordedArtifactKeys(result = {}) {
  const keys = new Set()

  const collect = (candidate) => {
    if (typeof candidate === 'string') {
      const normalized = normalizeArtifactKey(candidate)
      if (normalized) keys.add(normalized)
      return
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => collect(item))
      return
    }
    if (candidate && typeof candidate === 'object') {
      ;['key', 'path', 'type', 'name'].forEach((field) => {
        if (candidate[field]) {
          const normalized = normalizeArtifactKey(candidate[field])
          if (normalized) keys.add(normalized)
        }
      })
    }
  }

  collect(result.artifacts)
  collect(result.tech_docs)
  collect(result.kb_updates)
  if (result.deliverables && typeof result.deliverables === 'object') {
    collect(result.deliverables.artifacts)
    collect(result.deliverables.docs)
  }

  return [...keys].sort()
}

function computeExecutionLayers(tasks) {
  const taskIds = Object.keys(tasks)
  const inDegree = Object.fromEntries(taskIds.map((taskId) => [taskId, 0]))

  taskIds.forEach((taskId) => {
    ;(tasks[taskId].depends_on || []).forEach((dependency) => {
      if (dependency in inDegree) inDegree[taskId] += 1
    })
  })

  const layers = []
  const remaining = new Set(taskIds)
  let layerNumber = 1

  while (remaining.size) {
    const layerTasks = [...remaining].filter((taskId) => inDegree[taskId] === 0)
    if (!layerTasks.length) {
      layers.push({
        layer: layerNumber,
        task_ids: [...remaining],
        status: 'pending',
        note: 'circular_dependency_detected',
      })
      break
    }

    layers.push({
      layer: layerNumber,
      task_ids: layerTasks,
      status: 'pending',
    })

    layerTasks.forEach((taskId) => remaining.delete(taskId))
    ;[...remaining].forEach((taskId) => {
      ;(tasks[taskId].depends_on || []).forEach((dependency) => {
        if (layerTasks.includes(dependency)) inDegree[taskId] -= 1
      })
    })
    layerNumber += 1
  }

  return layers
}

function deriveVerificationStatus(task, result, status) {
  if (status === 'failed') return 'needs_attention'
  if (status !== 'completed') return 'pending'

  if (result.verification && typeof result.verification === 'object') {
    if (result.verification.passed === true) return 'passed'
    if (result.verification.passed === false) return 'needs_attention'
  }
  if (result.verified === true) return 'passed'
  if (result.verified === false) return 'needs_attention'
  return 'pending'
}

function findMissingRequiredArtifacts(task, result) {
  const required = task.task_contract?.required_artifacts
  if (!Array.isArray(required) || !required.length) return []
  const recorded = extractRecordedArtifactKeys(result)
  return required
    .map((item) => normalizeArtifactKey(typeof item === 'object' ? item.key : item))
    .filter(Boolean)
    .filter((requiredKey) => !recorded.some((recordedKey) => artifactMatches(requiredKey, recordedKey)))
}

function deriveCloseoutStatus(task, result, status) {
  if (status === 'failed') return 'needs_attention'
  if (status !== 'completed') return 'pending'
  if (findMissingRequiredArtifacts(task, result).length) return 'needs_attention'

  if (result.deliverables && typeof result.deliverables === 'object') {
    if (result.deliverables.synced === true || result.deliverables.ready === true) return 'ready'
    if (result.deliverables.synced === false || result.deliverables.ready === false) return 'needs_attention'
  }

  if (result.tech_docs || result.kb_updates) return 'ready'
  return 'pending'
}

export function resolveStateFileArg(stateFileArg, { projectRoot = process.cwd(), kbRoot = join(process.cwd(), '.helloagents') } = {}) {
  if (stateFileArg !== '@auto') return resolve(stateFileArg)
  ensureRuntimeDirs({ projectRoot, kbRoot })
  return getCurrentStateFile({ projectRoot, kbRoot })
}

export class TaskStore {
  constructor(stateFile, options = {}) {
    this.stateFile = resolve(stateFile)
    this.projectRoot = resolve(options.projectRoot || process.env.HELLOAGENTS_PROJECT_ROOT || process.cwd())
    this.kbRoot = resolve(options.kbRoot || process.env.HELLOAGENTS_KB_ROOT || join(this.projectRoot, '.helloagents'))
    this.state = existsSync(this.stateFile) ? readJsonFile(this.stateFile, {}) : {}
  }

  getProjectRoot() {
    return this.projectRoot
  }

  getKbRoot() {
    return this.kbRoot
  }

  artifactAbsolutePath(artifactKey) {
    return join(this.getKbRoot(), normalizeArtifactKey(artifactKey))
  }

  defaultArtifactContent(artifactKey) {
    const normalized = normalizeArtifactKey(artifactKey)
    if (normalized === 'fullstack/docs/tasks.md') {
      return (
        '# 全栈任务文档\n\n'
        + '## 任务组信息\n'
        + '- 任务组 ID：\n- 需求摘要：\n- 当前阶段：\n- 当前运行态：`fullstack/tasks/current.json`\n\n'
        + '## 任务清单\n'
        + '| 任务 ID | 类型 | Owner Service | 工程师 | 项目 | 描述 | 依赖 | 必需产物 | 验证方式 | 当前状态 |\n'
        + '|--------|------|---------------|--------|------|------|------|----------|----------|----------|\n'
      )
    }
    if (normalized === 'fullstack/docs/agents.md') {
      return (
        '# 全栈子职能分工\n\n'
        + '## 角色边界\n'
        + '| 角色 | 负责人 | 负责项目/模块 | 主要输出 | 当前状态 |\n'
        + '|------|--------|---------------|----------|----------|\n'
        + '| orchestrator |  |  | 任务编排、状态汇总、阻塞升级 | planned |\n\n'
        + '## 服务归属判断\n'
        + '| 需求能力 | 推荐承载服务 | 不应承载服务 | 判断原因 | 结论 |\n'
        + '|----------|--------------|--------------|----------|------|\n'
      )
    }
    if (normalized === 'fullstack/docs/upstream.md') {
      return (
        '# Fullstack Upstream 索引\n\n'
        + '## 依赖总览\n'
        + '| 上游对象 | 契约文件 | 当前状态 | 提供内容 | 下游消费者 | 是否已同步 | 阻塞项 |\n'
        + '|---------|----------|----------|----------|------------|------------|--------|\n'
      )
    }
    if (normalized.endsWith('_technical_solution.md')) {
      return '# 技术方案\n\n## 需求背景与目标\n- 待补充\n\n## 服务归属判断\n- owner service:\n- ownership reason:\n'
    }
    return ''
  }

  scaffoldRequiredArtifacts(artifacts) {
    const created = []
    const existing = []
    const missing = []

    artifacts.forEach((item) => {
      const key = normalizeArtifactKey(typeof item === 'object' ? item.key : item)
      if (!key) return
      const filePath = this.artifactAbsolutePath(key)
      if (existsSync(filePath)) {
        existing.push(key)
        return
      }
      mkdirSync(dirname(filePath), { recursive: true })
      const content = this.defaultArtifactContent(key)
      if (!content) {
        missing.push(key)
        return
      }
      writeFileSync(filePath, content, 'utf-8')
      created.push(key)
    })

    return { created, existing, missing }
  }

  iterRequiredArtifacts() {
    const items = this.state.required_artifacts || DEFAULT_FULLSTACK_REQUIRED_ARTIFACTS
    return items
      .map((item) => {
        if (item && typeof item === 'object') {
          const key = normalizeArtifactKey(item.key || item.path || item.type)
          return key ? { key, description: String(item.description || key) } : null
        }
        const key = normalizeArtifactKey(item)
        return key ? { key, description: key } : null
      })
      .filter(Boolean)
  }

  buildArtifactStatus() {
    const required = this.iterRequiredArtifacts()
    const recorded = new Set()

    Object.values(this.state.tasks || {}).forEach((task) => {
      const result = task?.result
      if (result && typeof result === 'object') {
        extractRecordedArtifactKeys(result).forEach((key) => recorded.add(key))
      }
    })

    const present = []
    const missing = []
    const artifactState = required.map((item) => {
      const absolutePath = this.artifactAbsolutePath(item.key)
      const exists = existsSync(absolutePath)
      const recordedMatch = [...recorded].some((key) => artifactMatches(item.key, key))
      const state = exists && recordedMatch ? 'verified' : (exists ? 'scaffolded' : 'missing')
      if (exists) present.push(item)
      else missing.push(item)
      return { key: item.key, path: absolutePath, state }
    })

    return {
      required,
      present,
      missing,
      recorded_keys: [...recorded].sort(),
      artifact_state: artifactState,
    }
  }

  getCurrentLayerInfo() {
    for (const layer of this.state.execution_layers || []) {
      if (['pending', 'in_progress'].includes(layer.status)) {
        return { layer: layer.layer, status: layer.status, tasks: (layer.task_ids || []).length }
      }
    }
    return null
  }

  buildRuntimeSummary() {
    const completedProjects = []
    const pendingProjects = []
    const blockedTasks = []

    Object.entries(this.state.tasks || {}).forEach(([taskId, task]) => {
      const item = { task_id: taskId, project: task.project, description: task.description }
      if (task.status === 'completed') completedProjects.push(item)
      else if (task.status === 'blocked') blockedTasks.push(item)
      else if (['pending', 'in_progress', 'partial', 'failed'].includes(task.status)) pendingProjects.push(item)
    })

    const currentLayer = this.getCurrentLayerInfo()
    let nextStep = '等待当前层完成后继续派发下游任务'
    if (!currentLayer && this.state.status === 'completed') {
      nextStep = '进入技术文档同步与任务组收尾'
    } else if (['failed', 'partial', 'blocked'].includes(this.state.status)) {
      nextStep = '优先处理失败/阻塞任务，再决定是否继续后续层级'
    }

    const artifactStatus = this.state.artifact_status || {}
    const missingArtifacts = artifactStatus.missing || []
    if (missingArtifacts.length && this.state.status === 'completed') {
      nextStep = '先补齐 fullstack 必需产物，再进入统一收尾'
    }

    return {
      requirement: this.state.requirement || '',
      overall_status: this.state.status,
      current_layer: currentLayer,
      completed_projects: completedProjects,
      pending_projects: pendingProjects,
      blocked_tasks: blockedTasks,
      missing_artifacts: missingArtifacts,
      next_step: nextStep,
    }
  }

  saveState() {
    this.state.updated_at = nowIso()
    this.state.artifact_status = this.buildArtifactStatus()
    this.state.summary = this.buildRuntimeSummary()
    writeJsonFile(this.stateFile, this.state)
  }

  createTaskGroup(taskGroupId, requirement, tasks, requiredArtifacts = null) {
    const tasksDict = {}
    tasks.forEach((task) => {
      if (!task?.task_id) return
      tasksDict[task.task_id] = {
        ...task,
        status: 'pending',
        retry_count: 0,
        verification_status: 'pending',
        closeout_status: 'pending',
        task_contract: task.task_contract || {},
      }
    })

    const artifacts = requiredArtifacts || DEFAULT_FULLSTACK_REQUIRED_ARTIFACTS
    const scaffold = this.scaffoldRequiredArtifacts(artifacts)
    this.state = {
      task_group_id: taskGroupId,
      requirement,
      created_at: nowIso(),
      updated_at: nowIso(),
      status: 'pending',
      progress: {
        total: tasks.length,
        completed: 0,
        failed: 0,
        in_progress: 0,
        pending: tasks.length,
        blocked: 0,
      },
      verification: {
        pending: tasks.length,
        passed: 0,
        needs_attention: 0,
      },
      closeout: {
        pending: tasks.length,
        ready: 0,
        needs_attention: 0,
      },
      execution_layers: computeExecutionLayers(tasksDict),
      tasks: tasksDict,
      tech_docs_synced: [],
      required_artifacts: artifacts,
      artifact_scaffold: scaffold,
      summary: {},
    }
    this.saveState()
    return {
      success: true,
      task_group_id: taskGroupId,
      total_tasks: tasks.length,
      layers: this.state.execution_layers.length,
      artifact_scaffold: scaffold,
    }
  }

  getNextLayer() {
    return (this.state.execution_layers || []).find((layer) => layer.status === 'pending') || null
  }

  getLayerTasks(layerNumber) {
    const layer = (this.state.execution_layers || []).find((item) => item.layer === layerNumber)
    if (!layer) return []
    return (layer.task_ids || []).map((taskId) => this.state.tasks?.[taskId]).filter(Boolean)
  }

  updateProgress() {
    const progress = { total: 0, completed: 0, failed: 0, in_progress: 0, pending: 0, blocked: 0 }
    const verification = { pending: 0, passed: 0, needs_attention: 0 }
    const closeout = { pending: 0, ready: 0, needs_attention: 0 }
    const tasks = Object.values(this.state.tasks || {})
    progress.total = tasks.length

    tasks.forEach((task) => {
      if (task.status === 'completed') progress.completed += 1
      else if (task.status === 'failed') progress.failed += 1
      else if (task.status === 'in_progress') progress.in_progress += 1
      else if (task.status === 'blocked') progress.blocked += 1
      else progress.pending += 1

      if (task.verification_status === 'passed') verification.passed += 1
      else if (task.verification_status === 'needs_attention') verification.needs_attention += 1
      else verification.pending += 1

      if (task.closeout_status === 'ready') closeout.ready += 1
      else if (task.closeout_status === 'needs_attention') closeout.needs_attention += 1
      else closeout.pending += 1
    })

    this.state.progress = progress
    this.state.verification = verification
    this.state.closeout = closeout

    if (progress.completed === progress.total) this.state.status = 'completed'
    else if (progress.failed > 0 && progress.in_progress === 0 && progress.pending === 0 && progress.blocked === 0) {
      this.state.status = progress.completed > 0 ? 'partial' : 'failed'
    } else if (progress.in_progress > 0) {
      this.state.status = 'in_progress'
    } else if (progress.blocked > 0 && progress.pending === 0) {
      this.state.status = 'blocked'
    }
  }

  updateLayerStatus(taskId) {
    for (const layer of this.state.execution_layers || []) {
      if (!(layer.task_ids || []).includes(taskId)) continue
      let allCompleted = true
      let anyFailed = false
      let anyInProgress = false

      ;(layer.task_ids || []).forEach((id) => {
        const status = this.state.tasks?.[id]?.status || 'pending'
        if (status === 'in_progress') {
          anyInProgress = true
          allCompleted = false
        } else if (status === 'failed') {
          anyFailed = true
          allCompleted = false
        } else if (!['completed', 'skipped'].includes(status)) {
          allCompleted = false
        }
      })

      if (allCompleted) layer.status = 'completed'
      else if (anyFailed && !anyInProgress) layer.status = 'partial'
      else if (anyInProgress) layer.status = 'in_progress'
      break
    }
  }

  isTaskReady(taskId) {
    const task = this.state.tasks?.[taskId]
    if (!task) return false
    return (task.depends_on || []).every((dependency) => ['completed', 'skipped'].includes(this.state.tasks?.[dependency]?.status))
  }

  markDownstreamBlocked(failedTaskId) {
    const queue = [failedTaskId]
    const visited = new Set()

    while (queue.length) {
      const current = queue.shift()
      if (visited.has(current)) continue
      visited.add(current)
      Object.entries(this.state.tasks || {}).forEach(([taskId, task]) => {
        if (!(task.depends_on || []).includes(current)) return
        if (['pending', 'in_progress'].includes(task.status)) task.status = 'blocked'
        queue.push(taskId)
      })
    }
  }

  startTask(taskId) {
    const task = this.state.tasks?.[taskId]
    if (!task) return false

    for (const dependency of task.depends_on || []) {
      const depTask = this.state.tasks?.[dependency]
      if (depTask && !['completed', 'skipped'].includes(depTask.status)) {
        task.status = 'blocked'
        this.saveState()
        return false
      }
    }

    task.status = 'in_progress'
    task.started_at = nowIso()
    this.updateProgress()
    this.saveState()
    return true
  }

  completeTask(taskId, result, status = 'completed') {
    const task = this.state.tasks?.[taskId]
    if (!task) return false

    task.status = status
    task.completed_at = nowIso()
    task.result = result
    task.verification_status = deriveVerificationStatus(task, result, status)
    task.closeout_status = deriveCloseoutStatus(task, result, status)

    if (status === 'failed') {
      task.error = result.error || 'Unknown error'
      this.markDownstreamBlocked(taskId)
    }

    this.updateLayerStatus(taskId)
    this.updateProgress()
    this.saveState()
    return true
  }

  failTask(taskId, error) {
    return this.completeTask(taskId, { error }, 'failed')
  }

  retryTask(taskId) {
    const task = this.state.tasks?.[taskId]
    if (!task) return false
    if ((task.retry_count || 0) >= 3) return false

    task.status = 'pending'
    task.retry_count = (task.retry_count || 0) + 1
    delete task.error
    delete task.completed_at
    this.updateProgress()
    this.saveState()
    return true
  }

  getTriggeredTasks(completedTaskId) {
    return Object.entries(this.state.tasks || {})
      .filter(([, task]) => task.status === 'pending' && (task.depends_on || []).includes(completedTaskId))
      .filter(([taskId]) => this.isTaskReady(taskId))
      .map(([taskId, task]) => ({
        task_id: taskId,
        engineer_id: task.engineer_id,
        project: task.project,
        description: task.description,
      }))
  }

  processFeedback(taskId, status, result) {
    if (!['completed', 'partial', 'failed'].includes(status)) {
      return { success: false, error: `Invalid status: ${status}` }
    }
    if (!this.state.tasks?.[taskId]) {
      return { success: false, error: `Task not found: ${taskId}` }
    }

    const success = this.completeTask(taskId, result, status)
    if (!success) return { success: false, error: 'Failed to update task state' }

    const triggeredTasks = status === 'completed' ? this.getTriggeredTasks(taskId) : []
    const summary = this.getStatusSummary()
    return {
      success: true,
      task_id: taskId,
      status,
      triggered_tasks: triggeredTasks,
      progress: summary.progress || {},
      overall_status: summary.status,
      current_layer: summary.current_layer,
    }
  }

  recordTechDocSync(source, targets) {
    if (!Array.isArray(this.state.tech_docs_synced)) this.state.tech_docs_synced = []
    this.state.tech_docs_synced.push({ source, targets, synced_at: nowIso() })
    this.saveState()
  }

  getStatusSummary() {
    return {
      task_group_id: this.state.task_group_id,
      status: this.state.status,
      progress: this.state.progress,
      verification: this.state.verification || {},
      closeout: this.state.closeout || {},
      artifact_status: this.state.artifact_status || {},
      current_layer: this.getCurrentLayerInfo(),
      tech_docs_synced: (this.state.tech_docs_synced || []).length,
      summary: this.state.summary || {},
    }
  }

  getProgressReport() {
    const byStatus = {
      pending: [],
      in_progress: [],
      completed: [],
      partial: [],
      failed: [],
      blocked: [],
      skipped: [],
    }

    Object.entries(this.state.tasks || {}).forEach(([taskId, task]) => {
      const status = task.status || 'pending'
      if (!byStatus[status]) byStatus[status] = []
      byStatus[status].push({
        task_id: taskId,
        engineer_id: task.engineer_id,
        project: task.project,
        description: task.description,
      })
    })

    return {
      task_group_id: this.state.task_group_id,
      overall_status: this.state.status,
      progress: this.state.progress || {},
      verification: this.state.verification || {},
      closeout: this.state.closeout || {},
      artifact_status: this.state.artifact_status || {},
      current_layer: this.getCurrentLayerInfo(),
      tasks_by_status: byStatus,
      summary: this.state.summary || {},
    }
  }
}

export function loadTaskPayload(filePath) {
  return readJsonFile(filePath, {})
}
