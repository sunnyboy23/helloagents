import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  findProjectOwner,
  getServiceProfile,
  normalizeProjectPath,
} from './fullstack-config-store.mjs'

const KB_ROLE_SCAN_FILES = [
  'context.md',
  'modules/_index.md',
  'api/upstream/_index.md',
  'INDEX.md',
]

const CAPABILITY_STOPWORDS = new Set([
  '项目',
  '模块',
  '目录',
  '说明',
  '索引',
  '文档',
  '功能',
  '服务',
  '接口',
  '上游',
  '下游',
  '知识库',
  '自动生成',
])

function safeReadText(filePath) {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}

function pickSummaryFromText(content = '') {
  for (const rawLine of String(content).split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line) continue
    if (/^(#|>|```|\||- |\* )/u.test(line)) continue
    if (/^[-=*_`~\s]+$/u.test(line)) continue
    if (line.length < 6) continue
    return line.replace(/\s+/gu, ' ').slice(0, 120)
  }
  return ''
}

function normalizeCapabilityToken(token = '') {
  return String(token)
    .trim()
    .replace(/^[\-\*\d.()【】[\]\s]+/gu, '')
    .replace(/`/gu, '')
    .replace(/\(.*?\)/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/^[ :：;；,.，。|]+|[ :：;；,.，。|]+$/gu, '')
}

function extractCapabilities(...contents) {
  const ranked = new Map()

  const addToken = (token, score) => {
    const item = normalizeCapabilityToken(token)
    if (!item) return
    if (item.length < 2 || item.length > 28) return
    if (CAPABILITY_STOPWORDS.has(item)) return
    ranked.set(item, (ranked.get(item) || 0) + score)
  }

  contents.forEach((content) => {
    String(content || '').split(/\r?\n/u).forEach((rawLine) => {
      const line = rawLine.trim()
      if (!line) return

      if (line.startsWith('##')) {
        addToken(line.replace(/^#+/u, '').trim(), 3)
        return
      }

      if (line.startsWith('- ') || line.startsWith('* ')) {
        line.slice(2).trim().split(/[、,，/|；;]/u).forEach((part) => addToken(part, 2))
      }

      if (line.includes(':') || line.includes('：')) {
        const normalized = line.replace(/：/gu, ':')
        const [left, right = ''] = normalized.split(':', 2)
        addToken(left, 1)
        right.split(/[、,，/|；;]/u).forEach((part) => addToken(part, 1))
      }
    })
  })

  return [...ranked.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([item]) => item)
}

function extractRelations(contextText = '', upstreamIndexText = '') {
  const upstream = []
  const downstream = []

  const addUnique = (bucket, value) => {
    const normalized = String(value || '').trim()
    if (!normalized || bucket.includes(normalized)) return
    bucket.push(normalized)
  }

  String(upstreamIndexText).split(/\r?\n/u).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) return
    const cells = trimmed.slice(1, -1).split('|').map((item) => item.trim())
    if (cells.length < 2) return
    if (cells[0] === '文件' || cells[0] === 'File') return
    if (/^[-: ]+$/u.test(cells[0])) return
    if (cells[1] && !['来源', '未知'].includes(cells[1])) addUnique(upstream, cells[1])
  })

  String(contextText).split(/\r?\n/u).forEach((rawLine) => {
    const line = rawLine.trim()
    if (!line) return
    const normalized = line.replace(/：/gu, ':')
    if (line.includes('上游') && normalized.includes(':')) {
      normalized.split(':', 2)[1].split(/[、,，/|；;]/u).forEach((part) => {
        addUnique(upstream, normalizeCapabilityToken(part))
      })
    }
    if (line.includes('下游') && normalized.includes(':')) {
      normalized.split(':', 2)[1].split(/[、,，/|；;]/u).forEach((part) => {
        addUnique(downstream, normalizeCapabilityToken(part))
      })
    }
  })

  return {
    upstream_services: upstream.slice(0, 6),
    downstream_services: downstream.slice(0, 6),
  }
}

export function inferProjectRoleFromKb(projectPath) {
  const projectRoot = normalizeProjectPath(projectPath)
  const kbRoot = join(projectRoot, '.helloagents')
  if (!existsSync(kbRoot)) {
    return {
      available: false,
      confidence: 0,
      summary: '',
      capabilities: [],
      upstream_services: [],
      downstream_services: [],
      source_files: [],
      reason: 'kb_not_found',
    }
  }

  const loadedTexts = {}
  KB_ROLE_SCAN_FILES.forEach((relativePath) => {
    const filePath = join(kbRoot, relativePath)
    if (!existsSync(filePath)) return
    const text = safeReadText(filePath)
    if (text) loadedTexts[relativePath] = text
  })

  if (!Object.keys(loadedTexts).length) {
    return {
      available: false,
      confidence: 0,
      summary: '',
      capabilities: [],
      upstream_services: [],
      downstream_services: [],
      source_files: [],
      reason: 'kb_files_empty',
    }
  }

  const contextText = loadedTexts['context.md'] || ''
  const indexText = loadedTexts['INDEX.md'] || ''
  const modulesText = loadedTexts['modules/_index.md'] || ''
  const upstreamText = loadedTexts['api/upstream/_index.md'] || ''
  const summary = pickSummaryFromText(contextText) || pickSummaryFromText(indexText)
  const capabilities = extractCapabilities(contextText, modulesText, indexText)
  const { upstream_services, downstream_services } = extractRelations(contextText, upstreamText)

  let confidence = 0.1
  if (summary) confidence += 0.35
  if (capabilities.length >= 2) confidence += 0.25
  if (upstream_services.length || downstream_services.length) confidence += 0.2
  if (Object.keys(loadedTexts).length >= 2) confidence += 0.1

  return {
    available: true,
    confidence: Math.min(Number(confidence.toFixed(2)), 0.95),
    summary,
    capabilities,
    upstream_services,
    downstream_services,
    source_files: Object.keys(loadedTexts).sort(),
    reason: 'ok',
  }
}

export function getAllProjects(config) {
  const projects = []
  ;(config.engineers || []).forEach((engineer) => {
    ;(engineer.projects || []).forEach((project) => {
      const projectPath = project.path
      const kbRoleProfile = projectPath
        ? inferProjectRoleFromKb(projectPath)
        : {
            available: false,
            confidence: 0,
            summary: '',
            capabilities: [],
            upstream_services: [],
            downstream_services: [],
            source_files: [],
            reason: 'missing_project_path',
          }

      const configuredDescription = String(project.description || '').trim()
      const kbSummary = String(kbRoleProfile.summary || '').trim()
      const description = configuredDescription || kbSummary || null
      const descriptionSource = configuredDescription ? 'configured' : (kbSummary ? 'kb' : 'empty')

      projects.push({
        path: projectPath,
        description,
        description_source: descriptionSource,
        tech_stack: project.tech_stack || [],
        auto_init_kb: project.auto_init_kb || false,
        engineer_id: engineer.id,
        engineer_type: engineer.type,
        engineer_name: engineer.name,
        role_confidence: kbRoleProfile.confidence || 0,
        capabilities: kbRoleProfile.capabilities || [],
        upstream_services: kbRoleProfile.upstream_services || [],
        downstream_services: kbRoleProfile.downstream_services || [],
        kb_role_profile: kbRoleProfile,
      })
    })
  })
  return projects
}

export function getServiceDependencies(config, projectPath) {
  const deps = config.service_dependencies || {}
  return (deps[projectPath] && deps[projectPath].depends_on) || []
}

export function getDownstreamProjects(config, projectPath) {
  const downstream = []
  const deps = config.service_dependencies || {}
  Object.entries(deps).forEach(([path, depInfo]) => {
    if ((depInfo.depends_on || []).includes(projectPath)) downstream.push(path)
  })
  return downstream
}

export function topologicalSort(projects, deps) {
  const inDegree = Object.fromEntries(projects.map((project) => [project, 0]))

  projects.forEach((project) => {
    ;((deps[project] && deps[project].depends_on) || []).forEach((dependency) => {
      if (dependency in inDegree) inDegree[project] += 1
    })
  })

  const layers = []
  const remaining = new Set(projects)
  while (remaining.size) {
    const layer = [...remaining].filter((project) => inDegree[project] === 0)
    if (!layer.length) {
      layers.push([...remaining])
      break
    }
    layers.push(layer)
    layer.forEach((project) => remaining.delete(project))
    ;[...remaining].forEach((project) => {
      ;((deps[project] && deps[project].depends_on) || []).forEach((dependency) => {
        if (layer.includes(dependency)) inDegree[project] -= 1
      })
    })
  }
  return layers
}

function buildTaskContract(config, project, deps, engineer) {
  const upstreamProjects = (((deps[project] || {}).depends_on) || []).filter(Boolean)
  const downstreamProjects = getDownstreamProjects(config, project)
  const engineerType = String(engineer.type || 'unknown')

  let riskLevel = 'medium'
  let verifyMode = 'standard'
  if (upstreamProjects.length || downstreamProjects.length) {
    riskLevel = 'high'
    verifyMode = 'cross_project'
  }
  if (engineerType.startsWith('backend-') && downstreamProjects.length) {
    riskLevel = 'high'
    verifyMode = 'api_contract_required'
  } else if (engineerType.startsWith('mobile-')) {
    verifyMode = 'integration_ready'
  }

  const reviewerFocus = ['依赖影响是否完整', '接口/文档是否同步', '是否满足上游前置条件']
  const testerFocus = ['关键路径可验证', '上下游联调风险已覆盖']
  const deliverables = ['代码变更摘要', '验证结果摘要']

  if (engineerType.startsWith('backend-')) {
    reviewerFocus.unshift('接口兼容性与下游影响')
    testerFocus.push('接口变更与回归验证')
    deliverables.push('API/技术文档同步项')
  } else if (engineerType.startsWith('frontend-')) {
    reviewerFocus.unshift('页面/交互是否适配上游契约')
    testerFocus.push('页面联调与回归验证')
    deliverables.push('页面适配说明')
  } else if (engineerType.startsWith('mobile-')) {
    reviewerFocus.unshift('端上集成与发布约束')
    testerFocus.push('真机/集成验证说明')
    deliverables.push('端上集成说明')
  }

  return {
    verify_mode: verifyMode,
    risk_level: riskLevel,
    reviewer_focus: reviewerFocus,
    tester_focus: testerFocus,
    deliverables: deliverables,
    upstream_projects: upstreamProjects,
    downstream_projects: downstreamProjects,
    upstream_contracts: upstreamProjects.map((upstream) => `${upstream}/.helloagents/api/upstream`),
  }
}

export function buildDispatchPlan(config, projects, deps) {
  const assignments = []
  const dispatchableProjects = []
  const unassignedProjects = []
  const groupedByEngineerType = {}

  ;[...new Set(projects)].sort().forEach((project) => {
    const owner = findProjectOwner(config, project)
    if (!owner) {
      assignments.push({ project, dispatchable: false, reason: 'no_bound_engineer' })
      unassignedProjects.push(project)
      return
    }

    const [engineer] = owner
    const taskContract = buildTaskContract(config, project, deps, engineer)
    assignments.push({
      project,
      dispatchable: true,
      engineer_id: engineer.id,
      engineer_type: engineer.type,
      engineer_name: engineer.name,
      task_contract: taskContract,
    })
    dispatchableProjects.push(project)
    if (!groupedByEngineerType[engineer.type || 'unknown']) {
      groupedByEngineerType[engineer.type || 'unknown'] = []
    }
    groupedByEngineerType[engineer.type || 'unknown'].push(project)
  })

  Object.keys(groupedByEngineerType).forEach((key) => {
    groupedByEngineerType[key] = [...new Set(groupedByEngineerType[key])].sort()
  })

  const warnings = []
  if (unassignedProjects.length) {
    warnings.push({
      type: 'missing_binding',
      blocking: false,
      message: '存在未绑定工程师的项目，将跳过这些项目并继续执行已可派发项目。',
      projects: [...new Set(unassignedProjects)].sort(),
      suggestion: '如需覆盖这些项目，请后续执行 bind/wizard-bind 补绑。',
    })
  }

  return {
    assignments,
    dispatchable_projects: [...new Set(dispatchableProjects)].sort(),
    unassigned_projects: [...new Set(unassignedProjects)].sort(),
    grouped_by_engineer_type: groupedByEngineerType,
    dispatch_execution_order: dispatchableProjects.length ? topologicalSort(dispatchableProjects, deps) : [],
    continue_execution: dispatchableProjects.length > 0,
    advisory_only_unassigned: true,
    warnings,
  }
}

export function analyzeImpact(config, affectedProjects) {
  const deps = config.service_dependencies || {}
  const allAffected = new Set(affectedProjects)

  const findDownstream = (project, visited) => {
    if (visited.has(project)) return
    visited.add(project)
    Object.entries(deps).forEach(([path, depInfo]) => {
      if ((depInfo.depends_on || []).includes(project)) {
        allAffected.add(path)
        findDownstream(path, visited)
      }
    })
  }

  const visited = new Set()
  affectedProjects.forEach((project) => findDownstream(project, visited))
  const allAffectedList = [...allAffected]

  return {
    directly_affected: affectedProjects,
    all_affected: allAffectedList,
    execution_order: topologicalSort(allAffectedList, deps),
    dispatch_plan: buildDispatchPlan(config, allAffectedList, deps),
  }
}

export function analyzeServiceOwnership(config, requirement, candidateProjects = null) {
  const catalog = config.service_catalog || {}
  const projects = candidateProjects || Object.keys(catalog) || getAllProjects(config).map((item) => item.path)
  const requirementLower = String(requirement || '').toLowerCase()

  const scored = projects.map((project) => {
    const profile = getServiceProfile(config, project)
    const reasons = []
    let score = 0
    const haystacks = [
      ...(profile.owned_capabilities || []),
      ...(profile.business_scope || []),
      profile.service_summary || '',
      ...(((profile.architecture || {}).entrypoints) || []),
      ...(((profile.architecture || {}).key_modules) || []),
    ]

    haystacks.forEach((item) => {
      const text = String(item || '').trim().toLowerCase()
      if (text && requirementLower.includes(text)) {
        score += 3
        reasons.push(`命中声明字段: ${item}`)
      }
    })

    const serviceType = profile.service_type
    if (['domain', 'workflow'].includes(serviceType) && /(rule|decision|workflow|domain|写入|执行)/u.test(requirementLower)) {
      score += 2
      reasons.push(`需求特征与 service_type=${serviceType} 匹配`)
    }
    if (['report', 'bff', 'client'].includes(serviceType) && /(query|report|history|read|list|page|查询|历史|报表|页面)/u.test(requirementLower)) {
      score += 2
      reasons.push(`需求特征与 service_type=${serviceType} 匹配`)
    }

    return { project, score, reasons, profile }
  }).sort((a, b) => b.score - a.score)

  const owner = scored[0] && scored[0].score > 0 ? scored[0] : null
  return {
    owner_service: owner ? owner.project : null,
    candidate_services: scored.filter((item) => item.score > 0).map((item) => item.project),
    rejected_services: scored.slice(1).filter((item) => item.score > 0).map((item) => item.project),
    ownership_reason: owner ? owner.reasons : ['缺少足够的 service_catalog 命中，需人工判断'],
    affected_projects_seed: owner ? [owner.project] : [],
  }
}

function findCycles(nodes, deps) {
  const visited = new Set()
  const stack = []
  const inStack = new Set()
  const cycles = []

  const dfs = (node) => {
    visited.add(node)
    stack.push(node)
    inStack.add(node)
    ;(((deps[node] || {}).depends_on) || []).forEach((dependency) => {
      if (!nodes.includes(dependency)) return
      if (!visited.has(dependency)) dfs(dependency)
      else if (inStack.has(dependency)) {
        const index = stack.indexOf(dependency)
        cycles.push([...stack.slice(index), dependency])
      }
    })
    stack.pop()
    inStack.delete(node)
  }

  nodes.forEach((node) => {
    if (!visited.has(node)) dfs(node)
  })
  return cycles
}

export function analyzeCrossProjectDependencies(config, seedProjects = null) {
  const allProjects = getAllProjects(config).map((item) => item.path).filter(Boolean)
  const deps = config.service_dependencies || {}
  const downstreamMap = Object.fromEntries(allProjects.map((project) => [project, []]))

  allProjects.forEach((project) => {
    ;(((deps[project] || {}).depends_on) || []).forEach((upstream) => {
      if (downstreamMap[upstream]) downstreamMap[upstream].push(project)
    })
  })

  let graphProjects = [...allProjects].sort()
  if (seedProjects && seedProjects.length) {
    const selected = new Set()
    const expandDownstream = (project) => {
      if (selected.has(project)) return
      selected.add(project)
      ;(downstreamMap[project] || []).forEach((downstream) => expandDownstream(downstream))
    }

    seedProjects.forEach((seed) => {
      expandDownstream(seed)
      allProjects.forEach((project) => {
        if ((((deps[project] || {}).depends_on) || []).includes(seed)) selected.add(project)
      })
    })
    graphProjects = [...selected].sort()
  }

  const layers = topologicalSort(graphProjects, deps)
  const cycles = findCycles(graphProjects, deps)
  const projectDetails = graphProjects.map((project) => {
    const upstream = (((deps[project] || {}).depends_on) || []).filter((dep) => graphProjects.includes(dep))
    const downstream = (downstreamMap[project] || []).filter((dep) => graphProjects.includes(dep))
    return {
      project,
      depends_on: upstream,
      downstream,
      upstream_count: upstream.length,
      downstream_count: downstream.length,
    }
  })

  return {
    scope: seedProjects && seedProjects.length ? 'partial' : 'all',
    seed_projects: seedProjects || [],
    projects_count: graphProjects.length,
    projects: graphProjects,
    layers,
    cycles,
    has_cycle: cycles.length > 0,
    project_details: projectDetails,
  }
}
