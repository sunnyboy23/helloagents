import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'
import { homedir } from 'node:os'

const RUNTIME_DIR = join(homedir(), '.helloagents', 'runtime')
const ROUTE_CONTEXT_PATH = join(RUNTIME_DIR, 'route-context.json')
const TURN_TIMING_PATH = join(RUNTIME_DIR, 'turn-timing.json')
const ROUTE_CONTEXT_TTL_MS = 30 * 60 * 1000

function normalizePath(filePath = '') {
  return filePath ? normalize(resolve(filePath)) : ''
}

function ensureRuntimeDir() {
  mkdirSync(dirname(ROUTE_CONTEXT_PATH), { recursive: true })
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return {}
  }
}

function writeJsonFile(filePath, value) {
  ensureRuntimeDir()
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
}

export function clearRouteContext() {
  rmSync(ROUTE_CONTEXT_PATH, { force: true })
}

export function writeTurnTiming({ cwd, prompt = '', source = 'route', now = Date.now() } = {}) {
  const key = normalizePath(cwd)
  if (!key) return null

  const store = readJsonFile(TURN_TIMING_PATH)
  const entry = {
    cwd: key,
    prompt: typeof prompt === 'string' ? prompt.trim().slice(0, 500) : '',
    source,
    startedAt: now,
    startedAtIso: new Date(now).toISOString(),
  }
  store[key] = entry
  writeJsonFile(TURN_TIMING_PATH, store)
  return entry
}

export function readTurnTiming(cwd = process.cwd(), { now = Date.now() } = {}) {
  const key = normalizePath(cwd)
  if (!key) return null

  const store = readJsonFile(TURN_TIMING_PATH)
  const entry = store[key]
  if (!entry?.startedAt || now - Number(entry.startedAt) > ROUTE_CONTEXT_TTL_MS) {
    if (entry) {
      delete store[key]
      writeJsonFile(TURN_TIMING_PATH, store)
    }
    return null
  }
  return entry
}

export function clearTurnTiming(cwd = process.cwd()) {
  const key = normalizePath(cwd)
  if (!key) return false

  const store = readJsonFile(TURN_TIMING_PATH)
  if (!(key in store)) return false
  delete store[key]

  const keys = Object.keys(store)
  if (keys.length === 0) {
    rmSync(TURN_TIMING_PATH, { force: true })
  } else {
    writeJsonFile(TURN_TIMING_PATH, store)
  }
  return true
}

export function writeRouteContext({ cwd, skillName, sourceSkillName = skillName }) {
  ensureRuntimeDir()
  const context = {
    cwd: normalizePath(cwd),
    skillName,
    sourceSkillName,
    zeroSideEffect: skillName === 'idea',
    updatedAt: Date.now(),
  }
  writeFileSync(ROUTE_CONTEXT_PATH, `${JSON.stringify(context, null, 2)}\n`, 'utf-8')
}

export function readRouteContext() {
  if (!existsSync(ROUTE_CONTEXT_PATH)) return null

  try {
    const context = JSON.parse(readFileSync(ROUTE_CONTEXT_PATH, 'utf-8'))
    if (!context?.cwd || !context?.skillName || !context?.updatedAt) return null
    if (Date.now() - context.updatedAt > ROUTE_CONTEXT_TTL_MS) {
      clearRouteContext()
      return null
    }
    return {
      ...context,
      cwd: normalizePath(context.cwd),
    }
  } catch {
    return null
  }
}

export function getApplicableRouteContext({ cwd = '', filePath = '' } = {}) {
  const context = readRouteContext()
  if (!context) return null

  const normalizedCwd = normalizePath(cwd)
  if (normalizedCwd && normalizedCwd === context.cwd) {
    return context
  }

  const normalizedFilePath = normalizePath(filePath)
  if (
    normalizedFilePath
    && (
      normalizedFilePath === context.cwd
      || normalizedFilePath.startsWith(`${context.cwd}\\`)
      || normalizedFilePath.startsWith(`${context.cwd}/`)
    )
  ) {
    return context
  }

  return null
}
