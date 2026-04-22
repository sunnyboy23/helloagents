import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { scanProject } from './fullstack-tech-scanner.mjs'

const TECH_STACK_TEMPLATES = {
  'spring-boot': 'java',
  spring: 'java',
  java: 'java',
  fastapi: 'python',
  django: 'python',
  flask: 'python',
  python: 'python',
  express: 'node',
  nestjs: 'node',
  koa: 'node',
  node: 'node',
  gin: 'go',
  echo: 'go',
  go: 'go',
  react: 'react',
  vue: 'vue',
  angular: 'angular',
  'next.js': 'react',
  nuxt: 'vue',
  swift: 'ios',
  swiftui: 'ios',
  ios: 'ios',
  kotlin: 'android',
  'jetpack-compose': 'android',
  android: 'android',
  arkts: 'harmony',
  harmonyos: 'harmony',
}

const CORE_KB_FILES = [
  'INDEX.md',
  'context.md',
  'guidelines.md',
  'CHANGELOG.md',
  'modules/_index.md',
]

const REFERENCE_DOC_CANDIDATES = [
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'README_CN.md',
  'docs/README.md',
]

function nowText() {
  const date = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function safeReadText(filePath) {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true })
}

function uniqueKeepOrder(items) {
  const seen = new Set()
  return items.filter((item) => {
    if (!item || seen.has(item)) return false
    seen.add(item)
    return true
  })
}

function cleanLine(line = '') {
  return String(line).replaceAll('`', '').trim().replace(/\s+/gu, ' ').replace(/^[ -:|]+|[ -:|]+$/gu, '')
}

function extractReferenceDocs(projectPath) {
  return REFERENCE_DOC_CANDIDATES
    .map((relativePath) => join(projectPath, relativePath))
    .filter((filePath) => existsSync(filePath))
}

function extractDocSummary(content = '') {
  for (const rawLine of content.split(/\r?\n/u)) {
    let line = cleanLine(rawLine)
    if (!line) continue
    if (/^(#|>|[*-]|\|)/u.test(rawLine.trim())) line = cleanLine(line.replace(/^[#>*-]+\s*/u, ''))
    if (!line || line.length < 6) continue
    if (['agents.md', 'readme.md', 'claude.md', 'to be continued...', 'to be continued'].includes(line.toLowerCase())) continue
    if (/^https?:\/\//u.test(line)) continue
    if (/^(usage|目录|project|项目结构)/iu.test(line)) continue
    return line.slice(0, 120)
  }
  return ''
}

function extractBulletsFromDoc(content = '', limit = 6) {
  const bullets = []
  for (const rawLine of content.split(/\r?\n/u)) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const item = cleanLine(trimmed.slice(2))
      if (item && item.length >= 4 && !/^https?:\/\//u.test(item)) bullets.push(item)
    } else if (/^\d+\.\s+/u.test(trimmed)) {
      const item = cleanLine(trimmed.replace(/^\d+\.\s+/u, ''))
      if (item && item.length >= 4 && !/^https?:\/\//u.test(item)) bullets.push(item)
    }
    if (bullets.length >= limit) break
  }
  return bullets
}

function loadReferenceNotes(projectPath) {
  return extractReferenceDocs(projectPath).map((filePath) => {
    const content = safeReadText(filePath)
    return {
      path: relative(projectPath, filePath),
      summary: extractDocSummary(content),
      bullets: extractBulletsFromDoc(content),
    }
  })
}

function loadPackageJsonInfo(projectPath) {
  const packageJsonPath = join(projectPath, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return { name: '', description: '', scripts: {}, dependencies: {}, dev_dependencies: {} }
  }
  try {
    const payload = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    return {
      name: String(payload.name || '').trim(),
      description: String(payload.description || '').trim(),
      scripts: payload.scripts || {},
      dependencies: payload.dependencies || {},
      dev_dependencies: payload.devDependencies || {},
    }
  } catch {
    return { name: '', description: '', scripts: {}, dependencies: {}, dev_dependencies: {} }
  }
}

function loadPomInfo(projectPath) {
  const pomPath = join(projectPath, 'pom.xml')
  if (!existsSync(pomPath)) {
    return { artifact_id: '', packaging: '', modules: [], dependencies: [] }
  }
  const content = safeReadText(pomPath)
  return {
    artifact_id: (content.match(/<artifactId>([^<]+)<\/artifactId>/u) || [])[1] || '',
    packaging: (content.match(/<packaging>([^<]+)<\/packaging>/u) || [])[1] || '',
    modules: [...content.matchAll(/<module>([^<]+)<\/module>/gu)].map((match) => match[1]),
    dependencies: ['spring-boot', 'mybatis-plus', 'mysql', 'redis', 'mapstruct', 'lombok', 'rocketmq']
      .filter((name) => content.toLowerCase().includes(name)),
  }
}

function detectPackageManager(projectPath) {
  if (existsSync(join(projectPath, 'package-lock.json'))) return 'npm'
  if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(projectPath, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(projectPath, 'pom.xml'))) return 'maven'
  if (existsSync(join(projectPath, 'build.gradle')) || existsSync(join(projectPath, 'build.gradle.kts'))) return 'gradle'
  if (existsSync(join(projectPath, 'requirements.txt')) || existsSync(join(projectPath, 'pyproject.toml'))) return 'python'
  if (existsSync(join(projectPath, 'go.mod'))) return 'go'
  return '未识别'
}

function detectStyleSolution(projectPath, packageInfo) {
  const deps = { ...(packageInfo.dependencies || {}), ...(packageInfo.dev_dependencies || {}) }
  const styles = []
  if ('antd' in deps) styles.push('Ant Design')
  if ('tailwindcss' in deps || existsSync(join(projectPath, 'tailwind.config.js')) || existsSync(join(projectPath, 'tailwind.config.ts'))) styles.push('TailwindCSS')

  const topFiles = readdirSync(projectPath, { recursive: true }).slice(0, 5000)
  if (topFiles.some((item) => String(item).endsWith('.less'))) styles.push('Less')
  if (topFiles.some((item) => String(item).endsWith('.scss') || String(item).endsWith('.sass'))) styles.push('Sass/SCSS')
  if (topFiles.some((item) => String(item).endsWith('.module.css') || String(item).endsWith('.module.less'))) styles.push('CSS Modules')
  if (!styles.length && topFiles.some((item) => String(item).endsWith('.css'))) styles.push('CSS')
  return uniqueKeepOrder(styles)
}

function detectTestTools(projectPath, packageInfo, pomInfo) {
  const deps = { ...(packageInfo.dependencies || {}), ...(packageInfo.dev_dependencies || {}) }
  const scripts = packageInfo.scripts || {}
  const tools = []
  if ('jest' in deps || 'test' in scripts) {
    if ('jest' in deps || String(scripts.test || '').toLowerCase().includes('jest')) tools.push('Jest')
  }
  if (JSON.stringify(deps).toLowerCase().includes('react-testing-library') || '@testing-library/react' in deps) tools.push('React Testing Library')
  if (existsSync(join(projectPath, 'service', 'src', 'test', 'java')) || pomInfo.dependencies.join(' ').includes('junit')) tools.push('JUnit')
  return uniqueKeepOrder(tools)
}

function detectQualityTools(packageInfo) {
  const deps = { ...(packageInfo.dependencies || {}), ...(packageInfo.dev_dependencies || {}) }
  const scripts = packageInfo.scripts || {}
  const tools = []
  if ('eslint' in deps || Object.values(scripts).some((value) => String(value).toLowerCase().includes('eslint'))) tools.push('ESLint')
  if ('stylelint' in deps || Object.values(scripts).some((value) => String(value).toLowerCase().includes('stylelint'))) tools.push('Stylelint')
  if ('prettier' in deps || Object.values(scripts).some((value) => String(value).toLowerCase().includes('prettier'))) tools.push('Prettier')
  if (JSON.stringify(deps).toLowerCase().includes('commitlint')) tools.push('Commitlint')
  return uniqueKeepOrder(tools)
}

function inferLanguageAndFramework(projectPath, effectiveStack, scanResult, packageInfo, pomInfo) {
  const projectType = scanResult.project_type || 'unknown'
  const detected = scanResult.detected || {}
  const languageParts = []
  const frameworkParts = []
  let buildTool = '未识别'

  if (projectType === 'frontend') {
    if ('typescript' in detected) languageParts.push('TypeScript')
    languageParts.push('JavaScript')
    if ('react' in detected || effectiveStack.includes('react')) frameworkParts.push('React')
    if (JSON.stringify(packageInfo).toLowerCase().includes('umi')) {
      frameworkParts.push('Umi')
      buildTool = 'umi'
    } else if ('vite' in detected) {
      frameworkParts.push('Vite')
      buildTool = 'vite'
    } else if ('webpack' in detected) {
      buildTool = 'webpack'
    }
  } else if (projectType === 'java') {
    languageParts.push('Java')
    if ('spring-boot' in detected || effectiveStack.includes('spring-boot') || pomInfo.dependencies.includes('spring-boot')) {
      frameworkParts.push('Spring Boot')
    }
    const scfContent = safeReadText(join(projectPath, 'src', 'main', 'resources', 'scf-spring.xml'))
      || safeReadText(join(projectPath, 'service', 'src', 'main', 'resources', 'scf-spring.xml'))
    if (scfContent.includes('zzscf:')) frameworkParts.push('SCF')
    buildTool = existsSync(join(projectPath, 'pom.xml')) || existsSync(join(projectPath, 'service', 'pom.xml')) ? 'maven' : 'gradle'
  } else if (projectType === 'python') {
    languageParts.push('Python')
  } else if (projectType === 'go') {
    languageParts.push('Go')
  }

  if (!languageParts.length) languageParts.push('未识别')
  if (!frameworkParts.length) frameworkParts.push('未识别')
  return {
    language: uniqueKeepOrder(languageParts).join(' / '),
    framework: uniqueKeepOrder(frameworkParts).join(' + '),
    build_tool: buildTool,
  }
}

function inferProjectStatus(projectPath) {
  return existsSync(join(projectPath, '.git')) ? '维护中/开发中' : '未明确'
}

function inferProjectScope(projectType) {
  if (projectType === 'frontend') {
    return {
      in_scope: ['前端页面、交互、状态与接口调用层', '与现有前端工程体系一致的页面/组件改动'],
      out_scope: ['后端服务实现', '数据库与基础设施变更'],
    }
  }
  if (projectType === 'java') {
    return {
      in_scope: ['服务接口、业务编排、领域规则、持久化与配置实现'],
      out_scope: ['前端页面实现', '无证据支持的跨服务职责推断'],
    }
  }
  return {
    in_scope: ['以仓库中实际存在的代码与配置为准'],
    out_scope: ['未识别部分需要人工确认'],
  }
}

function normalizeServiceProfile(raw = {}) {
  const architecture = raw.architecture && typeof raw.architecture === 'object' ? raw.architecture : {}
  return {
    service_type: String(raw.service_type || '').trim(),
    service_summary: String(raw.service_summary || '').trim(),
    business_scope: (raw.business_scope || []).map((item) => String(item).trim()).filter(Boolean),
    owned_capabilities: (raw.owned_capabilities || []).map((item) => String(item).trim()).filter(Boolean),
    bounded_context: String(raw.bounded_context || '').trim(),
    anti_capabilities: (raw.anti_capabilities || []).map((item) => String(item).trim()).filter(Boolean),
    architecture: {
      style: String(architecture.style || '').trim(),
      entrypoints: (architecture.entrypoints || []).map((item) => String(item).trim()).filter(Boolean),
      key_modules: (architecture.key_modules || []).map((item) => String(item).trim()).filter(Boolean),
    },
  }
}

function detectKbState(kbRoot) {
  if (!existsSync(kbRoot)) {
    return { exists: false, state: 'missing', missing_core_files: [...CORE_KB_FILES], history_preserved: false }
  }
  const missing = CORE_KB_FILES.filter((item) => !existsSync(join(kbRoot, item)))
  const historyPreserved = ['plan', 'archive', 'sessions'].some((name) => existsSync(join(kbRoot, name)))
  const modulesDir = join(kbRoot, 'modules')
  const moduleDocCount = existsSync(modulesDir)
    ? readdirSync(modulesDir).filter((name) => name.endsWith('.md') && name !== '_index.md').length
    : 0
  return {
    exists: true,
    state: !missing.length && moduleDocCount ? 'complete' : 'partial',
    missing_core_files: missing,
    history_preserved: historyPreserved,
    module_doc_count: moduleDocCount,
  }
}

function scanProjectModules(projectPath) {
  const modules = []
  const topDirs = ['src', 'app', 'services', 'modules', 'packages', 'controllers', 'models', 'repository', 'mapper', 'api', 'core', 'common', 'contract', 'service']
  const exclude = new Set(['.git', '.idea', '.vscode', 'node_modules', '__pycache__', 'target', 'dist', 'build'])

  topDirs.forEach((dirName) => {
    const base = join(projectPath, dirName)
    if (!existsSync(base)) return
    try {
      readdirSync(base, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !exclude.has(entry.name) && !entry.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((entry) => modules.push(`${dirName}/${entry.name}`))
    } catch {}
  })

  return uniqueKeepOrder(modules).slice(0, 20)
}

function summarizeDirectoryOverview(modules) {
  return modules.slice(0, 12).map((module) => {
    if (module.startsWith('src/')) return `- \`${module}\`: \`${module.split('/').slice(1).join('/')}\` 相关代码或资源目录。`
    if (module.startsWith('service/') || module.startsWith('contract/')) return `- \`${module}\`: \`${module.split('/').slice(1).join('/')}\` 分层目录。`
    return `- \`${module}\`: 已识别的重要目录。`
  })
}

function inferProjectName(projectPath, packageInfo, pomInfo, referenceNotes) {
  if (packageInfo.description) return packageInfo.description
  if (pomInfo.artifact_id) return pomInfo.artifact_id
  const note = referenceNotes.find((item) => item.summary && item.summary.length <= 60 && !item.summary.startsWith('http'))
  return note?.summary || projectPath.split('/').pop()
}

function renderContextContent(projectPath, engineerId, declaredTechStack, effectiveStack, scanResult, modules, serviceProfile) {
  const packageInfo = loadPackageJsonInfo(projectPath)
  const pomInfo = loadPomInfo(projectPath)
  const referenceNotes = loadReferenceNotes(projectPath)
  const projectType = scanResult.project_type || 'unknown'
  const projectName = inferProjectName(projectPath, packageInfo, pomInfo, referenceNotes)
  const projectDesc = packageInfo.description || referenceNotes[0]?.summary || ''
  const packageManager = detectPackageManager(projectPath)
  const inferred = inferLanguageAndFramework(projectPath, effectiveStack, scanResult, packageInfo, pomInfo)
  const testTools = detectTestTools(projectPath, packageInfo, pomInfo)
  const styleSolution = detectStyleSolution(projectPath, packageInfo)
  const scripts = packageInfo.scripts || {}
  const scope = inferProjectScope(projectType)
  const directoryLines = summarizeDirectoryOverview(modules)
  const profile = normalizeServiceProfile(serviceProfile)
  const detectedTech = Object.entries(scanResult.detected || {}).map(([k, v]) => `${k}${v || ''}`).join(', ') || '未检测到'

  const lines = [
    '# 项目上下文',
    '',
    '> 此文件由 HelloAGENTS 根据项目真实文件扫描生成，内容应以代码和配置事实为准。',
    '',
    '## 1. 基本信息',
    '',
    '```yaml',
    `名称: ${projectPath.split('/').pop()}`,
    `显示名: ${projectName}`,
    `描述: ${projectDesc || '未从仓库文档中提取到明确描述'}`,
    `类型: ${projectType || 'unknown'}`,
    `状态: ${inferProjectStatus(projectPath)}`,
    `工程师: ${engineerId || '未指定'}`,
    '```',
    '',
    '## 2. 技术上下文',
    '',
    '```yaml',
    `语言: ${inferred.language}`,
    `框架: ${inferred.framework}`,
    `包管理器: ${packageManager}`,
    `构建工具: ${inferred.build_tool}`,
    `测试工具: ${testTools.join(', ') || '未明确'}`,
    `样式方案: ${styleSolution.join(', ') || '未明确'}`,
    `声明技术栈: ${(declaredTechStack || []).join(', ') || '无'}`,
    `扫描技术栈: ${detectedTech}`,
    `生效技术栈: ${effectiveStack.join(', ') || '未识别'}`,
    '```',
    '',
    '## 3. 项目概述',
    '',
    '### 核心职责',
  ]

  if (profile.service_summary) lines.push(`- ${profile.service_summary}`)
  else if (referenceNotes[0]?.bullets?.length) lines.push(...referenceNotes[0].bullets.slice(0, 4).map((item) => `- ${item}`))
  else if (projectDesc) lines.push(`- ${projectDesc}`)
  else lines.push('- 需根据源码和现有业务页面/服务职责进一步补充。')

  lines.push('', '### 业务范围')
  if (profile.business_scope.length) lines.push(...profile.business_scope.map((item) => `- ${item}`))
  else lines.push('- 未在 service_catalog 中声明，需后续补充。')

  lines.push('', '### 架构入口')
  if (profile.architecture.entrypoints.length) lines.push(...profile.architecture.entrypoints.map((item) => `- \`${item}\``))
  else lines.push('- 未在 service_catalog 中声明关键入口。')

  lines.push('', '### 项目边界', '```yaml', '范围内:')
  scope.in_scope.forEach((item) => lines.push(`  - ${item}`))
  profile.owned_capabilities.forEach((item) => lines.push(`  - ${item}`))
  lines.push('范围外:')
  scope.out_scope.forEach((item) => lines.push(`  - ${item}`))
  profile.anti_capabilities.forEach((item) => lines.push(`  - ${item}`))
  lines.push('```', '', '## 4. 关键命令', '')

  ;['start', 'dev', 'build', 'lint', 'test'].forEach((key) => {
    if (scripts[key]) lines.push(`- \`${packageManager} run ${key}\`: \`${scripts[key]}\``)
  })
  if (!Object.keys(scripts).length && packageManager === 'maven') {
    lines.push('- `mvn clean package -DskipTests`: 构建项目')
    lines.push('- `mvn test`: 运行测试')
  } else if (!Object.keys(scripts).length) {
    lines.push('- 未从项目配置中识别到标准运行命令。')
  }

  lines.push('', '## 5. 目录结构概览', '')
  if (directoryLines.length) lines.push(...directoryLines)
  else lines.push('- 未识别到稳定目录结构，需人工补充。')

  lines.push('', '## 6. 可参考项目文档', '')
  if (referenceNotes.length) {
    referenceNotes.forEach((note) => lines.push(`- \`${note.path}\`: ${note.summary || '已存在项目说明文档'}`))
  } else {
    lines.push('- 未发现可直接参考的 `AGENTS.md` / `README.md` / `CLAUDE.md`。')
  }

  return `${lines.join('\n')}\n`
}

function renderGuidelinesContent(projectPath, declaredTechStack, effectiveStack, scanResult, serviceProfile) {
  const packageInfo = loadPackageJsonInfo(projectPath)
  const pomInfo = loadPomInfo(projectPath)
  const referenceNotes = loadReferenceNotes(projectPath)
  const projectType = scanResult.project_type || 'unknown'
  const packageManager = detectPackageManager(projectPath)
  const styleSolution = detectStyleSolution(projectPath, packageInfo)
  const testTools = detectTestTools(projectPath, packageInfo, pomInfo)
  const qualityTools = detectQualityTools(packageInfo)
  const scripts = packageInfo.scripts || {}
  const profile = normalizeServiceProfile(serviceProfile)
  const detectedTech = Object.entries(scanResult.detected || {}).map(([k, v]) => `${k}${v || ''}`).join(', ') || '未检测到'

  const lines = [
    '# 项目开发指南',
    '',
    '> 本文件根据仓库中的真实代码、配置和现有项目文档自动生成。若文档与代码冲突，以代码事实为准。',
    '',
    '## 1. 事实来源',
    '',
    '- `package.json` / `pom.xml` / 构建配置',
    '- 仓库目录结构与源码文件分布',
    '- 已存在的 `README.md` / `AGENTS.md` / `CLAUDE.md`（若存在）',
    '- 本次扫描得到的技术栈与模块结构',
    '',
    '## 2. 必须遵循的基线',
    '',
    '- 优先沿用仓库现有技术栈与目录组织，不引入未被项目采用的新范式。',
    '- 新增或修改文档时，优先补充真实代码事实，不写无法从仓库证明的规范。',
    '- 若项目已有 AI 协作说明文档，新增约定应与其保持一致，冲突时以代码事实和当前仓库配置为准。',
    '- fullstack 项目 KB 初始化以用户在 service_catalog 中的职责声明为第一事实来源，自动扫描只做轻量补充。',
    '',
    '## 3. 技术栈约束',
    '',
    `- 包管理器/构建: \`${packageManager}\``,
    `- 声明技术栈: ${(declaredTechStack || []).join(', ') || '无'}`,
    `- 扫描技术栈: ${detectedTech}`,
    `- 生效技术栈: ${effectiveStack.join(', ') || '未识别'}`,
  ]

  lines.push(`- 当前样式方案: ${styleSolution.join(', ') || '未从仓库中识别到明确方案，需保持与现有文件一致。'}`)
  lines.push(styleSolution.includes('TailwindCSS')
    ? '- 已检测到 TailwindCSS，可在现有 Tailwind 体系内扩展。'
    : '- 未检测到 TailwindCSS，请不要在项目指南中假设或优先推广 TailwindCSS。')

  lines.push('', '## 4. 开发方式建议', '')
  if (profile.service_summary) lines.push(`- 当前服务定位: ${profile.service_summary}`)
  if (profile.anti_capabilities.length) lines.push(`- 禁止承载: ${profile.anti_capabilities.join('；')}`)
  if (projectType === 'frontend') {
    lines.push('- 页面、组件、样式、接口封装优先复用现有前端工程模式。')
    if (styleSolution.includes('Ant Design')) lines.push('- 已检测到 Ant Design，新增界面优先复用现有 Ant Design 组件与样式体系。')
    if (styleSolution.includes('Less')) lines.push('- 已检测到 Less 文件，样式扩展优先保持 Less 体系一致。')
    if (JSON.stringify(packageInfo).toLowerCase().includes('umi')) lines.push('- 已检测到 Umi，路由、构建和开发命令优先遵循 Umi 约定。')
  } else if (projectType === 'java') {
    lines.push('- Java 服务开发优先遵循现有 Maven 结构、包分层和 RPC/配置体系。')
    if (pomInfo.modules.length) lines.push(`- 当前为多模块 Maven 项目，已识别模块: ${pomInfo.modules.join(', ')}。`)
    const scfContent = safeReadText(join(projectPath, 'src', 'main', 'resources', 'scf-spring.xml'))
      || safeReadText(join(projectPath, 'service', 'src', 'main', 'resources', 'scf-spring.xml'))
    if (scfContent.includes('zzscf:')) lines.push('- 已检测到 SCF 配置，接口边界和远程调用应遵循现有 SCF 体系。')
  } else {
    lines.push('- 由于项目类型识别有限，开发时应以现有代码风格和配置为准。')
  }

  lines.push('', '## 5. 质量与验证', '')
  lines.push(`- 测试工具: ${testTools.join(', ') || '未明确，新增关键逻辑时至少补充可执行验证方式。'}`)
  lines.push(`- 质量工具: ${qualityTools.join(', ') || '未从配置中识别到完整链路，提交前需按仓库现状自查。'}`)
  ;['lint', 'test', 'build'].forEach((key) => {
    if (scripts[key]) lines.push(`- 推荐执行 \`${packageManager} run ${key}\``)
  })
  if (packageManager === 'maven') {
    lines.push('- 推荐执行 `mvn test`')
    lines.push('- 推荐执行 `mvn clean package -DskipTests`')
  }

  lines.push('', '## 6. 待补充项', '')
  if (referenceNotes.length) lines.push('- 已有项目文档可继续人工校正，但补充范围应控制在源码无法直接表达的业务背景。')
  lines.push('- 若存在业务规范、发布流程或权限约束，需在确认后补充到此文件，不应凭空生成。')
  return `${lines.join('\n')}\n`
}

function detectTechStack(projectPath) {
  const detected = []
  if (existsSync(join(projectPath, 'package.json'))) {
    const packageInfo = loadPackageJsonInfo(projectPath)
    const deps = { ...(packageInfo.dependencies || {}), ...(packageInfo.dev_dependencies || {}) }
    if ('react' in deps) detected.push('react')
    if ('vue' in deps) detected.push('vue')
    if ('express' in deps) detected.push('express')
    if ('fastify' in deps) detected.push('node')
  }
  if (existsSync(join(projectPath, 'pom.xml'))) {
    detected.push('java')
    if (safeReadText(join(projectPath, 'pom.xml')).includes('spring-boot')) detected.push('spring-boot')
  }
  if (existsSync(join(projectPath, 'build.gradle')) || existsSync(join(projectPath, 'build.gradle.kts'))) detected.push('java')
  if (existsSync(join(projectPath, 'requirements.txt')) || existsSync(join(projectPath, 'pyproject.toml'))) {
    detected.push('python')
    const requirements = safeReadText(join(projectPath, 'requirements.txt')).toLowerCase()
    if (requirements.includes('fastapi')) detected.push('fastapi')
    else if (requirements.includes('django')) detected.push('django')
    else if (requirements.includes('flask')) detected.push('flask')
  }
  if (existsSync(join(projectPath, 'go.mod'))) detected.push('go')
  if (existsSync(join(projectPath, 'Podfile')) || existsSync(join(projectPath, 'Package.swift'))) detected.push('ios')
  if (existsSync(join(projectPath, 'oh-package.json5'))) detected.push('harmony')
  return uniqueKeepOrder(detected)
}

function selectTemplate(techStack) {
  for (const tech of techStack) {
    const normalized = String(tech || '').toLowerCase()
    if (TECH_STACK_TEMPLATES[normalized]) return TECH_STACK_TEMPLATES[normalized]
  }
  return 'default'
}

function writeIfNeeded(filePath, content, force, filesCreated, projectPath) {
  if (!existsSync(filePath) || force) {
    writeFileSync(filePath, content, 'utf-8')
    filesCreated.push(relative(projectPath, filePath).replace(/\\/gu, '/'))
  }
}

function buildEnrichmentSessionContent(projectPath, kbRoot, engineerId, modules, kbState) {
  const lines = [
    '# 项目知识库补全文档任务',
    '',
    '> 该任务用于对应工程师 agent 在独立会话中整理项目知识文档，请勿与其他项目共用同一上下文。',
    '',
    '## 执行要求',
    '',
    '- 必须使用独立会话 / 独立上下文，仅分析当前项目。',
    '- 必须保留现有 `.helloagents/plan/`、`archive/`、`sessions/`、`CHANGELOG.md` 等历史记录，不得覆盖已有任务与归档。',
    '- 以项目真实代码为准补充文档，不以历史计划或变更记录替代项目全貌。',
    '',
    '## 项目信息',
    '',
    `- 项目路径: \`${projectPath}\``,
    `- 知识库路径: \`${kbRoot}\``,
    `- 工程师: ${engineerId || '未指定'}`,
    `- 当前 KB 状态: ${kbState.state || 'unknown'}`,
    `- 缺失核心文档: ${kbState.missing_core_files?.join(', ') || '无'}`,
    '',
    '## 优先补全文档',
    '',
    '- `context.md`: 项目定位、技术栈、运行方式、目录职责、关键入口',
    '- `modules/*.md`: 各模块职责、关键类/函数/组件、依赖关系',
    '- `modules/_index.md`: 模块索引与链接校正',
    '- `api/` 下需要的接口草稿或上游索引（如能从代码可靠识别）',
    '',
    '## 已扫描到的模块',
    '',
  ]
  if (modules.length) lines.push(...modules.map((item) => `- \`${item}\``))
  else lines.push('- 暂未扫描到明确模块，请结合项目目录结构补充')
  lines.push('', '## 完成标准', '', '- 项目级文档能帮助新工程师快速理解项目整体结构', '- 文档内容与代码一致，不覆盖历史任务与改动记录', '- 所有补充都基于当前项目独立上下文完成', '')
  return lines.join('\n')
}

function writeEnrichmentSessionRequest(kbRoot, projectPath, engineerId, modules, kbState) {
  const sessionsDir = join(kbRoot, 'sessions')
  ensureDir(sessionsDir)
  const safeEngineer = String(engineerId || 'unassigned').replace(/[^a-zA-Z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'unassigned'
  const filePath = join(sessionsDir, `kb_enrichment_${safeEngineer}.md`)
  writeFileSync(filePath, buildEnrichmentSessionContent(projectPath, kbRoot, engineerId, modules, kbState), 'utf-8')
  return relative(projectPath, filePath).replace(/\\/gu, '/')
}

export function initProjectKb({ projectPath, declaredTechStack = [], engineerId = null, force = false, serviceProfile = null }) {
  const project = resolve(projectPath)
  const kbRoot = join(project, '.helloagents')
  if (!existsSync(project)) {
    return { success: false, error: `Project directory not found: ${projectPath}`, kb_root: kbRoot }
  }

  const kbState = detectKbState(kbRoot)
  if (kbState.state === 'complete' && !force) {
    return {
      success: true,
      skipped: true,
      message: 'Knowledge base already exists',
      kb_root: kbRoot,
      kb_state: kbState,
    }
  }

  const detected = detectTechStack(project)
  const effectiveStack = uniqueKeepOrder([...(declaredTechStack || []), ...detected])
  const scanResult = scanProject(project)
  const modules = scanProjectModules(project)
  const templateName = selectTemplate(effectiveStack)
  const filesCreated = []

  try {
    ;['', 'modules', 'api', 'plan', 'sessions', 'archive'].forEach((subdir) => ensureDir(join(kbRoot, subdir)))

    writeIfNeeded(
      join(kbRoot, 'context.md'),
      renderContextContent(project, engineerId, declaredTechStack, effectiveStack, scanResult, modules, serviceProfile),
      force,
      filesCreated,
      project,
    )
    writeIfNeeded(
      join(kbRoot, 'guidelines.md'),
      renderGuidelinesContent(project, declaredTechStack, effectiveStack, scanResult, serviceProfile),
      force,
      filesCreated,
      project,
    )
    writeIfNeeded(
      join(kbRoot, 'INDEX.md'),
      `# ${project.split('/').pop()} 项目知识库\n\n> 由 HelloAGENTS 基于项目真实文件自动生成\n\n## 项目信息\n\n- **项目路径**: ${project}\n- **工程师**: ${engineerId || '未指定'}\n- **技术栈**: ${effectiveStack.join(', ') || '未检测'}\n- **初始化时间**: ${nowText()}\n\n## 快速链接\n\n- [技术上下文](context.md)\n- [项目开发指南](guidelines.md)\n- [变更日志](CHANGELOG.md)\n- [模块索引](modules/_index.md)\n`,
      force,
      filesCreated,
      project,
    )
    writeIfNeeded(
      join(kbRoot, 'CHANGELOG.md'),
      `# 变更日志\n\n## ${nowText().slice(0, 10)}\n\n### 初始化\n\n- 由 HelloAGENTS 全栈模式初始化项目知识库\n- 技术栈: ${effectiveStack.join(', ') || '未检测'}\n\n---\n\n<!-- 以下为自动生成的变更记录 -->\n`,
      force,
      filesCreated,
      project,
    )
    writeIfNeeded(
      join(kbRoot, 'modules', '_index.md'),
      `# 模块索引\n\n> 自动生成于 ${nowText()}\n\n${modules.length ? modules.map((item, index) => `- M${String(index + 1).padStart(2, '0')}: \`${item}\``).join('\n') : '- 暂未识别到模块，请后续补充。'}\n`,
      force,
      filesCreated,
      project,
    )

    const enrichmentSession = writeEnrichmentSessionRequest(kbRoot, project, engineerId, modules, kbState)
    filesCreated.push(enrichmentSession)

    return {
      success: true,
      skipped: false,
      kb_root: kbRoot,
      kb_state: kbState,
      template_used: templateName,
      tech_stack: {
        declared: declaredTechStack || [],
        detected,
        effective: effectiveStack,
        scanner_project_type: scanResult.project_type || 'unknown',
        scanner_detected: scanResult.detected || {},
      },
      service_profile: normalizeServiceProfile(serviceProfile),
      modules_detected: modules,
      module_docs_created: [],
      enrichment_session: {
        required: true,
        isolated_context: true,
        engineer_id: engineerId,
        session_file: enrichmentSession,
      },
      files_created: filesCreated,
    }
  } catch (error) {
    return { success: false, error: error.message, kb_root: kbRoot }
  }
}
