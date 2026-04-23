import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { batchSyncFromResult, syncTechDoc, updateUpstreamIndex } from '../scripts/fullstack-sync.mjs'

test('syncTechDoc copies api contract into target upstream directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-fullstack-sync-'))
  try {
    const sourceDir = join(dir, 'source')
    const targetDir = join(dir, 'target')
    mkdirSync(sourceDir, { recursive: true })
    mkdirSync(targetDir, { recursive: true })
    const sourceFile = join(sourceDir, 'user_points.md')
    writeFileSync(sourceFile, '# user points\n', 'utf-8')

    const result = syncTechDoc(sourceFile, [targetDir], 'api_contract')
    const targetFile = join(targetDir, '.helloagents', 'api', 'upstream', 'user_points.md')

    assert.equal(result.success, true)
    assert.equal(existsSync(targetFile), true)
    assert.ok(readFileSync(targetFile, 'utf-8').includes('同步自:'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('batchSyncFromResult syncs tech docs from result payload', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-fullstack-sync-'))
  try {
    const projectDir = join(dir, 'backend')
    const targetDir = join(dir, 'frontend')
    mkdirSync(join(projectDir, '.helloagents', 'api'), { recursive: true })
    mkdirSync(targetDir, { recursive: true })
    const sourceFile = join(projectDir, '.helloagents', 'api', 'report_contract.md')
    writeFileSync(sourceFile, '# report contract\n', 'utf-8')

    const result = batchSyncFromResult({
      project: projectDir,
      tech_docs: [
        {
          path: '.helloagents/api/report_contract.md',
          sync_to: [targetDir],
          type: 'api_contract',
        },
      ],
    }, dir)

    assert.equal(result.success, true)
    assert.equal(result.results.length, 1)
    assert.equal(existsSync(join(targetDir, '.helloagents', 'api', 'upstream', 'report_contract.md')), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('updateUpstreamIndex creates markdown index for synced files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-fullstack-sync-'))
  try {
    const projectDir = join(dir, 'frontend')
    const upstreamDir = join(projectDir, '.helloagents', 'api', 'upstream')
    mkdirSync(upstreamDir, { recursive: true })
    writeFileSync(join(upstreamDir, 'user_points.md'), '<!--\n同步自: /tmp/backend/.helloagents/api/user_points.md\n同步时间: 2026-04-21 12:00:00\n文档类型: api_contract\n-->\n\n# points\n', 'utf-8')

    const result = updateUpstreamIndex(projectDir)

    assert.equal(result.success, true)
    assert.equal(existsSync(join(upstreamDir, '_index.md')), true)
    assert.ok(readFileSync(join(upstreamDir, '_index.md'), 'utf-8').includes('user_points.md'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
