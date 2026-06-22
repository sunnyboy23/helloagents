// fullstack-dispatch.mjs — Deterministic dispatch manifest and dispatch audit.
//
// Solves the "AI silently does not dispatch subagents" problem: a task group's
// dispatch obligations are made explicit (manifest), and actual execution is
// audited against runtime evidence (start events + engineer handoff files).
// A task that is marked "completed" without dispatch evidence is treated as a
// fabricated completion, not a real one.

import { existsSync, readFileSync } from 'node:fs'

// Engineer type → expected engineer subagent. Kept in sync with the mapping
// tables in functions/fullstack.md and agents/ha-orchestrator.md.
export const ENGINEER_SUBAGENT_MAP = {
  'backend-java': 'ha-backend-java',
  'backend-python': 'ha-backend-python',
  'backend-go': 'ha-backend-go',
  'backend-nodejs': 'ha-backend-nodejs',
  'frontend-react': 'ha-frontend-react',
  'frontend-vue': 'ha-frontend-vue',
  'mobile-ios': 'ha-mobile-ios',
  'mobile-android': 'ha-mobile-android',
  'mobile-harmony': 'ha-mobile-harmony',
}

export function expectedSubagentForEngineerType(engineerType) {
  return ENGINEER_SUBAGENT_MAP[String(engineerType || '').trim()] || null
}

function safeReadText(filePath) {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}

function eventTypesForTask(eventLogText, taskId) {
  if (!eventLogText || !taskId) return new Set()
  const types = new Set()
  eventLogText.split(/\r?\n/u).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let event
    try {
      event = JSON.parse(trimmed)
    } catch {
      return
    }
    if (event && event.task_id === taskId && event.event_type) {
      types.add(event.event_type)
    }
  })
  return types
}

// Build the explicit dispatch manifest from a task-group state object.
// Each entry declares exactly what must be dispatched and where its evidence
// will land, so the orchestrator cannot "forget" a task without it showing up.
export function buildDispatchManifest(state = {}) {
  const tasks = state.tasks || {}
  return Object.keys(tasks)
    .sort()
    .map((taskId) => {
      const task = tasks[taskId] || {}
      const localRuntime = task.local_runtime || {}
      return {
        task_id: taskId,
        project: task.project || '',
        engineer_id: task.engineer_id || 'unassigned',
        engineer_type: task.engineer_type || task.task_contract?.engineer_type || '',
        expected_subagent: expectedSubagentForEngineerType(
          task.engineer_type || task.task_contract?.engineer_type,
        ),
        depends_on: task.depends_on || [],
        handoff_path: localRuntime.handoff || '',
        events_path: localRuntime.events || '',
      }
    })
}

// Audit one task against runtime evidence.
// dispatched  = there is real proof an engineer ran (start event or handoff file).
// fabricated  = task claims completed/partial but has no dispatch evidence at all.
export function auditTask(task = {}, eventTypes = new Set()) {
  const localRuntime = task.local_runtime || {}
  const handoffPath = localRuntime.handoff || ''
  const handoffExists = Boolean(handoffPath) && existsSync(handoffPath)
  const hasStartEvent = eventTypes.has('task_started')
  const hasTerminalEvent = ['task_completed', 'task_partial', 'task_failed', 'task_blocked']
    .some((type) => eventTypes.has(type))
  const status = task.status || 'pending'

  const dispatched = hasStartEvent || handoffExists
  const claimsDone = ['completed', 'partial'].includes(status)
  const fabricated = claimsDone && !dispatched

  return {
    task_id: task.task_id,
    project: task.project || '',
    engineer_id: task.engineer_id || 'unassigned',
    status,
    dispatched,
    fabricated,
    evidence: {
      start_event: hasStartEvent,
      terminal_event: hasTerminalEvent,
      handoff_path: handoffPath,
      handoff_exists: handoffExists,
    },
  }
}

// Audit the whole task group: which obligations were actually dispatched,
// which are still missing, and which look fabricated.
export function auditDispatch(state = {}) {
  const eventLogText = safeReadText(state.global_runtime?.event_log || '')
  const tasks = state.tasks || {}
  const audited = Object.keys(tasks)
    .sort()
    .map((taskId) => auditTask(
      { ...tasks[taskId], task_id: taskId },
      eventTypesForTask(eventLogText, taskId),
    ))

  const dispatchable = audited.filter((item) => item.engineer_id && item.engineer_id !== 'unassigned')
  const notDispatched = audited.filter((item) => !item.dispatched
    && !['skipped', 'blocked'].includes(item.status))
  const fabricated = audited.filter((item) => item.fabricated)

  return {
    task_group_id: state.task_group_id || '',
    total: audited.length,
    dispatched_count: audited.filter((item) => item.dispatched).length,
    not_dispatched: notDispatched.map((item) => item.task_id),
    fabricated_completions: fabricated.map((item) => item.task_id),
    all_dispatched: notDispatched.length === 0,
    has_fabricated: fabricated.length > 0,
    tasks: audited,
    dispatchable_total: dispatchable.length,
  }
}
