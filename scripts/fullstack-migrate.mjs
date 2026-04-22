import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import {
  ensureIndexDirs,
  ensureRuntimeDirs,
  getGlobalConfigFile,
  getLegacyConfigFile,
  getRuntimeRoot,
} from './fullstack-runtime-store.mjs'

function nowIso() {
  return new Date().toISOString().slice(0, 19)
}

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return fallback
  }
}

function writeJson(filePath, payload) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
}

function copyFileRecord(source, target) {
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
  return { src: source, dst: target, type: 'file' }
}

function listFilesRecursive(sourceDir) {
  if (!existsSync(sourceDir)) return []

  const entries = []
  const stack = [sourceDir]
  while (stack.length) {
    const current = stack.pop()
    for (const name of readdirSync(current)) {
      const absolutePath = join(current, name)
      const stats = statSync(absolutePath)
      if (stats.isDirectory()) {
        stack.push(absolutePath)
        continue
      }
      if (stats.isFile()) entries.push(absolutePath)
    }
  }
  return entries.sort()
}

function copyDirectoryFiles(sourceDir, targetDir) {
  return listFilesRecursive(sourceDir).map((source) => {
    const target = join(targetDir, relative(sourceDir, source))
    return copyFileRecord(source, target)
  })
}

function loadMigrationMap(mapFile) {
  const payload = readJson(mapFile, { entries: [] })
  if (!Array.isArray(payload.entries)) payload.entries = []
  return payload
}

function buildPlan(projectRoot, kbRoot) {
  const resolvedProjectRoot = resolve(projectRoot)
  const resolvedKbRoot = resolve(kbRoot)
  const legacyConfig = getLegacyConfigFile(resolvedKbRoot)
  const globalConfig = getGlobalConfigFile()
  const legacyTasks = join(resolvedKbRoot, 'fullstack', 'tasks')
  const globalTasks = getRuntimeRoot({ projectRoot: resolvedProjectRoot, kbRoot: resolvedKbRoot })
  const actions = []

  if (existsSync(legacyConfig)) {
    actions.push({
      kind: 'config',
      src: legacyConfig,
      dst: globalConfig,
      exists_dst: existsSync(globalConfig),
    })
  }

  const legacyTaskFiles = listFilesRecursive(legacyTasks)
  if (legacyTaskFiles.length) {
    actions.push({
      kind: 'runtime',
      src: legacyTasks,
      dst: globalTasks,
      file_count: legacyTaskFiles.length,
    })
  }

  return {
    project_root: resolvedProjectRoot,
    kb_root: resolvedKbRoot,
    legacy_config: legacyConfig,
    global_config: globalConfig,
    legacy_tasks: legacyTasks,
    global_tasks: globalTasks,
    actions,
    can_migrate: actions.length > 0,
  }
}

export function fullstackMigrateDryRun(projectRoot, kbRoot) {
  return {
    success: true,
    mode: 'dry-run',
    plan: buildPlan(projectRoot, kbRoot),
  }
}

export function fullstackMigrateToGlobal(projectRoot, kbRoot) {
  const plan = buildPlan(projectRoot, kbRoot)
  if (!plan.can_migrate) {
    return {
      success: true,
      mode: 'to-global',
      message: 'Nothing to migrate',
      plan,
      changes: [],
    }
  }

  const changes = []
  const conflicts = []

  if (existsSync(plan.legacy_config)) {
    if (
      existsSync(plan.global_config)
      && readFileSync(plan.global_config, 'utf-8') !== readFileSync(plan.legacy_config, 'utf-8')
    ) {
      const conflictPath = `${plan.global_config}.conflict-${nowIso().replace(/[-:T]/gu, '')}`
      changes.push(copyFileRecord(plan.legacy_config, conflictPath))
      conflicts.push({
        src: plan.legacy_config,
        dst: plan.global_config,
        conflict_copy: conflictPath,
      })
    } else {
      changes.push(copyFileRecord(plan.legacy_config, plan.global_config))
    }
  }

  if (existsSync(plan.legacy_tasks)) {
    ensureRuntimeDirs({ projectRoot: plan.project_root, kbRoot: plan.kb_root })
    changes.push(...copyDirectoryFiles(plan.legacy_tasks, plan.global_tasks))
  }

  const indexRoot = ensureIndexDirs()
  const mapFile = join(indexRoot, 'migration-map.json')
  const payload = loadMigrationMap(mapFile)
  const entry = {
    id: `${plan.project_root.split('/').pop() || 'project'}-${nowIso().replace(/[-:T]/gu, '')}`,
    timestamp: nowIso(),
    project_root: plan.project_root,
    kb_root: plan.kb_root,
    legacy_config: plan.legacy_config,
    global_config: plan.global_config,
    legacy_tasks: plan.legacy_tasks,
    global_tasks: plan.global_tasks,
    changes,
    conflicts,
  }
  payload.entries.push(entry)
  writeJson(mapFile, payload)

  return {
    success: true,
    mode: 'to-global',
    plan,
    changes,
    conflicts,
    map_file: mapFile,
    entry_id: entry.id,
  }
}

export function fullstackMigrateRollback(projectRoot) {
  const resolvedProjectRoot = resolve(projectRoot)
  const mapFile = join(ensureIndexDirs(), 'migration-map.json')
  const payload = loadMigrationMap(mapFile)
  const target = [...payload.entries].reverse().find((item) => item.project_root === resolvedProjectRoot)

  if (!target) {
    return {
      success: false,
      mode: 'rollback',
      error: 'No migration record for this project',
    }
  }

  const changes = []
  if (existsSync(target.global_config)) {
    changes.push(copyFileRecord(target.global_config, target.legacy_config))
  }
  if (existsSync(target.global_tasks)) {
    changes.push(...copyDirectoryFiles(target.global_tasks, target.legacy_tasks))
  }

  return {
    success: true,
    mode: 'rollback',
    project_root: resolvedProjectRoot,
    restored_from_entry: target.id,
    changes,
  }
}
