import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { initProjectKb } from '../scripts/fullstack-kb-init.mjs'
import { scanProject } from '../scripts/fullstack-tech-scanner.mjs'

test('scanProject detects frontend stack from package.json and config files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-fullstack-kb-'))
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^18.2.0', antd: '^5.0.0' },
      devDependencies: { typescript: '^5.0.0', vite: '^5.0.0' },
    }), 'utf-8')
    writeFileSync(join(dir, 'tailwind.config.js'), 'module.exports = {}', 'utf-8')

    const result = scanProject(dir)
    assert.equal(result.project_type, 'frontend')
    assert.ok('react' in result.detected)
    assert.ok('typescript' in result.detected)
    assert.ok('vite' in result.detected)
    assert.ok('tailwindcss' in result.detected)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('initProjectKb creates KB files using declared service profile and light scan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-fullstack-kb-'))
  try {
    const projectPath = join(dir, 'report-service')
    mkdirSync(join(projectPath, 'src', 'report'), { recursive: true })
    writeFileSync(join(projectPath, 'package.json'), JSON.stringify({
      name: 'report-service',
      description: '报表服务',
      scripts: { build: 'vite build', test: 'jest' },
      dependencies: { react: '^18.2.0' },
      devDependencies: { vite: '^5.0.0', jest: '^29.0.0' },
    }), 'utf-8')
    writeFileSync(join(projectPath, 'README.md'), '# 报表服务\n\n- 负责报表查询与聚合\n', 'utf-8')

    const result = initProjectKb({
      projectPath,
      declaredTechStack: ['react'],
      engineerId: 'fe-react-main',
      force: false,
      serviceProfile: {
        service_type: 'report',
        service_summary: '负责报表查询与历史聚合',
        business_scope: ['报表查询', '历史聚合'],
        owned_capabilities: ['report_query'],
        architecture: { entrypoints: ['src/report'] },
      },
    })

    assert.equal(result.success, true)
    assert.equal(result.tech_stack.effective.includes('react'), true)
    assert.equal(result.service_profile.service_summary, '负责报表查询与历史聚合')
    assert.equal(existsSync(join(projectPath, '.helloagents', 'context.md')), true)
    assert.equal(existsSync(join(projectPath, '.helloagents', 'guidelines.md')), true)
    assert.equal(existsSync(join(projectPath, '.helloagents', 'INDEX.md')), true)
    assert.equal(existsSync(join(projectPath, '.helloagents', 'CHANGELOG.md')), true)
    assert.equal(existsSync(join(projectPath, '.helloagents', 'sessions', 'kb_enrichment_fe-react-main.md')), true)

    const context = readFileSync(join(projectPath, '.helloagents', 'context.md'), 'utf-8')
    assert.ok(context.includes('负责报表查询与历史聚合'))
    assert.ok(context.includes('报表查询'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
