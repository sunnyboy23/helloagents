import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, normalize, resolve } from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const HELLOAGENTS_HOME = join(homedir(), '.helloagents')
const GLOBAL_CONFIG_FILE = join(HELLOAGENTS_HOME, 'helloagents.json')
const DEFAULT_GLOBAL_FULLSTACK_ROOT = join(HELLOAGENTS_HOME, 'fullstack')

export const FULLSTACK_ROOT_MODE_PROJECT = 'project'
export const FULLSTACK_ROOT_MODE_GLOBAL = 'global'

function normalizePath(filePath = '') {
  return filePath ? normalize(resolve(filePath)) : ''
}

function readGlobalConfig() {
  try {
    if (!existsSync(GLOBAL_CONFIG_FILE)) return {}
    return JSON.parse(readFileSync(GLOBAL_CONFIG_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function writeGlobalConfig(config) {
  mkdirSync(dirname(GLOBAL_CONFIG_FILE), { recursive: true })
  writeFileSync(GLOBAL_CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
}

export function getConfiguredRootMode() {
  const envMode = String(process.env.HELLOAGENTS_FULLSTACK_ROOT_MODE || '').trim().toLowerCase()
  if ([FULLSTACK_ROOT_MODE_PROJECT, FULLSTACK_ROOT_MODE_GLOBAL].includes(envMode)) return envMode
  const cfg = readGlobalConfig()
  const mode = String(cfg.FULLSTACK_ROOT_MODE || '').trim().toLowerCase()
  return [FULLSTACK_ROOT_MODE_PROJECT, FULLSTACK_ROOT_MODE_GLOBAL].includes(mode) ? mode : ''
}

export function getDefaultGlobalRoot() {
  return DEFAULT_GLOBAL_FULLSTACK_ROOT
}

function projectHash(projectRoot) {
  return createHash('sha1').update(String(projectRoot)).digest('hex').slice(0, 12)
}

export function getProjectRuntimeKey(projectRoot) {
  return projectHash(normalizePath(projectRoot))
}

export function getConfiguredRuntimeRoot() {
  const envRuntime = String(process.env.HELLOAGENTS_FULLSTACK_RUNTIME_ROOT || '').trim()
  if (envRuntime) return normalizePath(envRuntime)

  const cfg = readGlobalConfig()
  const configured = String(cfg.FULLSTACK_RUNTIME_ROOT || '').trim()
  if (configured) return normalizePath(configured)

  return getConfiguredRootMode() === FULLSTACK_ROOT_MODE_GLOBAL
    ? normalizePath(getDefaultGlobalRoot())
    : ''
}

export function persistRootChoice(mode, rootPath = '', createDirs = false) {
  const cfg = readGlobalConfig()
  if (mode === FULLSTACK_ROOT_MODE_PROJECT) {
    cfg.FULLSTACK_ROOT_MODE = FULLSTACK_ROOT_MODE_PROJECT
    delete cfg.FULLSTACK_RUNTIME_ROOT
    delete cfg.FULLSTACK_CONFIG_ROOT
    delete cfg.FULLSTACK_INDEX_ROOT
    writeGlobalConfig(cfg)
    return ''
  }

  const runtimeRoot = normalizePath(rootPath || getDefaultGlobalRoot())
  cfg.FULLSTACK_ROOT_MODE = FULLSTACK_ROOT_MODE_GLOBAL
  cfg.FULLSTACK_RUNTIME_ROOT = runtimeRoot
  cfg.FULLSTACK_CONFIG_ROOT = join(runtimeRoot, 'config')
  cfg.FULLSTACK_INDEX_ROOT = join(runtimeRoot, 'index')
  writeGlobalConfig(cfg)

  if (createDirs) {
    mkdirSync(runtimeRoot, { recursive: true })
    mkdirSync(join(runtimeRoot, 'config'), { recursive: true })
    mkdirSync(join(runtimeRoot, 'index'), { recursive: true })
  }
  return runtimeRoot
}

export async function chooseRootMode(mode = '', rootPath = '', createDirs = false) {
  let selectedMode = String(mode || '').trim().toLowerCase()
  let selectedRoot = rootPath

  if (![FULLSTACK_ROOT_MODE_PROJECT, FULLSTACK_ROOT_MODE_GLOBAL].includes(selectedMode)) {
    const rl = readline.createInterface({ input, output })
    try {
      output.write('请选择全栈 fullstack 文件夹位置：\n')
      output.write('  1. 项目内（当前项目/.helloagents/fullstack）\n')
      output.write(`  2. 用户目录（默认 ${getDefaultGlobalRoot()}）\n`)
      while (!selectedMode) {
        const choice = String(await rl.question('请输入编号 (1/2): ')).trim()
        if (choice === '1') selectedMode = FULLSTACK_ROOT_MODE_PROJECT
        else if (choice === '2') {
          selectedMode = FULLSTACK_ROOT_MODE_GLOBAL
          const custom = String(await rl.question('可选：输入自定义用户目录路径，直接回车使用默认值: ')).trim()
          if (custom) selectedRoot = custom
        }
      }
    } finally {
      rl.close()
    }
  }

  return persistRootChoice(selectedMode, selectedRoot, createDirs)
}

export function getRuntimeRoot({ kbRoot, projectRoot }) {
  const runtimeRoot = getConfiguredRuntimeRoot()
  if (!runtimeRoot) return join(normalizePath(kbRoot), 'fullstack', 'tasks')
  return join(runtimeRoot, getProjectRuntimeKey(projectRoot), 'fullstack', 'tasks')
}

export function getConfigRoot() {
  const envRoot = String(process.env.HELLOAGENTS_FULLSTACK_CONFIG_ROOT || '').trim()
  if (envRoot) return normalizePath(envRoot)

  const cfg = readGlobalConfig()
  const configured = String(cfg.FULLSTACK_CONFIG_ROOT || '').trim()
  if (configured) return normalizePath(configured)

  const runtimeRoot = getConfiguredRuntimeRoot()
  return runtimeRoot ? join(runtimeRoot, 'config') : join(getDefaultGlobalRoot(), 'config')
}

export function getIndexRoot() {
  const envRoot = String(process.env.HELLOAGENTS_FULLSTACK_INDEX_ROOT || '').trim()
  if (envRoot) return normalizePath(envRoot)

  const cfg = readGlobalConfig()
  const configured = String(cfg.FULLSTACK_INDEX_ROOT || '').trim()
  if (configured) return normalizePath(configured)

  const runtimeRoot = getConfiguredRuntimeRoot()
  return runtimeRoot ? join(runtimeRoot, 'index') : join(getDefaultGlobalRoot(), 'index')
}

export function getGlobalConfigFile() {
  return join(getConfigRoot(), 'fullstack.yaml')
}

export function getLegacyConfigFile(kbRoot) {
  return join(normalizePath(kbRoot), 'fullstack', 'fullstack.yaml')
}

export function resolveFullstackConfigFile({ projectRoot, kbRoot }) {
  const envFile = String(process.env.HELLOAGENTS_FULLSTACK_CONFIG_FILE || '').trim()
  if (envFile) return normalizePath(envFile)

  if (getConfiguredRootMode() === FULLSTACK_ROOT_MODE_PROJECT) {
    return getLegacyConfigFile(kbRoot)
  }

  const globalConfigFile = getGlobalConfigFile()
  if (existsSync(globalConfigFile) || getConfiguredRuntimeRoot()) {
    return globalConfigFile
  }

  return getLegacyConfigFile(kbRoot)
}

export function getCurrentStateFile({ projectRoot, kbRoot }) {
  return join(getRuntimeRoot({ projectRoot, kbRoot }), 'current.json')
}

export function ensureRuntimeDirs({ projectRoot, kbRoot }) {
  const tasksDir = getRuntimeRoot({ projectRoot, kbRoot })
  mkdirSync(tasksDir, { recursive: true })
  return tasksDir
}

export function ensureConfigDirs() {
  const configRoot = getConfigRoot()
  mkdirSync(configRoot, { recursive: true })
  return configRoot
}

export function ensureIndexDirs() {
  const indexRoot = getIndexRoot()
  mkdirSync(indexRoot, { recursive: true })
  return indexRoot
}

export function readRuntimeGlobalConfig() {
  return readGlobalConfig()
}

export function writeRuntimeGlobalConfig(config) {
  writeGlobalConfig(config)
}
