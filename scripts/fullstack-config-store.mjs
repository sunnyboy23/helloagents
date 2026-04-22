import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

const DEFAULT_ENGINEER_SPECS = [
  ['fe-react-main', 'frontend-react', 'React 前端工程师'],
  ['fe-vue-main', 'frontend-vue', 'Vue 前端工程师'],
  ['be-java-main', 'backend-java', 'Java 后端工程师'],
  ['be-python-main', 'backend-python', 'Python 后端工程师'],
  ['be-go-main', 'backend-go', 'Go 后端工程师'],
  ['be-nodejs-main', 'backend-nodejs', 'Node.js 后端工程师'],
  ['mobile-ios-main', 'mobile-ios', 'iOS 工程师'],
  ['mobile-android-main', 'mobile-android', 'Android 工程师'],
  ['mobile-harmony-main', 'mobile-harmony', '鸿蒙工程师'],
]

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function parseScalar(rawValue) {
  const value = String(rawValue || '').trim()
  if (!value) return ''
  if (value === '{}') return {}
  if (value === '[]') return []
  if (value === 'null' || value === '~') return null
  if (value === 'true') return true
  if (value === 'false') return false
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return stripQuotes(value)
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(',').map((item) => parseScalar(item.trim()))
  }
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10)
  if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value)
  return value
}

function splitKeyValue(text) {
  const index = text.indexOf(':')
  if (index === -1) return [text.trim(), '']
  return [stripQuotes(text.slice(0, index).trim()), text.slice(index + 1).trim()]
}

function parseYamlFallback(content) {
  const lines = content
    .split(/\r?\n/u)
    .map((raw) => {
      const stripped = raw.trim()
      if (!stripped || stripped.startsWith('#')) return null
      return {
        indent: raw.length - raw.trimStart().length,
        text: stripped,
      }
    })
    .filter(Boolean)

  function parseMapping(index, indent) {
    const data = {}
    let i = index
    while (i < lines.length) {
      const { indent: lineIndent, text } = lines[i]
      if (lineIndent < indent || lineIndent > indent || text.startsWith('- ')) break
      const [key, value] = splitKeyValue(text)
      i += 1
      if (value) {
        data[key] = parseScalar(value)
        continue
      }
      if (i < lines.length && lines[i].indent > lineIndent) {
        const [nested, nextIndex] = parseBlock(i, lines[i].indent)
        data[key] = nested
        i = nextIndex
      } else {
        data[key] = {}
      }
    }
    return [data, i]
  }

  function parseList(index, indent) {
    const items = []
    let i = index
    while (i < lines.length) {
      const { indent: lineIndent, text } = lines[i]
      if (lineIndent !== indent || !text.startsWith('- ')) break
      const itemText = text.slice(2).trim()
      i += 1

      if (itemText.includes(':')) {
        const [key, value] = splitKeyValue(itemText)
        const item = {}
        if (value) {
          item[key] = parseScalar(value)
        } else if (i < lines.length && lines[i].indent > indent) {
          const [nested, nextIndex] = parseBlock(i, lines[i].indent)
          item[key] = nested
          i = nextIndex
        } else {
          item[key] = {}
        }

        if (i < lines.length && lines[i].indent > indent && !lines[i].text.startsWith('- ')) {
          const [extra, nextIndex] = parseMapping(i, lines[i].indent)
          Object.assign(item, extra)
          i = nextIndex
        }
        items.push(item)
        continue
      }

      if (itemText) {
        items.push(parseScalar(itemText))
        continue
      }

      if (i < lines.length && lines[i].indent > indent) {
        const [nested, nextIndex] = parseBlock(i, lines[i].indent)
        items.push(nested)
        i = nextIndex
      } else {
        items.push(null)
      }
    }
    return [items, i]
  }

  function parseBlock(index, indent) {
    if (index >= lines.length) return [{}, index]
    if (lines[index].text.startsWith('- ')) return parseList(index, indent)
    return parseMapping(index, indent)
  }

  if (!lines.length) return {}
  const [parsed] = parseBlock(0, lines[0].indent)
  return Array.isArray(parsed) ? { root: parsed } : parsed
}

function formatYamlScalar(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return `[${value.map((item) => formatYamlScalar(item)).join(', ')}]`
  const text = String(value)
  if (!text || /[:#{}\[\]]/u.test(text) || text.trim() !== text) {
    return JSON.stringify(text)
  }
  return text
}

function renderYamlLines(data, indent = 0) {
  const space = ' '.repeat(indent)
  if (Array.isArray(data)) {
    if (!data.length) return [`${space}[]`]
    return data.flatMap((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const keys = Object.keys(item)
        if (!keys.length) return [`${space}- {}`]
        const firstKey = keys[0]
        const firstValue = item[firstKey]
        const lines = []
        if (firstValue && typeof firstValue === 'object') {
          if (Array.isArray(firstValue) && !firstValue.length) {
            lines.push(`${space}- ${firstKey}: []`)
          } else if (!Array.isArray(firstValue) && !Object.keys(firstValue).length) {
            lines.push(`${space}- ${firstKey}: {}`)
          } else {
            lines.push(`${space}- ${firstKey}:`)
            lines.push(...renderYamlLines(firstValue, indent + 4))
          }
        } else {
          lines.push(`${space}- ${firstKey}: ${formatYamlScalar(firstValue)}`)
        }
        keys.slice(1).forEach((key) => {
          const value = item[key]
          const keyPrefix = ' '.repeat(indent + 2)
          if (value && typeof value === 'object') {
            if (Array.isArray(value) && !value.length) {
              lines.push(`${keyPrefix}${key}: []`)
            } else if (!Array.isArray(value) && !Object.keys(value).length) {
              lines.push(`${keyPrefix}${key}: {}`)
            } else {
              lines.push(`${keyPrefix}${key}:`)
              lines.push(...renderYamlLines(value, indent + 4))
            }
          } else {
            lines.push(`${keyPrefix}${key}: ${formatYamlScalar(value)}`)
          }
        })
        return lines
      }
      if (Array.isArray(item)) return [`${space}-`, ...renderYamlLines(item, indent + 2)]
      return [`${space}- ${formatYamlScalar(item)}`]
    })
  }

  if (data && typeof data === 'object') {
    const entries = Object.entries(data)
    if (!entries.length) return [`${space}{}`]
    return entries.flatMap(([key, value]) => {
      if (value && typeof value === 'object') {
        if (Array.isArray(value) && !value.length) return [`${space}${key}: []`]
        if (!Array.isArray(value) && !Object.keys(value).length) return [`${space}${key}: {}`]
        return [`${space}${key}:`, ...renderYamlLines(value, indent + 2)]
      }
      return [`${space}${key}: ${formatYamlScalar(value)}`]
    })
  }

  return [`${space}${formatYamlScalar(data)}`]
}

function dumpYamlFallback(data) {
  return `${renderYamlLines(data).join('\n')}\n`
}

function parseConfigContent(content) {
  const text = String(content || '').trim()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return parseYamlFallback(text)
  }
}

export function buildDefaultFullstackConfig() {
  return {
    version: '1.0',
    mode: 'fullstack',
    engineers: DEFAULT_ENGINEER_SPECS.map(([id, type, name]) => ({ id, type, name, projects: [] })),
    service_dependencies: {},
    service_catalog: {},
    orchestrator: {
      auto_sync_tech_docs: true,
      parallel_execution: true,
      backend_first: true,
      max_parallel_engineers: 4,
      auto_init_project_kb: true,
      cross_service_analysis: true,
    },
    tech_doc_templates: {
      api_contract: 'templates/api_contract.md',
      database_design: 'templates/database_design.md',
      architecture: 'templates/architecture.md',
      technical_solution: 'templates/technical_solution.md',
      task_breakdown: 'templates/fullstack_tasks.md',
      agent_assignment: 'templates/fullstack_agents.md',
      upstream_index: 'templates/fullstack_upstream.md',
    },
  }
}

export function loadConfig(configPath) {
  if (!existsSync(configPath)) {
    return { error: `Config file not found: ${configPath}` }
  }
  try {
    return parseConfigContent(readFileSync(configPath, 'utf-8'))
  } catch (error) {
    return { error: `Failed to parse config: ${error.message}` }
  }
}

export function saveConfig(configPath, config) {
  try {
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, dumpYamlFallback(config), 'utf-8')
    return [true, null]
  } catch (error) {
    return [false, error.message]
  }
}

export function validateConfig(config) {
  const errors = []
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    errors.push('Config root must be an object')
    return [false, errors]
  }
  if (!('version' in config)) errors.push('Missing required field: version')
  if (!('mode' in config)) errors.push('Missing required field: mode')
  else if (config.mode !== 'fullstack') errors.push(`Invalid mode: ${config.mode}, expected 'fullstack'`)

  if (!('engineers' in config)) {
    errors.push('Missing required field: engineers')
  } else if (!Array.isArray(config.engineers)) {
    errors.push("Field 'engineers' must be a list")
  } else {
    config.engineers.forEach((engineer, index) => {
      if (!engineer || typeof engineer !== 'object' || Array.isArray(engineer)) {
        errors.push(`Engineer ${index}: must be an object`)
        return
      }
      if (!('id' in engineer)) errors.push(`Engineer ${index}: missing 'id'`)
      if (!('type' in engineer)) errors.push(`Engineer ${index}: missing 'type'`)
      if (!('projects' in engineer)) errors.push(`Engineer ${index}: missing 'projects'`)
      else if (!Array.isArray(engineer.projects)) errors.push(`Engineer ${index}: 'projects' must be a list`)
    })
  }

  const serviceCatalog = config.service_catalog || {}
  if (serviceCatalog && (typeof serviceCatalog !== 'object' || Array.isArray(serviceCatalog))) {
    errors.push("Field 'service_catalog' must be a mapping")
  } else {
    Object.entries(serviceCatalog).forEach(([projectPath, profile]) => {
      if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
        errors.push(`service_catalog[${projectPath}] must be an object`)
        return
      }
      if ('service_summary' in profile && typeof profile.service_summary !== 'string') {
        errors.push(`service_catalog[${projectPath}].service_summary must be a string`)
      }
      if ('business_scope' in profile && !Array.isArray(profile.business_scope)) {
        errors.push(`service_catalog[${projectPath}].business_scope must be a list`)
      }
      if ('architecture' in profile && (typeof profile.architecture !== 'object' || Array.isArray(profile.architecture))) {
        errors.push(`service_catalog[${projectPath}].architecture must be an object`)
      }
    })
  }

  return [errors.length === 0, errors]
}

export function normalizeProjectPath(projectPath) {
  return resolve(String(projectPath || '').trim())
}

export function findEngineer(config, engineerId) {
  return (config.engineers || []).find((engineer) => engineer.id === engineerId) || null
}

export function findProjectOwner(config, projectPath) {
  const target = normalizeProjectPath(projectPath)
  for (const engineer of config.engineers || []) {
    for (const project of engineer.projects || []) {
      if (project.path && normalizeProjectPath(project.path) === target) {
        return [engineer, project]
      }
    }
  }
  return null
}

export function getServiceProfile(config, projectPath) {
  const target = normalizeProjectPath(projectPath)
  const catalog = config.service_catalog || {}
  for (const [declaredPath, profile] of Object.entries(catalog)) {
    if (normalizeProjectPath(declaredPath) === target) return profile && typeof profile === 'object' ? profile : {}
  }
  return {}
}

export function bindProject(
  config,
  projectPath,
  engineerId,
  { description = null, techStack = [], autoInitKb = true, allowRebind = false } = {},
) {
  const engineer = findEngineer(config, engineerId)
  if (!engineer) {
    return { success: false, error: `Engineer not found: ${engineerId}` }
  }

  const existing = findProjectOwner(config, projectPath)
  if (existing) {
    const [currentEngineer, currentProject] = existing
    if (currentEngineer.id === engineerId) {
      return {
        success: true,
        updated: false,
        message: 'Project already bound to target engineer',
        engineer_id: engineerId,
        project: currentProject,
      }
    }
    if (!allowRebind) {
      return {
        success: false,
        error: 'Project already bound to another engineer. Use --allow-rebind to move binding.',
        current_engineer_id: currentEngineer.id,
        current_engineer_type: currentEngineer.type,
      }
    }
    currentEngineer.projects = (currentEngineer.projects || []).filter(
      (item) => normalizeProjectPath(item.path || '') !== normalizeProjectPath(projectPath),
    )
  }

  const resolvedPath = normalizeProjectPath(projectPath)
  const project = {
    path: resolvedPath,
    description: description || basename(resolvedPath),
    tech_stack: techStack,
    auto_init_kb: autoInitKb,
  }
  engineer.projects = engineer.projects || []
  engineer.projects.push(project)

  return {
    success: true,
    updated: true,
    engineer_id: engineerId,
    engineer_type: engineer.type,
    project,
  }
}

export function unbindProject(config, projectPath) {
  const owner = findProjectOwner(config, projectPath)
  if (!owner) return { success: false, error: 'Project binding not found' }
  const [engineer] = owner
  const target = normalizeProjectPath(projectPath)
  const before = (engineer.projects || []).length
  engineer.projects = (engineer.projects || []).filter(
    (item) => normalizeProjectPath(item.path || '') !== target,
  )
  return {
    success: true,
    removed: before !== engineer.projects.length,
    engineer_id: engineer.id,
    engineer_type: engineer.type,
    project_path: target,
  }
}

export function listEngineers(config) {
  return (config.engineers || []).map((engineer) => ({
    id: engineer.id,
    type: engineer.type,
    name: engineer.name,
    project_count: (engineer.projects || []).length,
    projects: (engineer.projects || []).map((project) => project.path),
  }))
}
