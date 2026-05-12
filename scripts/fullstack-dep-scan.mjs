#!/usr/bin/env node
// fullstack-dep-scan.mjs — Scan bound projects' pom.xml/package.json to detect cross-project dependencies
// Zero external dependencies, ES module

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, basename, relative } from 'node:path'

function safeReadText(filePath) {
  try { return readFileSync(filePath, 'utf-8') } catch { return '' }
}

function extractPomCoordinates(pomContent) {
  const groupId = (pomContent.match(/<groupId>([^<]+)<\/groupId>/u) || [])[1] || ''
  const artifactId = (pomContent.match(/<artifactId>([^<]+)<\/artifactId>/u) || [])[1] || ''
  return { groupId, artifactId }
}

function extractPomModules(pomContent) {
  return [...pomContent.matchAll(/<module>([^<]+)<\/module>/gu)].map((m) => m[1])
}

function extractPomDependencies(pomContent) {
  const deps = []
  const depBlockRegex = /<dependencies>([\s\S]*?)<\/dependencies>/gu
  for (const block of pomContent.matchAll(depBlockRegex)) {
    const depRegex = /<dependency>([\s\S]*?)<\/dependency>/gu
    for (const dep of block[1].matchAll(depRegex)) {
      const groupId = (dep[1].match(/<groupId>([^<]+)<\/groupId>/u) || [])[1] || ''
      const artifactId = (dep[1].match(/<artifactId>([^<]+)<\/artifactId>/u) || [])[1] || ''
      if (groupId && artifactId) deps.push({ groupId, artifactId })
    }
  }
  return deps
}

function isInternalGroupId(groupId) {
  return groupId.startsWith('com.zhuanzhuan') || groupId.startsWith('com.bj58.zhuanzhuan')
}

function scanMavenProject(projectPath) {
  const rootPom = safeReadText(join(projectPath, 'pom.xml'))
  if (!rootPom) return null

  const root = extractPomCoordinates(rootPom)
  const modules = extractPomModules(rootPom)
  const artifacts = []

  if (modules.length > 0) {
    for (const mod of modules) {
      const modPom = safeReadText(join(projectPath, mod, 'pom.xml'))
      if (!modPom) continue
      const coords = extractPomCoordinates(modPom)
      artifacts.push({ module: mod, ...coords })
    }
  } else {
    artifacts.push({ module: '.', ...root })
  }

  const allDeps = []
  const pomFiles = modules.length > 0
    ? modules.map((mod) => join(projectPath, mod, 'pom.xml'))
    : [join(projectPath, 'pom.xml')]

  for (const pomFile of pomFiles) {
    const content = safeReadText(pomFile)
    if (!content) continue
    const deps = extractPomDependencies(content)
    for (const dep of deps) {
      if (isInternalGroupId(dep.groupId)) {
        allDeps.push(dep)
      }
    }
  }

  return {
    type: 'maven',
    path: projectPath,
    groupId: root.groupId,
    artifactId: root.artifactId,
    modules,
    publishedArtifacts: artifacts,
    internalDependencies: allDeps,
  }
}

function scanNodeProject(projectPath) {
  const pkgPath = join(projectPath, 'package.json')
  const content = safeReadText(pkgPath)
  if (!content) return null

  let pkg
  try { pkg = JSON.parse(content) } catch { return null }

  const name = pkg.name || basename(projectPath)
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  }

  return {
    type: 'node',
    path: projectPath,
    name,
    publishedArtifacts: [{ module: '.', name }],
    dependencies: Object.keys(allDeps || {}),
  }
}

function scanProject(projectPath) {
  if (existsSync(join(projectPath, 'pom.xml'))) return scanMavenProject(projectPath)
  if (existsSync(join(projectPath, 'package.json'))) return scanNodeProject(projectPath)
  return null
}

function buildArtifactIndex(scannedProjects) {
  const index = new Map()
  for (const project of scannedProjects) {
    if (!project) continue
    for (const artifact of project.publishedArtifacts) {
      if (project.type === 'maven') {
        const key = `${artifact.groupId}:${artifact.artifactId}`
        index.set(key, project.path)
      } else if (project.type === 'node') {
        index.set(artifact.name, project.path)
      }
    }
  }
  return index
}

function resolveProjectDependencies(scannedProjects) {
  const artifactIndex = buildArtifactIndex(scannedProjects)
  const dependencies = {}

  for (const project of scannedProjects) {
    if (!project) continue
    const dependsOn = new Set()

    if (project.type === 'maven') {
      for (const dep of project.internalDependencies) {
        const key = `${dep.groupId}:${dep.artifactId}`
        const ownerPath = artifactIndex.get(key)
        if (ownerPath && ownerPath !== project.path) {
          dependsOn.add(ownerPath)
        }
      }
    } else if (project.type === 'node') {
      for (const depName of project.dependencies) {
        const ownerPath = artifactIndex.get(depName)
        if (ownerPath && ownerPath !== project.path) {
          dependsOn.add(ownerPath)
        }
      }
    }

    if (dependsOn.size > 0) {
      dependencies[project.path] = { depends_on: [...dependsOn].sort() }
    }
  }

  return dependencies
}

function detectCycles(dependencies) {
  const cycles = []
  const visited = new Set()
  const inStack = new Set()

  function dfs(node, stack) {
    visited.add(node)
    inStack.add(node)
    stack.push(node)

    const deps = dependencies[node]?.depends_on || []
    for (const dep of deps) {
      if (!(dep in dependencies) && !Object.keys(dependencies).some((k) => dependencies[k]?.depends_on?.includes(dep))) continue
      if (!visited.has(dep)) {
        dfs(dep, stack)
      } else if (inStack.has(dep)) {
        const idx = stack.indexOf(dep)
        cycles.push([...stack.slice(idx), dep])
      }
    }

    stack.pop()
    inStack.delete(node)
  }

  const allNodes = new Set(Object.keys(dependencies))
  for (const deps of Object.values(dependencies)) {
    for (const d of deps.depends_on || []) allNodes.add(d)
  }

  for (const node of allNodes) {
    if (!visited.has(node)) dfs(node, [])
  }

  return cycles
}

export function scanDependencies(projectPaths) {
  const scanned = projectPaths.map((p) => scanProject(p))
  const dependencies = resolveProjectDependencies(scanned.filter(Boolean))
  const cycles = detectCycles(dependencies)

  const projectDetails = scanned.filter(Boolean).map((p) => ({
    path: p.path,
    type: p.type,
    name: p.type === 'maven' ? p.artifactId : p.name,
    publishedArtifacts: p.publishedArtifacts.map((a) =>
      p.type === 'maven' ? `${a.groupId}:${a.artifactId}` : a.name
    ),
    depends_on: dependencies[p.path]?.depends_on || [],
  }))

  return {
    success: true,
    projects_scanned: scanned.filter(Boolean).length,
    service_dependencies: dependencies,
    cycles,
    has_cycle: cycles.length > 0,
    project_details: projectDetails,
    suggestion: cycles.length > 0
      ? '检测到循环依赖，建议将互相依赖的服务放在同一执行层级（移除其中一个方向的 depends_on）'
      : null,
  }
}

const REFERENCE_DOC_CANDIDATES = ['AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md', 'README.md', 'README_CN.md']

function loadProjectDocs(projectPath) {
  for (const candidate of REFERENCE_DOC_CANDIDATES) {
    const filePath = join(projectPath, candidate)
    const content = safeReadText(filePath)
    if (content && content.length > 20) return { path: candidate, content }
  }
  return null
}

function extractSummaryLine(content) {
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim().replace(/^[#>*\-]+\s*/u, '').replace(/\*\*/gu, '').trim()
    if (!line || line.length < 8) continue
    if (/^(agents\.md|readme\.md|claude\.md|目录|project|usage)/iu.test(line)) continue
    if (/^https?:\/\//u.test(line)) continue
    if (/^[<!\[|`{]/u.test(line)) continue
    if (/this file provides guidance/iu.test(line)) continue
    if (/如仓库根目录存在/u.test(line)) continue
    if (/^(when working with|instructions for)/iu.test(line)) continue
    if (/详细的.*配置见本文件/u.test(line)) continue
    if (/^[\d]+\./u.test(line) && /模板|端口|修改|参数/u.test(line)) continue
    if (/由于.*参数.*需要.*修改/u.test(line)) continue
    if (/^\|---/u.test(line) || /^\/\//u.test(line)) continue
    if (/contract.*接口|pom\.xml|src\//u.test(line)) continue
    return line.slice(0, 150)
  }
  return ''
}

function extractBullets(content, limit = 10) {
  const bullets = []
  for (const rawLine of content.split(/\r?\n/u)) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const item = trimmed.slice(2).trim()
      if (item && item.length >= 4 && !/^https?:\/\//u.test(item)) bullets.push(item)
    } else if (/^\d+\.\s+/u.test(trimmed)) {
      const item = trimmed.replace(/^\d+\.\s+/u, '').trim()
      if (item && item.length >= 4 && !/^https?:\/\//u.test(item)) bullets.push(item)
    }
    if (bullets.length >= limit) break
  }
  return bullets
}

function extractSections(content) {
  const sections = {}
  let currentHeading = ''
  for (const rawLine of content.split(/\r?\n/u)) {
    const headingMatch = rawLine.match(/^#{1,3}\s+(.+)/u)
    if (headingMatch) {
      currentHeading = headingMatch[1].trim().toLowerCase()
      sections[currentHeading] = []
    } else if (currentHeading && rawLine.trim()) {
      sections[currentHeading].push(rawLine.trim())
    }
  }
  return sections
}

function inferServiceType(projectPath, pomContent) {
  if (!pomContent) {
    if (existsSync(join(projectPath, 'package.json'))) {
      const pkg = safeReadText(join(projectPath, 'package.json'))
      if (pkg.includes('next') || pkg.includes('nuxt')) return 'bff'
      return 'frontend'
    }
    return 'unknown'
  }
  const packaging = (pomContent.match(/<packaging>([^<]+)<\/packaging>/u) || [])[1] || 'jar'
  if (packaging === 'war') return 'adapter'
  const modules = [...pomContent.matchAll(/<module>([^<]+)<\/module>/gu)].map((m) => m[1])
  if (modules.includes('contract') || modules.includes('service')) return 'domain'
  return 'service'
}

function inferKeyModules(projectPath) {
  const pomContent = safeReadText(join(projectPath, 'pom.xml'))
  if (pomContent) {
    const modules = [...pomContent.matchAll(/<module>([^<]+)<\/module>/gu)].map((m) => m[1])
    if (modules.length > 0) return modules
  }
  const srcPages = join(projectPath, 'src', 'pages')
  const srcApp = join(projectPath, 'src', 'app')
  if (existsSync(srcPages)) {
    try {
      return readdirSync(srcPages, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .slice(0, 10)
    } catch { return ['pages'] }
  }
  if (existsSync(srcApp)) {
    try {
      return readdirSync(srcApp, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .slice(0, 10)
    } catch { return ['app'] }
  }
  return []
}

function inferEntrypoints(projectPath, pomContent) {
  if (existsSync(join(projectPath, 'AGENTS.md'))) return ['AGENTS.md']
  if (existsSync(join(projectPath, 'README.md'))) return ['README.md']
  return []
}

function buildCatalogEntry(projectPath, scannedProject) {
  const doc = loadProjectDocs(projectPath)
  const pomContent = safeReadText(join(projectPath, 'pom.xml'))
  const serviceType = inferServiceType(projectPath, pomContent)
  const entrypoints = inferEntrypoints(projectPath, pomContent)

  let serviceSummary = ''
  let businessScope = []
  let ownedCapabilities = []

  if (doc) {
    serviceSummary = extractSummaryLine(doc.content)
    const bullets = extractBullets(doc.content)
    const sections = extractSections(doc.content)

    if (!serviceSummary || serviceSummary.length < 10) {
      serviceSummary = ''
    }

    const scopeKeywords = ['功能', '能力', '职责', '负责', '模块', 'feature', 'capability', 'module', 'scope']
    for (const [heading, lines] of Object.entries(sections)) {
      if (scopeKeywords.some((kw) => heading.includes(kw))) {
        businessScope = lines
          .filter((l) => l.startsWith('- ') || l.startsWith('* '))
          .map((l) => l.replace(/^[-*]\s*/u, '').trim())
          .filter((l) => l.length >= 4)
          .slice(0, 12)
        break
      }
    }

    if (businessScope.length === 0 && bullets.length > 0) {
      businessScope = bullets
        .filter((b) => !/\$\{|pom\.xml|src\/|端口|port|修改|配置文件/iu.test(b))
        .slice(0, 8)
    }

    const capKeywords = ['能力', 'capability', 'api', '接口', 'service', '服务']
    for (const [heading, lines] of Object.entries(sections)) {
      if (capKeywords.some((kw) => heading.includes(kw)) && heading !== Object.keys(sections)[0]) {
        ownedCapabilities = lines
          .filter((l) => l.startsWith('- ') || l.startsWith('* '))
          .map((l) => l.replace(/^[-*]\s*/u, '').trim())
          .filter((l) => l.length >= 2 && l.length <= 40)
          .slice(0, 10)
        break
      }
    }
  }

  if (!serviceSummary && scannedProject) {
    serviceSummary = scannedProject.type === 'maven'
      ? `${scannedProject.artifactId} 服务`
      : `${scannedProject.name} 项目`
  }

  return {
    service_type: serviceType,
    service_summary: serviceSummary,
    business_scope: businessScope,
    owned_capabilities: ownedCapabilities,
    architecture: {
      style: serviceType === 'domain' ? 'layered' : serviceType === 'adapter' ? 'layered' : 'modular',
      entrypoints,
      key_modules: scannedProject?.modules || [],
    },
    write_authority: [],
    read_authority: [],
    bounded_context: '',
    anti_capabilities: [],
    _auto_generated: true,
    _source: doc ? doc.path : 'project-structure',
  }
}

export function scanServiceCatalog(projectPaths, existingCatalog = {}) {
  const catalog = { ...existingCatalog }
  const generated = []

  for (const projectPath of projectPaths) {
    if (catalog[projectPath] && !catalog[projectPath]._auto_generated) continue

    const scannedProject = scanProject(projectPath)
    const entry = buildCatalogEntry(projectPath, scannedProject)
    if (entry.service_summary || entry.business_scope.length > 0) {
      catalog[projectPath] = entry
      generated.push(projectPath)
    }
  }

  return {
    success: true,
    service_catalog: catalog,
    generated_count: generated.length,
    generated_projects: generated,
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    process.stdout.write(JSON.stringify({
      success: false,
      error: 'Usage: fullstack-dep-scan.mjs <project_path1> [project_path2] ...',
    }))
    return
  }

  const result = scanDependencies(args)
  process.stdout.write(JSON.stringify(result, null, 2))
}

const isEntry = process.argv[1] && (
  process.argv[1].endsWith('fullstack-dep-scan.mjs')
  || process.argv[1].includes('fullstack-dep-scan')
)
if (isEntry) main()
