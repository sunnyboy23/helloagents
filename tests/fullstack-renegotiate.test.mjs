import test from 'node:test'
import assert from 'node:assert/strict'

import {
  renegotiateContract,
  renegotiateReadyDownstream,
} from '../scripts/fullstack-renegotiate.mjs'

test('renegotiateContract injects real upstream api contracts', () => {
  const downstream = {
    task_contract: {
      verify_mode: 'cross_project',
      risk_level: 'medium',
      upstream_projects: ['./backend/user-service'],
      upstream_contracts: [],
      tester_focus: ['关键路径可验证'],
      reviewer_focus: ['依赖影响是否完整'],
    },
  }
  const upstream = [{
    project: './backend/user-service',
    status: 'completed',
    result: {
      tech_docs: [{ type: 'api_contract', path: '.helloagents/api/user_points.md' }],
    },
  }]

  const out = renegotiateContract(downstream, upstream)
  assert.equal(out.changed, true)
  assert.ok(out.task_contract.upstream_contracts.includes('.helloagents/api/user_points.md'))
  // API change → verification upgraded and integration focus added.
  assert.equal(out.task_contract.risk_level, 'high')
  assert.ok(out.task_contract.tester_focus.some((f) => f.includes('联调')))
})

test('renegotiateContract is a no-op when upstream produced nothing relevant', () => {
  const downstream = {
    task_contract: {
      verify_mode: 'standard',
      risk_level: 'medium',
      upstream_projects: ['./backend/x'],
      upstream_contracts: [],
    },
  }
  const upstream = [{ project: './backend/x', status: 'completed', result: { changes: [] } }]
  const out = renegotiateContract(downstream, upstream)
  assert.equal(out.changed, false)
})

test('renegotiateReadyDownstream only fires when all deps complete', () => {
  const state = {
    tasks: {
      T1: { project: './be', status: 'completed', result: { tech_docs: [{ type: 'api_contract', path: 'api/a.md' }] } },
      T2: { project: './be2', status: 'in_progress' },
      T3: {
        project: './fe',
        status: 'pending',
        depends_on: ['T1', 'T2'],
        task_contract: { verify_mode: 'cross_project', upstream_contracts: [] },
      },
    },
  }
  // T3 depends on T1 (done) and T2 (in progress) → not ready yet.
  let result = renegotiateReadyDownstream(state)
  assert.equal(result.count, 0)

  // Complete T2 → T3 becomes eligible.
  state.tasks.T2.status = 'completed'
  state.tasks.T2.result = { changes: [{ description: '修改接口契约' }] }
  result = renegotiateReadyDownstream(state)
  assert.equal(result.count, 1)
  assert.equal(result.updates[0].task_id, 'T3')
})
