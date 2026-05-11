import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  const previousHome = process.env.HELLOAGENTS_HOME
  try {
    process.env.HELLOAGENTS_HOME = join(dir, 'home', '.helloagents')
    mkdirSync(process.env.HELLOAGENTS_HOME, { recursive: true })
    writeFileSync(join(process.env.HELLOAGENTS_HOME, 'helloagents.json'), JSON.stringify({}), {
      encoding: 'utf-8',
      flag: 'w',
    })
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
    assert.equal(existsSync(join(projectRoot, 'order-service', '.helloagents', 'fullstack', 'inbox', '20260421-order-risk.be-java-main.task.json')), true)
    assert.equal(existsSync(join(projectRoot, 'report-service', '.helloagents', 'fullstack', 'state', '20260421-order-risk.json')), true)
    assert.equal(existsSync(join(kbRoot, 'fullstack', 'tasks', 'events.ndjson')), true)
    assert.equal(store.getStatusSummary().progress.total, 2)
    assert.ok(store.state.tasks.T1.local_runtime.state.endsWith('.helloagents/fullstack/state/20260421-order-risk.json'))
  } finally {
    if (previousHome === undefined) delete process.env.HELLOAGENTS_HOME
    else process.env.HELLOAGENTS_HOME = previousHome
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

    const eventsPath = join(projectRoot, 'order-service', '.helloagents', 'fullstack', 'events', '20260421-order-risk.ndjson')
    const events = readFileSync(eventsPath, 'utf-8')
    assert.match(events, /"event_type":"task_started"/)
    assert.match(events, /"event_type":"task_completed"/)
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
    assert.equal(existsSync(join(projectRoot, 'order-service', '.helloagents', 'fullstack', 'errors', '20260421-order-risk.ndjson')), true)
    assert.equal(existsSync(join(projectRoot, 'report-service', '.helloagents', 'fullstack', 'errors', '20260421-order-risk.ndjson')), true)

    assert.equal(store.retryTask('T1'), true)
    assert.equal(store.state.tasks.T1.status, 'pending')
    assert.equal(store.state.tasks.T1.retry_count, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
