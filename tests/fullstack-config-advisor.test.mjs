import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  buildConfigSuggestions,
  detectCrossLanguageDeps,
} from '../scripts/fullstack-config-advisor.mjs'

function makeProject(root, name, files = {}) {
  const projectPath = join(root, name)
  mkdirSync(projectPath, { recursive: true })
  Object.entries(files).forEach(([rel, content]) => {
    const filePath = join(projectPath, rel)
    mkdirSync(join(filePath, '..'), { recursive: true })
    writeFileSync(filePath, content, 'utf-8')
  })
  return projectPath
}

test('detectCrossLanguageDeps finds SCF/RPC references config files', () => {
  const root = mkdtempSync(join(tmpdir(), 'ha-advisor-'))
  try {
    const userService = makeProject(root, 'user-service', {
      'pom.xml': '<project><groupId>com.demo</groupId><artifactId>user-service</artifactId></project>',
    })
    const orderService = makeProject(root, 'order-service', {
      'src/main/resources/application.yaml': 'scf:\n  consumer:\n    - service: user-service\n      timeout: 2000\n',
    })

    const result = detectCrossLanguageDeps([userService, orderService])
    assert.ok(result.service_dependencies[orderService])
    assert.ok(result.service_dependencies[orderService].depends_on.includes(userService))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('detectCrossLanguageDeps does not invent self-dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'ha-advisor-'))
  try {
    const svc = makeProject(root, 'lonely-service', {
      'application.properties': 'server.port=8080\n',
    })
    const result = detectCrossLanguageDeps([svc])
    assert.equal(result.service_dependencies[svc], undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('buildConfigSuggestions produces a diff without mutating config', () => {
  const root = mkdtempSync(join(tmpdir(), 'ha-advisor-'))
  try {
    const userService = makeProject(root, 'user-service', {
      'pom.xml': '<project><groupId>com.demo</groupId><artifactId>user-service</artifactId></project>',
      'README.md': '# 用户服务\n\n承载用户主数据与账户信息的核心领域服务。\n',
    })
    const orderService = makeProject(root, 'order-service', {
      'pom.xml': '<project><groupId>com.demo</groupId><artifactId>order-service</artifactId></project>',
      'src/main/resources/scf.yaml': 'consumer:\n  - user-service\n',
    })

    const config = { service_dependencies: {}, service_catalog: {} }
    const suggestions = buildConfigSuggestions(config, [userService, orderService])

    assert.equal(suggestions.success, true)
    assert.equal(suggestions.has_suggestions, true)
    // Original config object is untouched (no apply).
    assert.deepEqual(config.service_dependencies, {})
    // Cross-language edge surfaced as a suggested addition.
    assert.ok(suggestions.dependency_additions.some(
      (item) => item.project === orderService && item.depends_on === userService,
    ))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
