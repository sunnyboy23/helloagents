// fullstack-config-advisor.mjs — Scan-first config suggestions.
//
// Solves the "service capability config over-relies on manual maintenance"
// problem: instead of only auto-filling when a field is empty, this produces
// an explicit suggestion diff (deps + catalog) on every run so the user can
// review and apply, and it detects cross-language service references (SCF / RPC
// / HTTP) that the Maven/Node dependency scanner cannot see.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

import { scanDependencies, scanServiceCatalog } from './fullstack-dep-scan.mjs'

function safeReadText(filePath) {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}

function listConfigFiles(projectPath) {
  const candidates = []
  const roots = [
    projectPath,
    join(projectPath, 'src', 'main', 'resources'),
    join(projectPath, 'config'),
    join(projectPath, 'conf'),
  ]
  roots.forEach((root) => {
    try {
      readdirSync(root, { withFileTypes: true }).forEach((entry) => {
        if (!entry.isFile()) return
        if (/\.(ya?ml|properties|json|toml|env)$/u.test(entry.name)) {
          candidates.push(join(root, entry.name))
        }
      })
    } catch {
      // directory may not exist; ignore
    }
  })
  return candidates
}

// Map a discovered service token (artifactId / package name / host segment)
// back to a known project path, so cross-language references become real edges.
function buildServiceTokenIndex(projectPaths) {
  const index = new Map()
  projectPaths.forEach((projectPath) => {
    const name = basename(projectPath)
    index.set(name.toLowerCase(), projectPath)
    // user-service → user, userservice
    const compact = name.replace(/[-_]/gu, '').toLowerCase()
    if (compact && compact !== name.toLowerCase()) index.set(compact, projectPath)
    const head = name.split(/[-_]/u)[0]
    if (head && head.length >= 3) index.set(head.toLowerCase(), projectPath)
  })
  return index
}

const SCF_HINT = /(scf|rpc|dubbo|feign|@reference|RpcClient|ServiceClient|srvmgr)/iu

// Detect cross-language service references from config + source hints.
// Returns { "<project>": { depends_on: [...], source: "..." } }
export function detectCrossLanguageDeps(projectPaths) {
  const tokenIndex = buildServiceTokenIndex(projectPaths)
  const deps = {}
  const evidence = {}

  projectPaths.forEach((projectPath) => {
    const self = projectPath
    const found = new Set()
    const hits = []

    const inspect = (text, label) => {
      if (!text) return
      // The RPC/SCF hint may live in the content OR the filename (e.g. scf.yaml).
      const looksRpc = SCF_HINT.test(text) || SCF_HINT.test(label)
      tokenIndex.forEach((ownerPath, token) => {
        if (ownerPath === self) return
        // Word-ish boundary match to avoid matching substrings inside other words.
        const re = new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, 'iu')
        if (re.test(text) && (looksRpc || text.toLowerCase().includes(`${token}/`) || text.toLowerCase().includes(`${token}.`))) {
          if (!found.has(ownerPath)) {
            found.add(ownerPath)
            hits.push({ depends_on: ownerPath, token, source: label })
          }
        }
      })
    }

    listConfigFiles(projectPath).forEach((filePath) => {
      inspect(safeReadText(filePath), basename(filePath))
    })

    if (found.size > 0) {
      deps[self] = { depends_on: [...found].sort() }
      evidence[self] = hits
    }
  })

  return { service_dependencies: deps, evidence }
}

function mergeDeps(base = {}, extra = {}) {
  const merged = {}
  const allKeys = new Set([...Object.keys(base), ...Object.keys(extra)])
  allKeys.forEach((key) => {
    const a = base[key]?.depends_on || []
    const b = extra[key]?.depends_on || []
    const combined = [...new Set([...a, ...b])].sort()
    if (combined.length) merged[key] = { depends_on: combined }
  })
  return merged
}

function diffDeps(current = {}, suggested = {}) {
  const added = []
  Object.entries(suggested).forEach(([project, info]) => {
    const currentEdges = current[project]?.depends_on || []
    ;(info.depends_on || []).forEach((edge) => {
      if (!currentEdges.includes(edge)) added.push({ project, depends_on: edge })
    })
  })
  return added
}

function diffCatalog(current = {}, suggested = {}) {
  const changes = []
  Object.entries(suggested).forEach(([project, entry]) => {
    const existing = current[project]
    if (!existing) {
      changes.push({ project, kind: 'new', fields: Object.keys(entry).filter((k) => !k.startsWith('_')) })
      return
    }
    // Only suggest promoting auto-generated entries or filling empty semantic fields.
    const fillable = []
    ;['service_summary', 'business_scope', 'owned_capabilities'].forEach((field) => {
      const value = existing[field]
      const isEmpty = !value || (Array.isArray(value) && value.length === 0)
      const suggestedValue = entry[field]
      const hasSuggestion = suggestedValue && (!Array.isArray(suggestedValue) || suggestedValue.length > 0)
      if (isEmpty && hasSuggestion) fillable.push(field)
    })
    if (fillable.length) changes.push({ project, kind: 'fill', fields: fillable })
  })
  return changes
}

// Produce a full suggestion diff without mutating config. The CLI decides
// whether to apply (--apply) after the user reviews it.
export function buildConfigSuggestions(config, projectPaths) {
  const paths = (projectPaths || []).filter(Boolean)
  const currentDeps = config.service_dependencies || {}
  const currentCatalog = config.service_catalog || {}

  const buildScan = paths.length > 1 ? scanDependencies(paths) : { service_dependencies: {} }
  const crossLang = detectCrossLanguageDeps(paths)
  const suggestedDeps = mergeDeps(buildScan.service_dependencies || {}, crossLang.service_dependencies || {})

  const catalogScan = scanServiceCatalog(paths, currentCatalog)
  const suggestedCatalog = catalogScan.service_catalog || currentCatalog

  const depAdditions = diffDeps(currentDeps, suggestedDeps)
  const catalogChanges = diffCatalog(currentCatalog, suggestedCatalog)

  return {
    success: true,
    projects_considered: paths,
    dependency_additions: depAdditions,
    dependency_evidence: crossLang.evidence,
    catalog_changes: catalogChanges,
    has_suggestions: depAdditions.length > 0 || catalogChanges.length > 0,
    suggested_service_dependencies: mergeDeps(currentDeps, suggestedDeps),
    suggested_service_catalog: suggestedCatalog,
  }
}
