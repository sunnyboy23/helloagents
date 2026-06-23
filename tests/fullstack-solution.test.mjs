import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SOLUTION_STATUS,
  aggregateSolutionStatus,
  applyReviewVerdict,
  isSolutionApprovedForStart,
  solutionBlockReason,
  statusAfterSubmit,
  validateSolutionContent,
} from '../scripts/fullstack-solution.mjs'

const COMPLETE_SOLUTION = `# 技术方案

## 影响面评估
- 受影响场景：下单接口、积分查询
- 不受影响场景：用户注册

## 系统交互拓扑关系评估
- 上游依赖：user-service
- 下游影响：order-service

## 并发与一致性保障
- 一致性场景：积分扣减与订单创建需在同一事务
- 解决方案：本地消息表

## 灰度设计
- 灰度方案：按用户 ID 尾号分批

## 回滚方案
- 回滚触发条件：积分计算错误率超阈值
- 回滚顺序：先关开关再回滚代码
`

const INCOMPLETE_SOLUTION = `# 技术方案

## 影响面评估
- 受影响场景：下单接口

## 系统交互拓扑关系评估
- 上游依赖：user-service
`

test('validateSolutionContent passes a complete solution', () => {
  const result = validateSolutionContent(COMPLETE_SOLUTION)
  assert.equal(result.valid, true)
  assert.equal(result.missing_sections.length, 0)
})

test('validateSolutionContent flags missing required sections', () => {
  const result = validateSolutionContent(INCOMPLETE_SOLUTION)
  assert.equal(result.valid, false)
  const missingKeys = result.missing_sections.map((s) => s.key)
  assert.ok(missingKeys.includes('rollback'))
  assert.ok(missingKeys.includes('grayscale'))
  assert.ok(missingKeys.includes('consistency'))
})

test('validateSolutionContent treats bare placeholder as unfilled', () => {
  const placeholder = `# 技术方案
## 影响面评估
- 待补充
## 系统交互拓扑关系评估
- 上游依赖：a
## 并发与一致性保障
- 一致性场景：x
## 灰度设计
- 灰度方案：y
## 回滚方案
- 回滚触发条件：z
`
  const result = validateSolutionContent(placeholder)
  assert.equal(result.valid, false)
  assert.ok(result.missing_sections.some((s) => s.key === 'impact'))
})

test('statusAfterSubmit routes complete drafts to review, incomplete back to drafted', () => {
  assert.equal(statusAfterSubmit({ valid: true }), SOLUTION_STATUS.UNDER_REVIEW)
  assert.equal(statusAfterSubmit({ valid: false }), SOLUTION_STATUS.DRAFTED)
})

test('applyReviewVerdict approves and rejects, rejects invalid verdict', () => {
  const approved = applyReviewVerdict('approved', { reviewer: 'r1' })
  assert.equal(approved.status, SOLUTION_STATUS.APPROVED)

  const rejected = applyReviewVerdict('rejected', { findings: ['漏了下游 bff 影响'], reviewer: 'r1' })
  assert.equal(rejected.status, SOLUTION_STATUS.REJECTED)
  assert.deepEqual(rejected.review.findings, ['漏了下游 bff 影响'])

  const bad = applyReviewVerdict('maybe')
  assert.ok(bad.error)
})

test('isSolutionApprovedForStart gates on approval, honors skip', () => {
  assert.equal(isSolutionApprovedForStart({ solution_required: false }), true)
  assert.equal(isSolutionApprovedForStart({ solution_status: SOLUTION_STATUS.APPROVED }), true)
  assert.equal(isSolutionApprovedForStart({ solution_status: SOLUTION_STATUS.PENDING }), false)
  assert.equal(isSolutionApprovedForStart({ solution_status: SOLUTION_STATUS.UNDER_REVIEW }), false)
})

test('solutionBlockReason explains each blocking state', () => {
  assert.match(solutionBlockReason({ solution_status: SOLUTION_STATUS.PENDING }), /尚未提交/)
  assert.match(solutionBlockReason({ solution_status: SOLUTION_STATUS.DRAFTED }), /必填章节/)
  assert.match(solutionBlockReason({ solution_status: SOLUTION_STATUS.UNDER_REVIEW }), /评审中/)
  assert.match(
    solutionBlockReason({ solution_status: SOLUTION_STATUS.REJECTED, solution_review: { findings: ['漏算下游'] } }),
    /漏算下游/,
  )
  assert.equal(solutionBlockReason({ solution_required: false }), null)
})

test('aggregateSolutionStatus summarizes group readiness', () => {
  const state = {
    task_group_id: 'tg',
    tasks: {
      T1: { project: './a', engineer_id: 'be', solution_required: true, solution_status: SOLUTION_STATUS.APPROVED, service_solution_path: 'a.md' },
      T2: { project: './b', engineer_id: 'fe', solution_required: true, solution_status: SOLUTION_STATUS.UNDER_REVIEW },
      T3: { project: './c', engineer_id: 'be', solution_required: false, solution_status: 'skipped' },
    },
  }
  const agg = aggregateSolutionStatus(state)
  assert.equal(agg.total_required, 2)
  assert.equal(agg.approved_count, 1)
  assert.deepEqual(agg.pending_review, ['T2'])
  assert.equal(agg.all_approved, false)

  state.tasks.T2.solution_status = SOLUTION_STATUS.APPROVED
  state.tasks.T2.service_solution_path = 'b.md'
  const agg2 = aggregateSolutionStatus(state)
  assert.equal(agg2.all_approved, true)
  assert.equal(agg2.ready_for_consistency_check, true)
  assert.equal(agg2.solution_paths.length, 2)
})
