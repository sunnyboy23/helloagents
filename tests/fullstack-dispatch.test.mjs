import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  auditDispatch,
  auditTask,
  buildDispatchManifest,
  expectedSubagentForEngineerType,
} from '../scripts/fullstack-dispatch.mjs'

test('expectedSubagentForEngineerType maps known types and rejects unknown', () => {
  assert.equal(expectedSubagentForEngineerType('backend-java'), 'ha-backend-java')
  assert.equal(expectedSubagentForEngineerType('frontend-vue'), 'ha-frontend-vue')
  assert.equal(expectedSubagentForEngineerType('unknown-type'), null)
})

test('buildDispatchManifest lists every task with its expected subagent', () => {
  const state = {
    task_group_id: 'tg',
    tasks: {
      T1: { engineer_id: 'be', engineer_type: 'backend-java', project: './a', local_runtime: { handoff: 'h1', events: 'e1' } },
      T2: { engineer_id: 'fe', engineer_type: 'frontend-react', project: './b', depends_on: ['T1'] },
    },
  }
  const manifest = buildDispatchManifest(state)
  assert.equal(manifest.length, 2)
  assert.equal(manifest[0].task_id, 'T1')
  assert.equal(manifest[0].expected_subagent, 'ha-backend-java')
  assert.equal(manifest[0].handoff_path, 'h1')
  assert.equal(manifest[1].expected_subagent, 'ha-frontend-react')
  assert.deepEqual(manifest[1].depends_on, ['T1'])
})

test('auditTask flags fabricated completion without dispatch evidence', () => {
  const audit = auditTask(
    { task_id: 'T1', status: 'completed', engineer_id: 'be', local_runtime: { handoff: '/nope' } },
    new Set(),
  )
  assert.equal(audit.dispatched, false)
  assert.equal(audit.fabricated, true)
})

test('auditTask accepts a task with a real start event', () => {
  const audit = auditTask(
    { task_id: 'T1', status: 'completed', engineer_id: 'be', local_runtime: { handoff: '/nope' } },
    new Set(['task_started', 'task_completed']),
  )
  assert.equal(audit.dispatched, true)
  assert.equal(audit.fabricated, false)
})

test('auditTask accepts a task with a real handoff file even without start event', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-dispatch-'))
  try {
    const handoff = join(dir, 'handoff.json')
    writeFileSync(handoff, '{}', 'utf-8')
    const audit = auditTask(
      { task_id: 'T1', status: 'partial', engineer_id: 'be', local_runtime: { handoff } },
      new Set(),
    )
    assert.equal(audit.dispatched, true)
    assert.equal(audit.fabricated, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('auditDispatch reads the global event log and reports fabricated completions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-dispatch-'))
  try {
    const eventLog = join(dir, 'events.ndjson')
    // T1 has a real start event; T2 is marked completed with no evidence.
    writeFileSync(eventLog, [
      JSON.stringify({ event_type: 'task_started', task_id: 'T1' }),
      JSON.stringify({ event_type: 'task_completed', task_id: 'T1' }),
    ].join('\n') + '\n', 'utf-8')

    const state = {
      task_group_id: 'tg',
      global_runtime: { event_log: eventLog },
      tasks: {
        T1: { engineer_id: 'be', engineer_type: 'backend-java', project: './a', status: 'completed', local_runtime: { handoff: '/nope' } },
        T2: { engineer_id: 'fe', engineer_type: 'frontend-react', project: './b', status: 'completed', local_runtime: { handoff: '/nope' } },
      },
    }
    const audit = auditDispatch(state)
    assert.deepEqual(audit.fabricated_completions, ['T2'])
    assert.equal(audit.has_fabricated, true)
    assert.equal(audit.all_dispatched, false)
    assert.deepEqual(audit.not_dispatched, ['T2'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('auditDispatch ignores blocked/skipped tasks for not_dispatched', () => {
  const state = {
    task_group_id: 'tg',
    global_runtime: { event_log: '/missing' },
    tasks: {
      T1: { engineer_id: 'be', engineer_type: 'backend-java', project: './a', status: 'blocked', local_runtime: {} },
      T2: { engineer_id: 'fe', engineer_type: 'frontend-react', project: './b', status: 'skipped', local_runtime: {} },
    },
  }
  const audit = auditDispatch(state)
  assert.deepEqual(audit.not_dispatched, [])
  assert.equal(audit.has_fabricated, false)
})
