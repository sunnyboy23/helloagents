import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  analyzeCrossProjectDependencies,
  analyzeImpact,
  analyzeServiceOwnership,
  getAllProjects,
} from '../scripts/fullstack-impact.mjs'

function createProject(rootDir, name, contextContent = '') {
  const projectPath = join(rootDir, name)
  const kbPath = join(projectPath, '.helloagents')
  mkdirSync(kbPath, { recursive: true })
  if (contextContent) {
    writeFileSync(join(kbPath, 'context.md'), contextContent, 'utf-8')
  }
  return projectPath
}

function buildConfig(projects) {
  return {
    version: '1.0',
    mode: 'fullstack',
    engineers: [
      {
        id: 'be-java-main',
        type: 'backend-java',
        name: 'Java 后端工程师',
        projects: [
          {
            path: projects.orderService,
            description: '订单域服务',
            tech_stack: ['java', 'spring-boot'],
            auto_init_kb: true,
          },
        ],
      },
      {
        id: 'fe-react-main',
        type: 'frontend-react',
        name: 'React 前端工程师',
        projects: [
          {
            path: projects.webApp,
            description: '',
            tech_stack: ['react'],
            auto_init_kb: true,
          },
        ],
      },
      {
        id: 'be-nodejs-main',
        type: 'backend-nodejs',
        name: 'Node.js 后端工程师',
        projects: [
          {
            path: projects.reportService,
            description: '报表查询服务',
            tech_stack: ['node', 'nestjs'],
            auto_init_kb: true,
          },
        ],
      },
    ],
    service_dependencies: {
      [projects.webApp]: { depends_on: [projects.reportService] },
      [projects.reportService]: { depends_on: [projects.orderService] },
      [projects.orderService]: { depends_on: [] },
    },
    service_catalog: {
      [projects.orderService]: {
        service_type: 'domain',
        service_summary: '处理订单规则与订单写入',
        business_scope: ['订单创建', '订单规则'],
        owned_capabilities: ['order_write', 'order_rule'],
        architecture: {
          entrypoints: ['controller/order'],
          key_modules: ['order'],
        },
      },
      [projects.reportService]: {
        service_type: 'report',
        service_summary: '订单报表与历史查询服务',
        business_scope: ['订单报表', '历史查询'],
        owned_capabilities: ['order_report_query'],
        architecture: {
          entrypoints: ['controller/report'],
          key_modules: ['report'],
        },
      },
    },
  }
}

test('getAllProjects mixes configured description and KB-derived summary', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-fullstack-impact-'))
  try {
    const orderService = createProject(dir, 'order-service', '订单域服务负责订单创建与规则执行\n')
    const reportService = createProject(dir, 'report-service', '报表服务负责历史查询与报表聚合\n')
    const webApp = createProject(dir, 'web-app', '前端页面负责订单展示\n')
    const config = buildConfig({ orderService, reportService, webApp })

    const projects = getAllProjects(config)
    const orderItem = projects.find((item) => item.path === orderService)
    const webItem = projects.find((item) => item.path === webApp)

    assert.equal(orderItem.description, '订单域服务')
    assert.equal(orderItem.description_source, 'configured')
    assert.equal(webItem.description, '前端页面负责订单展示')
    assert.equal(webItem.description_source, 'kb')
    assert.ok(Array.isArray(webItem.capabilities))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('analyzeImpact expands downstream projects and builds dispatch plan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-fullstack-impact-'))
  try {
    const orderService = createProject(dir, 'order-service', '订单域服务负责订单创建与规则执行\n')
    const reportService = createProject(dir, 'report-service', '报表服务负责历史查询与报表聚合\n')
    const webApp = createProject(dir, 'web-app', '前端页面负责订单展示\n')
    const config = buildConfig({ orderService, reportService, webApp })

    const result = analyzeImpact(config, [orderService])

    assert.deepEqual(result.directly_affected, [orderService])
    assert.equal(result.all_affected.includes(orderService), true)
    assert.equal(result.all_affected.includes(reportService), true)
    assert.equal(result.all_affected.includes(webApp), true)
    assert.equal(result.dispatch_plan.dispatchable_projects.length, 3)
    assert.equal(result.dispatch_plan.continue_execution, true)
    assert.deepEqual(result.execution_order[0], [orderService])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('analyzeServiceOwnership prefers declared service catalog owner', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-fullstack-impact-'))
  try {
    const orderService = createProject(dir, 'order-service')
    const reportService = createProject(dir, 'report-service')
    const webApp = createProject(dir, 'web-app')
    const config = buildConfig({ orderService, reportService, webApp })

    const result = analyzeServiceOwnership(config, '新增订单规则写入能力并补充执行链路')

    assert.equal(result.owner_service, orderService)
    assert.equal(result.affected_projects_seed[0], orderService)
    assert.ok(result.ownership_reason.length >= 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('analyzeCrossProjectDependencies returns partial graph for seed project', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ha-fullstack-impact-'))
  try {
    const orderService = createProject(dir, 'order-service')
    const reportService = createProject(dir, 'report-service')
    const webApp = createProject(dir, 'web-app')
    const config = buildConfig({ orderService, reportService, webApp })

    const result = analyzeCrossProjectDependencies(config, [reportService])

    assert.equal(result.scope, 'partial')
    assert.equal(result.projects.includes(reportService), true)
    assert.equal(result.projects.includes(webApp), true)
    assert.equal(result.has_cycle, false)
    assert.ok(result.layers.length >= 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
