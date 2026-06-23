import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { TaskStore } from '../scripts/fullstack-task-store.mjs'
import { SOLUTION_STATUS } from '../scripts/fullstack-solution.mjs'
import {
  extractDocRef,
  publishDocument,
  readStoredDocToken,
  recordPublishLink,
  resolvePublishConfig,
} from '../scripts/fullstack-publish.mjs'

const COMPLETE_SOLUTION = `# 技术方案
## 影响面评估
- 受影响场景：下单接口
## 系统交互拓扑关系评估
- 上游依赖：user-service
## 并发与一致性保障
- 一致性场景：积分扣减与订单创建
## 灰度设计
- 灰度方案：按用户尾号
## 回滚方案
- 回滚触发条件：错误率超阈值
`

function newStore(dir) {
  const stateFile = join(dir, 'current.json')
  return new TaskStore(stateFile, { projectRoot: dir, kbRoot: join(dir, '.helloagents') })
}

test('startTask is blocked until solution is approved, then allowed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-sol-'))
  try {
    const store = newStore(dir)
    store.createTaskGroup('tg', '积分需求', [
      { task_id: 'T1', engineer_id: 'be', engineer_type: 'backend-java', project: join(dir, 'svc'), description: '积分接口', depends_on: [] },
    ])

    // 1. No solution yet → start blocked.
    const blocked = store.startTask('T1')
    assert.equal(blocked.success, false)
    assert.match(blocked.reason, /方案/)
    assert.equal(store.state.tasks.T1.status, 'pending')

    // 2. Submit a complete solution → under_review.
    const solPath = join(dir, 'sol.md')
    writeFileSync(solPath, COMPLETE_SOLUTION, 'utf-8')
    const submit = store.submitSolution('T1', solPath, COMPLETE_SOLUTION)
    assert.equal(submit.solution_status, SOLUTION_STATUS.UNDER_REVIEW)

    // 3. Still blocked while under review.
    assert.equal(store.startTask('T1').success, false)

    // 4. Reviewer approves → start allowed.
    const review = store.reviewSolution('T1', 'approved', { reviewer: 'rev-1' })
    assert.equal(review.solution_status, SOLUTION_STATUS.APPROVED)
    assert.equal(store.startTask('T1'), true)
    assert.equal(store.state.tasks.T1.status, 'in_progress')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('incomplete solution stays drafted and keeps task blocked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-sol-'))
  try {
    const store = newStore(dir)
    store.createTaskGroup('tg', 'x', [
      { task_id: 'T1', engineer_id: 'be', project: join(dir, 'svc'), description: 'x', depends_on: [] },
    ])
    const solPath = join(dir, 'sol.md')
    const incomplete = '# 技术方案\n## 影响面评估\n- 受影响场景：a\n'
    writeFileSync(solPath, incomplete, 'utf-8')
    const submit = store.submitSolution('T1', solPath, incomplete)
    assert.equal(submit.solution_status, SOLUTION_STATUS.DRAFTED)
    assert.ok(submit.missing_sections.length > 0)
    // Cannot review a draft that never reached under_review.
    const review = store.reviewSolution('T1', 'approved')
    assert.equal(review.success, false)
    assert.equal(store.startTask('T1').success, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('rejected solution blocks start with reviewer findings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-sol-'))
  try {
    const store = newStore(dir)
    store.createTaskGroup('tg', 'x', [
      { task_id: 'T1', engineer_id: 'be', project: join(dir, 'svc'), description: 'x', depends_on: [] },
    ])
    const solPath = join(dir, 'sol.md')
    writeFileSync(solPath, COMPLETE_SOLUTION, 'utf-8')
    store.submitSolution('T1', solPath, COMPLETE_SOLUTION)
    store.reviewSolution('T1', 'rejected', { findings: ['漏了 bff 下游影响'], reviewer: 'rev-1' })
    const blocked = store.startTask('T1')
    assert.equal(blocked.success, false)
    assert.match(blocked.reason, /bff 下游影响/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('skip_solution task starts without a solution', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-sol-'))
  try {
    const store = newStore(dir)
    store.createTaskGroup('tg', '纯文案改动', [
      { task_id: 'T1', engineer_id: 'be', project: join(dir, 'svc'), description: '改文案', depends_on: [], skip_solution: true },
    ])
    assert.equal(store.state.tasks.T1.solution_required, false)
    assert.equal(store.startTask('T1'), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('publishDocument is a no-op when target is none', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-sol-'))
  try {
    const docPath = join(dir, 'doc.md')
    writeFileSync(docPath, '# doc\n', 'utf-8')
    const result = await publishDocument(docPath, { target: 'none' })
    assert.equal(result.success, true)
    assert.equal(result.published, false)
    assert.equal(result.target, 'none')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('publishDocument requires a destination for a new feishu doc', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-sol-'))
  try {
    const docPath = join(dir, 'doc.md')
    writeFileSync(docPath, '# doc\n', 'utf-8')
    // No stored doc token and no folder/wiki destination → needs_config, not faked.
    const result = await publishDocument(docPath, { target: 'feishu' })
    assert.equal(result.success, false)
    assert.equal(result.published, false)
    assert.equal(result.needs_config, true)
    assert.equal(result.source_of_truth, docPath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('publishDocument dry-run builds a user-identity create command', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-sol-'))
  try {
    const docPath = join(dir, 'doc.md')
    writeFileSync(docPath, '# 技术方案\n内容\n', 'utf-8')
    const result = await publishDocument(docPath, { target: 'feishu', feishu: { folder_token: 'fld_x' }, dryRun: true })
    assert.equal(result.success, true)
    assert.equal(result.dry_run, true)
    assert.equal(result.op, 'create')
    assert.match(result.command, /docs \+create/)
    assert.match(result.command, /--as user/)
    assert.match(result.command, /--folder-token fld_x/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('publishDocument dry-run uses update when a doc token is stored', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-sol-'))
  try {
    const docPath = join(dir, 'doc.md')
    writeFileSync(docPath, '# 技术方案\n<!-- fullstack-feishu-doc: docx_abc123 -->\n内容\n', 'utf-8')
    const result = await publishDocument(docPath, { target: 'feishu', dryRun: true })
    assert.equal(result.op, 'update')
    assert.match(result.command, /docs \+update/)
    assert.match(result.command, /--doc docx_abc123/)
    assert.match(result.command, /--mode overwrite/)
    assert.match(result.command, /--as user/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resolvePublishConfig honors explicit override', () => {
  assert.equal(resolvePublishConfig({ target: 'feishu' }).target, 'feishu')
})

test('extractDocRef parses token and url from lark-cli output shapes', () => {
  const a = extractDocRef(JSON.stringify({ data: { document: { document_id: 'docx_1', url: 'https://f/1' } } }))
  assert.equal(a.token, 'docx_1')
  assert.equal(a.url, 'https://f/1')

  const b = extractDocRef(JSON.stringify({ data: { obj_token: 'docx_2' } }))
  assert.equal(b.token, 'docx_2')

  const c = extractDocRef('not json')
  assert.equal(c.token, '')
})

test('readStoredDocToken + recordPublishLink round-trip is idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-sol-'))
  try {
    const docPath = join(dir, 'doc.md')
    writeFileSync(docPath, '# 技术方案\n正文\n', 'utf-8')
    assert.equal(readStoredDocToken(readFileSync(docPath, 'utf-8')), '')

    recordPublishLink(docPath, 'docx_xyz', 'https://f/xyz')
    let content = readFileSync(docPath, 'utf-8')
    assert.equal(readStoredDocToken(content), 'docx_xyz')
    assert.match(content, /https:\/\/f\/xyz/)

    // Re-record with a new url → no duplicate markers.
    recordPublishLink(docPath, 'docx_xyz', 'https://f/xyz-v2')
    content = readFileSync(docPath, 'utf-8')
    assert.equal((content.match(/fullstack-feishu-doc/gu) || []).length, 1)
    assert.equal((content.match(/fullstack-publish-link/gu) || []).length, 1)
    assert.match(content, /xyz-v2/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
