import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DEPENDENCY_FILES = {
  'package.json': 'frontend',
  'pom.xml': 'java',
  'build.gradle': 'java',
  'build.gradle.kts': 'java',
  'requirements.txt': 'python',
  'pyproject.toml': 'python',
  'setup.py': 'python',
  'Pipfile': 'python',
  'go.mod': 'go',
  'Package.swift': 'ios',
  'Podfile': 'ios',
  'oh-package.json5': 'harmony',
  'build-profile.json5': 'harmony',
}

function safeReadText(filePath) {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}

function parseJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function scanPackageJson(filePath) {
  const detected = {}
  const data = parseJsonFile(filePath)
  if (!data) return detected

  const deps = { ...(data.dependencies || {}), ...(data.devDependencies || {}) }
  const frameworkPatterns = ['react', 'vue', 'next', 'nuxt', 'angular', 'svelte', 'nestjs', 'express']

  Object.entries(deps).forEach(([pkg, version]) => {
    const normalized = pkg.toLowerCase().replaceAll('@', '').replaceAll('/', '-')
    frameworkPatterns.forEach((framework) => {
      if (normalized.includes(framework)) {
        const cleanVersion = String(version || '').replace(/[^\d.]/gu, '')
        const major = cleanVersion ? cleanVersion.split('.')[0] : ''
        detected[framework] = major ? `@${major}` : ''
      }
    })
    if (pkg === 'typescript') {
      const cleanVersion = String(version || '').replace(/[^\d.]/gu, '')
      detected.typescript = cleanVersion ? `@${cleanVersion.split('.')[0]}` : ''
    }
    ;['zustand', 'redux', 'pinia', 'mobx', 'recoil', 'jotai', 'vite', 'webpack', 'rollup', 'esbuild', 'turbopack'].forEach((name) => {
      if (pkg === name) detected[name] = ''
    })
    if (pkg === 'tailwindcss') detected.tailwindcss = ''
    if (pkg === 'antd') detected.antd = ''
    if (pkg === 'element-plus') detected['element-plus'] = ''
    if (pkg === '@mui/material') detected['mui-material'] = ''
  })

  return detected
}

function scanPomXml(filePath) {
  const detected = {}
  const content = safeReadText(filePath)
  if (!content) return detected

  const springVersionMatch = content.match(/<spring-boot\.version>(\d+\.\d+)/u)
    || content.match(/spring-boot-starter-parent.*?(\d+\.\d+)/u)
  if (springVersionMatch) detected['spring-boot'] = `@${springVersionMatch[1]}`
  if (content.includes('mybatis-plus')) detected['mybatis-plus'] = ''
  if (content.includes('mysql-connector')) detected.mysql = ''
  if (content.includes('spring-boot-starter-data-redis') || content.includes('jedis')) detected.redis = ''
  if (content.includes('lombok')) detected.lombok = ''
  if (content.includes('mapstruct')) detected.mapstruct = ''
  return detected
}

function scanRequirements(filePath) {
  const detected = {}
  const content = safeReadText(filePath)
  content.split(/\r?\n/u).forEach((line) => {
    const normalized = line.trim().toLowerCase()
    if (!normalized || normalized.startsWith('#')) return
    ;['fastapi', 'django', 'flask', 'sqlalchemy', 'pydantic', 'celery', 'redis', 'pytest', 'torch', 'tensorflow'].forEach((name) => {
      if (normalized.includes(name)) detected[name === 'torch' ? 'pytorch' : name] = ''
    })
  })
  return detected
}

function scanGoMod(filePath) {
  const detected = {}
  const content = safeReadText(filePath)
  const goVersion = content.match(/^go\s+(\d+\.\d+)/mu)
  if (goVersion) detected.go = `@${goVersion[1]}`
  const patterns = {
    'github.com/gin-gonic/gin': 'gin',
    'github.com/labstack/echo': 'echo',
    'github.com/gofiber/fiber': 'fiber',
    'gorm.io/gorm': 'gorm',
    'github.com/go-redis/redis': 'redis',
    'go.etcd.io/etcd': 'etcd',
  }
  Object.entries(patterns).forEach(([pattern, name]) => {
    if (content.includes(pattern)) detected[name] = ''
  })
  return detected
}

function scanPodfile(filePath) {
  const detected = {}
  const content = safeReadText(filePath)
  const swiftVersion = content.match(/swift_version\s*=\s*['"](\d+\.\d+)/u)
  if (swiftVersion) detected.swift = `@${swiftVersion[1]}`
  ;['alamofire', 'snapkit', 'kingfisher', 'rxswift', 'moya'].forEach((name) => {
    if (content.toLowerCase().includes(name)) detected[name] = ''
  })
  return detected
}

function scanBuildGradle(filePath) {
  const detected = {}
  const content = safeReadText(filePath)
  const isAndroid = content.includes('com.android') || content.includes('android {')
  if (isAndroid) {
    const kotlinVersion = content.match(/kotlin.*?(\d+\.\d+\.\d+)/u)
    if (kotlinVersion) detected.kotlin = `@${kotlinVersion[1]}`
    if (content.toLowerCase().includes('compose')) detected['jetpack-compose'] = ''
    if (content.toLowerCase().includes('retrofit')) detected.retrofit = ''
    if (content.toLowerCase().includes('room')) detected.room = ''
  } else {
    const springVersion = content.match(/spring-boot.*?(\d+\.\d+)/u)
    if (springVersion) detected['spring-boot'] = `@${springVersion[1]}`
  }
  return detected
}

function scanOhPackage(filePath) {
  const content = safeReadText(filePath)
  const detected = { arkts: '', arkui: '' }
  if (content.includes('@ohos')) detected.ohos = ''
  return detected
}

export function scanProject(projectPath) {
  const root = resolve(projectPath)
  if (!existsSync(root)) return { error: `Path does not exist: ${projectPath}` }

  const detected = {}
  let projectType = 'unknown'

  Object.entries(DEPENDENCY_FILES).forEach(([fileName, fileType]) => {
    const filePath = join(root, fileName)
    if (!existsSync(filePath)) return
    projectType = fileType
    if (fileName === 'package.json') Object.assign(detected, scanPackageJson(filePath))
    else if (fileName === 'pom.xml') Object.assign(detected, scanPomXml(filePath))
    else if (fileName === 'requirements.txt') Object.assign(detected, scanRequirements(filePath))
    else if (fileName === 'go.mod') Object.assign(detected, scanGoMod(filePath))
    else if (fileName === 'Podfile' || fileName === 'Package.swift') Object.assign(detected, scanPodfile(filePath))
    else if (fileName === 'build.gradle' || fileName === 'build.gradle.kts') Object.assign(detected, scanBuildGradle(filePath))
    else if (fileName === 'oh-package.json5') Object.assign(detected, scanOhPackage(filePath))
  })

  const configFiles = {
    'tsconfig.json': 'typescript',
    'tailwind.config.js': 'tailwindcss',
    'tailwind.config.ts': 'tailwindcss',
    'vite.config.ts': 'vite',
    'vite.config.js': 'vite',
    '.eslintrc.js': 'eslint',
    '.prettierrc': 'prettier',
  }
  Object.entries(configFiles).forEach(([fileName, tech]) => {
    if (existsSync(join(root, fileName)) && !(tech in detected)) detected[tech] = ''
  })

  return {
    project_type: projectType,
    detected,
  }
}

export function formatTechStack(detected) {
  return Object.entries(detected || {})
    .map(([tech, version]) => `${tech}${version || ''}`)
    .sort()
}
