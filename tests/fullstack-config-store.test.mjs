import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  bindProject,
  buildDefaultFullstackConfig,
  listEngineers,
  loadConfig,
  saveConfig,
  unbindProject,
  validateConfig,
} from '../scripts/fullstack-config-store.mjs'

test('buildDefaultFullstackConfig returns a valid fullstack config', () => {
  const config = buildDefaultFullstackConfig()
  const [valid, errors] = validateConfig(config)

  assert.equal(config.mode, 'fullstack')
  assert.equal(valid, true)
  assert.deepEqual(errors, [])
  assert.ok(config.engineers.length >= 1)
})

test('saveConfig and loadConfig preserve engineers and service catalog', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-fullstack-config-'))
  try {
    const configPath = join(dir, 'fullstack.yaml')
    const config = buildDefaultFullstackConfig()
    config.service_catalog['/tmp/service-a'] = {
      service_summary: '订单服务',
      business_scope: ['订单创建', '订单查询'],
      architecture: { style: 'spring-boot' },
    }

    const [saved, error] = saveConfig(configPath, config)
    assert.equal(saved, true, error || 'save failed')

    const loaded = loadConfig(configPath)
    assert.equal(loaded.mode, 'fullstack')
    assert.equal(loaded.engineers[0].id, config.engineers[0].id)
    assert.deepEqual(loaded.service_catalog['/tmp/service-a'].business_scope, ['订单创建', '订单查询'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('bindProject and unbindProject update engineer ownership in config', () => {
  const config = buildDefaultFullstackConfig()
  const targetProject = '/tmp/demo-fullstack-project'

  const bindResult = bindProject(config, targetProject, 'be-java-main', {
    description: '交易服务',
    techStack: ['java', 'spring'],
    autoInitKb: false,
  })

  assert.equal(bindResult.success, true)
  assert.equal(bindResult.project.description, '交易服务')
  assert.deepEqual(bindResult.project.tech_stack, ['java', 'spring'])
  assert.equal(bindResult.project.auto_init_kb, false)

  const engineers = listEngineers(config)
  const javaEngineer = engineers.find((item) => item.id === 'be-java-main')
  assert.equal(javaEngineer.project_count, 1)

  const unbindResult = unbindProject(config, targetProject)
  assert.equal(unbindResult.success, true)
  assert.equal(unbindResult.removed, true)
  assert.equal(listEngineers(config).find((item) => item.id === 'be-java-main').project_count, 0)
})
