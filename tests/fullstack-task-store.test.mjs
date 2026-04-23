import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { TaskStore } from '../scripts/fullstack-task-store.mjs'

function buildTasksPayload(projectRoot) {
  return {
    task_group_id: '20260421-order-risk',
    requirement: '补充订单规则与报表同步',
    tasks: [
      {
        task_id: 'T1',
        engineer_id: 'be-java-main',
        project: join(projectRoot, 'order-service'),
        description: '实现订单规则写入',
        depends_on: [],
        task_contract: {
          required_artifacts: ['fullstack/docs/tasks.md'],
        },
      },
      {
        task_id: 'T2',
        engineer_id: 'be-nodejs-main',
        project: join(projectRoot, 'report-service'),
        description: '同步报表侧接口',
        depends_on: ['T1'],
        task_contract: {
          required_artifacts: ['fullstack/docs/upstream.md'],
        },
      },
    ],
  }
}

test('TaskStore createTaskGroup scaffolds docs and writes current state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-fullstack-task-'))
  try {
    const projectRoot = join(dir, 'project')
    const kbRoot = join(projectRoot, '.helloagents')
    const stateFile = join(kbRoot, 'fullstack', 'tasks', 'current.json')
    const store = new TaskStore(stateFile, { projectRoot, kbRoot })
    const payload = buildTasksPayload(projectRoot)

    const result = store.createTaskGroup(
      payload.task_group_id,
      payload.requirement,
      payload.tasks,
      payload.required_artifacts,
    )

    assert.equal(result.success, true)
    assert.equal(existsSync(stateFile), true)
    assert.equal(existsSync(join(kbRoot, 'fullstack', 'docs', 'tasks.md')), true)
    assert.equal(existsSync(join(kbRoot, 'fullstack', 'docs', 'agents.md')), true)
    assert.equal(existsSync(join(kbRoot, 'fullstack', 'docs', 'upstream.md')), true)
    assert.equal(store.getStatusSummary().progress.total, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('TaskStore startTask and processFeedback advance DAG and summary', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-fullstack-task-'))
  try {
    const projectRoot = join(dir, 'project')
    const kbRoot = join(projectRoot, '.helloagents')
    const stateFile = join(kbRoot, 'fullstack', 'tasks', 'current.json')
    const store = new TaskStore(stateFile, { projectRoot, kbRoot })
    const payload = buildTasksPayload(projectRoot)

    store.createTaskGroup(payload.task_group_id, payload.requirement, payload.tasks)
    assert.equal(store.startTask('T1'), true)

    const taskResultFile = join(dir, 't1-result.json')
    writeFileSync(taskResultFile, JSON.stringify({
      verification: { passed: true },
      deliverables: { ready: true },
      artifacts: ['fullstack/docs/tasks.md'],
    }), 'utf-8')

    const feedback = store.processFeedback('T1', 'completed', {
      verification: { passed: true },
      deliverables: { ready: true },
      artifacts: ['fullstack/docs/tasks.md'],
    })

    assert.equal(feedback.success, true)
    assert.equal(feedback.triggered_tasks.length, 1)
    assert.equal(feedback.triggered_tasks[0].task_id, 'T2')
    assert.equal(store.getStatusSummary().verification.passed, 1)
    assert.equal(store.getStatusSummary().closeout.ready, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('TaskStore failTask blocks downstream and retryTask resets failed task', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-fullstack-task-'))
  try {
    const projectRoot = join(dir, 'project')
    const kbRoot = join(projectRoot, '.helloagents')
    const stateFile = join(kbRoot, 'fullstack', 'tasks', 'current.json')
    const store = new TaskStore(stateFile, { projectRoot, kbRoot })
    const payload = buildTasksPayload(projectRoot)

    store.createTaskGroup(payload.task_group_id, payload.requirement, payload.tasks)
    store.startTask('T1')
    assert.equal(store.failTask('T1', 'boom'), true)
    assert.equal(store.state.tasks.T1.status, 'failed')
    assert.equal(store.state.tasks.T2.status, 'blocked')

    assert.equal(store.retryTask('T1'), true)
    assert.equal(store.state.tasks.T1.status, 'pending')
    assert.equal(store.state.tasks.T1.retry_count, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
