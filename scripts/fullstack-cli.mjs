import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  chooseRootMode,
  ensureConfigDirs,
  getConfiguredRootMode,
  persistRootChoice,
  readRuntimeGlobalConfig,
  resolveFullstackConfigFile,
} from './fullstack-runtime-store.mjs'
import {
  fullstackMigrateDryRun,
  fullstackMigrateRollback,
  fullstackMigrateToGlobal,
} from './fullstack-migrate.mjs'
import {
  bindProject,
  buildDefaultFullstackConfig,
  listEngineers,
  loadConfig,
  saveConfig,
  unbindProject,
  validateConfig,
} from './fullstack-config-store.mjs'
import {
  analyzeCrossProjectDependencies,
  analyzeImpact,
  analyzeServiceOwnership,
  getAllProjects,
} from './fullstack-impact.mjs'
import { initProjectKb } from './fullstack-kb-init.mjs'
import { batchSyncFromResult, syncTechDoc, updateUpstreamIndex } from './fullstack-sync.mjs'
import { TaskStore, loadTaskPayload, resolveStateFileArg } from './fullstack-task-store.mjs'

function safeJsonString(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function printUsage() {
  process.stdout.write([
    '用法: helloagents fullstack <runtime|migrate|init|projects|engineers|bind|unbind|impact|dispatch-plan|cross-deps|ownership|create|status|next-layer|start|complete|fail|retry|feedback|report|sync|kb> ...',
    "示例: helloagents fullstack runtime set-root '~/.helloagents/runtime' --create",
    '示例: helloagents fullstack runtime choose-root',
  ].join('\n') + '\n')
}

function getStateFileArg(args, { projectRoot, kbRoot }) {
  const optionIndex = args.indexOf('--state-file')
  const explicit = optionIndex >= 0 && optionIndex + 1 < args.length ? args[optionIndex + 1] : '@auto'
  return resolveStateFileArg(explicit, { projectRoot, kbRoot })
}

export async function handleFullstackCli(args = []) {
  if (!args.length || ['-h', '--help', 'help'].includes(args[0])) {
    printUsage()
    return true
  }

  const group = args[0]
  const projectRoot = process.env.HELLOAGENTS_PROJECT_ROOT || process.cwd()
  const kbRoot = process.env.HELLOAGENTS_KB_ROOT || join(projectRoot, '.helloagents')

  if (group === 'runtime') {
    const sub = args[1]
    if (!sub) {
      printUsage()
      return false
    }
    if (sub === 'get-root') {
      const cfg = readRuntimeGlobalConfig()
      process.stdout.write(`${cfg.FULLSTACK_RUNTIME_ROOT || ''}\n`)
      return true
    }
    if (sub === 'get-mode') {
      process.stdout.write(`${getConfiguredRootMode() || ''}\n`)
      return true
    }
    if (sub === 'choose-root') {
      const mode = args[2] || ''
      const rootPath = mode === 'global' && args[3] && !args[3].startsWith('--') ? args[3] : ''
      const chosen = await chooseRootMode(mode, rootPath, args.slice(2).includes('--create'))
      process.stdout.write(`${chosen || 'project'}\n`)
      return true
    }
    if (sub === 'clear-root') {
      persistRootChoice('project')
      process.stdout.write('\n')
      return true
    }
    if (sub === 'set-root') {
      if (!args[2]) {
        printUsage()
        return false
      }
      const runtimeRoot = persistRootChoice('global', args[2], args.slice(3).includes('--create'))
      process.stdout.write(`${runtimeRoot}\n`)
      return true
    }
    printUsage()
    return false
  }

  if (group === 'init') {
    const configPath = resolveFullstackConfigFile({ projectRoot, kbRoot })
    const force = args.slice(1).includes('--force')
    if (!force) {
      const existing = loadConfig(configPath)
      if (!existing.error) {
        const [valid] = validateConfig(existing)
        if (valid) {
          process.stdout.write(safeJsonString({
            success: true,
            created: false,
            config_path: configPath,
            message: 'Fullstack config already exists',
          }))
          return true
        }
      }
    }

    if (configPath.startsWith(join(process.env.HOME || '', '.helloagents'))) {
      ensureConfigDirs()
    } else {
      mkdirSync(dirname(configPath), { recursive: true })
    }
    const payload = buildDefaultFullstackConfig()
    const [saved, error] = saveConfig(configPath, payload)
    if (!saved) {
      process.stdout.write(safeJsonString({
        success: false,
        error: `Failed to save config: ${error || 'unknown error'}`,
        config_path: configPath,
      }))
      return false
    }
    process.stdout.write(safeJsonString({
      success: true,
      created: true,
      config_path: configPath,
      root_mode: readRuntimeGlobalConfig().FULLSTACK_ROOT_MODE || '',
      engineers: payload.engineers.map((item) => item.id),
    }))
    return true
  }

  if (group === 'migrate') {
    const mode = args[1]
    if (!['dry-run', 'to-global', 'rollback'].includes(mode)) {
      process.stdout.write([
        '用法: helloagents fullstack migrate <dry-run|to-global|rollback> [project_root] [kb_root]',
        'Usage: helloagents fullstack migrate <dry-run|to-global|rollback> [project_root] [kb_root]',
      ].join('\n') + '\n')
      return false
    }

    const targetProjectRoot = args[2] || projectRoot
    const targetKbRoot = args[3] || kbRoot
    const result = mode === 'dry-run'
      ? fullstackMigrateDryRun(targetProjectRoot, targetKbRoot)
      : mode === 'to-global'
        ? fullstackMigrateToGlobal(targetProjectRoot, targetKbRoot)
        : fullstackMigrateRollback(targetProjectRoot)
    process.stdout.write(safeJsonString(result))
    return Boolean(result.success)
  }

  if (['projects', 'engineers', 'bind', 'unbind', 'impact', 'dispatch-plan', 'cross-deps', 'ownership', 'create', 'status', 'next-layer', 'start', 'complete', 'fail', 'retry', 'feedback', 'report', 'sync', 'kb'].includes(group)) {
    const configPath = resolveFullstackConfigFile({ projectRoot, kbRoot })
    const needsConfig = !['create', 'status', 'next-layer', 'start', 'complete', 'fail', 'retry', 'feedback', 'report'].includes(group)
    const config = needsConfig ? loadConfig(configPath) : null
    if (needsConfig && config?.error) {
      process.stdout.write(safeJsonString({
        success: false,
        error: config.error,
        config_path: configPath,
        suggestion: 'Run `helloagents fullstack init` first.',
      }))
      return false
    }

    if (group === 'projects') {
      process.stdout.write(safeJsonString(getAllProjects(config)))
      return true
    }
    if (group === 'engineers') {
      process.stdout.write(safeJsonString(listEngineers(config)))
      return true
    }
    if (group === 'bind') {
      if (args.length < 4 || args[2] !== '--engineer-id') {
        process.stdout.write([
          '用法: helloagents fullstack bind <project_path> --engineer-id <id> [--description txt] [--tech a,b] [--auto-init-kb true|false] [--allow-rebind]',
          'Usage: helloagents fullstack bind <project_path> --engineer-id <id> [--description txt] [--tech a,b] [--auto-init-kb true|false] [--allow-rebind]',
        ].join('\n') + '\n')
        return false
      }

      const projectPathArg = args[1]
      const engineerId = args[3]
      let description = null
      let techStack = []
      let autoInitKb = true
      const allowRebind = args.slice(4).includes('--allow-rebind')

      if (args.slice(4).includes('--description')) {
        const index = args.indexOf('--description')
        if (index + 1 < args.length) description = args[index + 1]
      }
      if (args.slice(4).includes('--tech')) {
        const index = args.indexOf('--tech')
        if (index + 1 < args.length) {
          techStack = args[index + 1].split(',').map((item) => item.trim()).filter(Boolean)
        }
      }
      if (args.slice(4).includes('--auto-init-kb')) {
        const index = args.indexOf('--auto-init-kb')
        if (index + 1 < args.length) {
          autoInitKb = ['true', '1', 'yes', 'y'].includes(String(args[index + 1]).trim().toLowerCase())
        }
      }

      const result = bindProject(config, projectPathArg, engineerId, {
        description,
        techStack,
        autoInitKb,
        allowRebind,
      })

      if (result.success) {
        const [valid, errors] = validateConfig(config)
        if (!valid) {
          process.stdout.write(safeJsonString({
            success: false,
            error: 'Config becomes invalid after bind',
            validation_errors: errors,
          }))
          return false
        }
        const [saved, error] = saveConfig(configPath, config)
        if (!saved) {
          process.stdout.write(safeJsonString({
            success: false,
            error: `Failed to save config: ${error || 'unknown error'}`,
          }))
          return false
        }
      }

      process.stdout.write(safeJsonString(result))
      return Boolean(result.success)
    }
    if (group === 'unbind') {
      if (args.length < 2) {
        process.stdout.write([
          '用法: helloagents fullstack unbind <project_path>',
          'Usage: helloagents fullstack unbind <project_path>',
        ].join('\n') + '\n')
        return false
      }
      const result = unbindProject(config, args[1])
      if (!result.success) {
        process.stdout.write(safeJsonString(result))
        return false
      }
      const [saved, error] = saveConfig(configPath, config)
      if (!saved) {
        process.stdout.write(safeJsonString({
          success: false,
          error: `Failed to save config: ${error || 'unknown error'}`,
        }))
        return false
      }
      process.stdout.write(safeJsonString(result))
      return true
    }
    if (group === 'impact') {
      if (args.length < 2) {
        process.stdout.write([
          '用法: helloagents fullstack impact <project_paths...>',
          'Usage: helloagents fullstack impact <project_paths...>',
        ].join('\n') + '\n')
        return false
      }
      process.stdout.write(safeJsonString(analyzeImpact(config, args.slice(1))))
      return true
    }
    if (group === 'dispatch-plan') {
      if (args.length < 2) {
        process.stdout.write([
          '用法: helloagents fullstack dispatch-plan <project_paths...>',
          'Usage: helloagents fullstack dispatch-plan <project_paths...>',
        ].join('\n') + '\n')
        return false
      }
      const impact = analyzeImpact(config, args.slice(1))
      const dispatchPlan = impact.dispatch_plan || {}
      process.stdout.write(safeJsonString({
        directly_affected: impact.directly_affected || [],
        all_affected: impact.all_affected || [],
        dispatchable_projects: dispatchPlan.dispatchable_projects || [],
        unassigned_projects: dispatchPlan.unassigned_projects || [],
        grouped_by_engineer_type: dispatchPlan.grouped_by_engineer_type || {},
        dispatch_execution_order: dispatchPlan.dispatch_execution_order || [],
        continue_execution: dispatchPlan.continue_execution || false,
        advisory_only_unassigned: dispatchPlan.advisory_only_unassigned !== false,
        warnings: dispatchPlan.warnings || [],
        assignments: dispatchPlan.assignments || [],
      }))
      return true
    }
    if (group === 'cross-deps') {
      process.stdout.write(safeJsonString(analyzeCrossProjectDependencies(config, args.slice(1))))
      return true
    }
    if (group === 'ownership') {
      if (args.length < 2) {
        process.stdout.write([
          '用法: helloagents fullstack ownership <requirement> [project_paths...]',
          'Usage: helloagents fullstack ownership <requirement> [project_paths...]',
        ].join('\n') + '\n')
        return false
      }
      process.stdout.write(safeJsonString(analyzeServiceOwnership(config, args[1], args.slice(2))))
      return true
    }
    if (group === 'create') {
      if (args.length < 2) {
        process.stdout.write([
          '用法: helloagents fullstack create <tasks_json> [--state-file path]',
          'Usage: helloagents fullstack create <tasks_json> [--state-file path]',
        ].join('\n') + '\n')
        return false
      }
      const stateFile = getStateFileArg(args.slice(1), { projectRoot, kbRoot })
      const payload = loadTaskPayload(args[1])
      const store = new TaskStore(stateFile, { projectRoot, kbRoot })
      process.stdout.write(safeJsonString(store.createTaskGroup(
        payload.task_group_id || `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-unnamed`,
        payload.requirement || '',
        payload.tasks || [],
        payload.required_artifacts,
      )))
      return true
    }
    if (group === 'status') {
      const stateFile = getStateFileArg(args.slice(1), { projectRoot, kbRoot })
      const store = new TaskStore(stateFile, { projectRoot, kbRoot })
      process.stdout.write(safeJsonString(store.getStatusSummary()))
      return true
    }
    if (group === 'next-layer') {
      const stateFile = getStateFileArg(args.slice(1), { projectRoot, kbRoot })
      const store = new TaskStore(stateFile, { projectRoot, kbRoot })
      const layer = store.getNextLayer()
      process.stdout.write(safeJsonString(layer
        ? { layer, tasks: store.getLayerTasks(layer.layer) }
        : { message: 'No pending layers' }))
      return true
    }
    if (group === 'start') {
      if (args.length < 2) {
        process.stdout.write([
          '用法: helloagents fullstack start <task_id> [--state-file path]',
          'Usage: helloagents fullstack start <task_id> [--state-file path]',
        ].join('\n') + '\n')
        return false
      }
      const stateFile = getStateFileArg(args.slice(1), { projectRoot, kbRoot })
      const store = new TaskStore(stateFile, { projectRoot, kbRoot })
      process.stdout.write(safeJsonString({ success: store.startTask(args[1]) }))
      return true
    }
    if (group === 'complete') {
      if (args.length < 3) {
        process.stdout.write([
          '用法: helloagents fullstack complete <task_id> <result_json> [--state-file path]',
          'Usage: helloagents fullstack complete <task_id> <result_json> [--state-file path]',
        ].join('\n') + '\n')
        return false
      }
      const stateFile = getStateFileArg(args.slice(1), { projectRoot, kbRoot })
      const store = new TaskStore(stateFile, { projectRoot, kbRoot })
      process.stdout.write(safeJsonString({ success: store.completeTask(args[1], loadTaskPayload(args[2])) }))
      return true
    }
    if (group === 'fail') {
      if (args.length < 3) {
        process.stdout.write([
          '用法: helloagents fullstack fail <task_id> <error> [--state-file path]',
          'Usage: helloagents fullstack fail <task_id> <error> [--state-file path]',
        ].join('\n') + '\n')
        return false
      }
      const stateFile = getStateFileArg(args.slice(1), { projectRoot, kbRoot })
      const store = new TaskStore(stateFile, { projectRoot, kbRoot })
      process.stdout.write(safeJsonString({ success: store.failTask(args[1], args[2]) }))
      return true
    }
    if (group === 'retry') {
      if (args.length < 2) {
        process.stdout.write([
          '用法: helloagents fullstack retry <task_id> [--state-file path]',
          'Usage: helloagents fullstack retry <task_id> [--state-file path]',
        ].join('\n') + '\n')
        return false
      }
      const stateFile = getStateFileArg(args.slice(1), { projectRoot, kbRoot })
      const store = new TaskStore(stateFile, { projectRoot, kbRoot })
      process.stdout.write(safeJsonString({ success: store.retryTask(args[1]) }))
      return true
    }
    if (group === 'feedback') {
      if (args.length < 4) {
        process.stdout.write([
          '用法: helloagents fullstack feedback <task_id> <status> <result_json> [--state-file path]',
          'Usage: helloagents fullstack feedback <task_id> <status> <result_json> [--state-file path]',
        ].join('\n') + '\n')
        return false
      }
      const stateFile = getStateFileArg(args.slice(1), { projectRoot, kbRoot })
      const store = new TaskStore(stateFile, { projectRoot, kbRoot })
      const result = store.processFeedback(args[1], args[2], loadTaskPayload(args[3]))
      process.stdout.write(safeJsonString(result))
      return Boolean(result.success)
    }
    if (group === 'report') {
      const stateFile = getStateFileArg(args.slice(1), { projectRoot, kbRoot })
      const store = new TaskStore(stateFile, { projectRoot, kbRoot })
      process.stdout.write(safeJsonString(store.getProgressReport()))
      return true
    }
    if (group === 'sync') {
      if (args[1] === 'batch') {
        if (args.length < 3) {
          process.stdout.write([
            '用法: helloagents fullstack sync batch <result_json_file> [--base <path>]',
            'Usage: helloagents fullstack sync batch <result_json_file> [--base <path>]',
          ].join('\n') + '\n')
          return false
        }
        const baseIndex = args.indexOf('--base')
        const basePath = baseIndex >= 0 && baseIndex + 1 < args.length ? args[baseIndex + 1] : '.'
        const result = batchSyncFromResult(loadTaskPayload(args[2]), basePath)
        process.stdout.write(safeJsonString(result))
        return Boolean(result.success)
      }
      if (args[1] === 'index') {
        if (args.length < 3) {
          process.stdout.write([
            '用法: helloagents fullstack sync index <project_path>',
            'Usage: helloagents fullstack sync index <project_path>',
          ].join('\n') + '\n')
          return false
        }
        const result = updateUpstreamIndex(args[2])
        process.stdout.write(safeJsonString(result))
        return Boolean(result.success)
      }
      if (args.length < 3) {
        process.stdout.write([
          '用法: helloagents fullstack sync <source> <target1,target2,...> [--type <doc_type>]',
          'Usage: helloagents fullstack sync <source> <target1,target2,...> [--type <doc_type>]',
        ].join('\n') + '\n')
        return false
      }
      const typeIndex = args.indexOf('--type')
      const docType = typeIndex >= 0 && typeIndex + 1 < args.length ? args[typeIndex + 1] : 'api_contract'
      const result = syncTechDoc(args[1], args[2].split(',').map((item) => item.trim()).filter(Boolean), docType)
      process.stdout.write(safeJsonString(result))
      return Boolean(result.success)
    }
    if (group === 'kb') {
      if (args[1] !== 'init') {
        process.stdout.write([
          '用法: helloagents fullstack kb init [--all|<project_path>] [--force]',
          'Usage: helloagents fullstack kb init [--all|<project_path>] [--force]',
        ].join('\n') + '\n')
        return false
      }
      const force = args.includes('--force')
      if (args[2] === '--all') {
        const results = getAllProjects(config)
          .filter((item) => item.path)
          .map((item) => initProjectKb({
            projectPath: item.path,
            declaredTechStack: item.tech_stack || [],
            engineerId: item.engineer_id || null,
            force,
            serviceProfile: config.service_catalog?.[item.path] || null,
          }))
        process.stdout.write(safeJsonString({
          success: results.every((item) => item.success),
          total: results.length,
          completed: results.filter((item) => item.success).length,
          results,
        }))
        return results.every((item) => item.success)
      }

      const targetProject = args[2]
      if (!targetProject) {
        process.stdout.write([
          '用法: helloagents fullstack kb init [--all|<project_path>] [--force]',
          'Usage: helloagents fullstack kb init [--all|<project_path>] [--force]',
        ].join('\n') + '\n')
        return false
      }
      const projectInfo = getAllProjects(config).find((item) => item.path === targetProject)
      const result = initProjectKb({
        projectPath: targetProject,
        declaredTechStack: projectInfo?.tech_stack || [],
        engineerId: projectInfo?.engineer_id || null,
        force,
        serviceProfile: config.service_catalog?.[targetProject] || null,
      })
      process.stdout.write(safeJsonString(result))
      return Boolean(result.success)
    }
  }
  process.stdout.write(safeJsonString({
    success: false,
    error: `Unknown fullstack command group: ${group}`,
    available_groups: [
      'runtime',
      'migrate',
      'init',
      'projects',
      'engineers',
      'bind',
      'unbind',
      'impact',
      'dispatch-plan',
      'cross-deps',
      'ownership',
      'create',
      'status',
      'next-layer',
      'start',
      'complete',
      'fail',
      'retry',
      'feedback',
      'report',
      'sync',
      'kb',
    ],
  }))
  return false
}
