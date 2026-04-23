import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  fullstackMigrateDryRun,
  fullstackMigrateRollback,
  fullstackMigrateToGlobal,
} from '../scripts/fullstack-migrate.mjs'

function withMigrationEnv(rootDir, callback) {
  const previous = {
    HELLOAGENTS_FULLSTACK_RUNTIME_ROOT: process.env.HELLOAGENTS_FULLSTACK_RUNTIME_ROOT,
    HELLOAGENTS_FULLSTACK_CONFIG_ROOT: process.env.HELLOAGENTS_FULLSTACK_CONFIG_ROOT,
    HELLOAGENTS_FULLSTACK_INDEX_ROOT: process.env.HELLOAGENTS_FULLSTACK_INDEX_ROOT,
  }

  process.env.HELLOAGENTS_FULLSTACK_RUNTIME_ROOT = join(rootDir, 'global-root')
  process.env.HELLOAGENTS_FULLSTACK_CONFIG_ROOT = join(rootDir, 'global-root', 'config')
  process.env.HELLOAGENTS_FULLSTACK_INDEX_ROOT = join(rootDir, 'global-root', 'index')

  try {
    callback()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function writeText(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf-8')
}

test('fullstack migrate dry-run reports legacy config and runtime plan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-fullstack-migrate-'))
  try {
    withMigrationEnv(dir, () => {
      const projectRoot = join(dir, 'project')
      const kbRoot = join(projectRoot, '.helloagents')
      writeText(join(kbRoot, 'fullstack', 'fullstack.yaml'), 'version: 1\n')
      writeText(join(kbRoot, 'fullstack', 'tasks', 'current.json'), '{"task_group_id":"t1"}\n')

      const result = fullstackMigrateDryRun(projectRoot, kbRoot)

      assert.equal(result.success, true)
      assert.equal(result.plan.actions.length, 2)
      assert.equal(result.plan.can_migrate, true)
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('fullstack migrate to-global copies config/runtime and rollback restores them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-fullstack-migrate-'))
  try {
    withMigrationEnv(dir, () => {
      const projectRoot = join(dir, 'project')
      const kbRoot = join(projectRoot, '.helloagents')
      const legacyConfig = join(kbRoot, 'fullstack', 'fullstack.yaml')
      const legacyState = join(kbRoot, 'fullstack', 'tasks', 'current.json')
      const globalConfig = join(dir, 'global-root', 'config', 'fullstack.yaml')

      writeText(legacyConfig, 'version: 1\nmode: fullstack\n')
      writeText(legacyState, '{"task_group_id":"demo","overall_status":"pending"}\n')

      const migrated = fullstackMigrateToGlobal(projectRoot, kbRoot)
      assert.equal(migrated.success, true)
      assert.equal(existsSync(globalConfig), true)
      assert.match(readFileSync(globalConfig, 'utf-8'), /mode: fullstack/)
      assert.ok(migrated.changes.some((item) => item.dst.endsWith('current.json')))

      writeFileSync(globalConfig, 'version: 2\nmode: global\n', 'utf-8')
      const rolledBack = fullstackMigrateRollback(projectRoot)
      assert.equal(rolledBack.success, true)
      assert.match(readFileSync(legacyConfig, 'utf-8'), /mode: global/)
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
