import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'

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

export function syncTechDoc(sourcePath, targetProjects, docType = 'api_contract') {
  const source = resolve(sourcePath)
  if (!existsSync(source)) {
    return {
      success: false,
      error: `Source file not found: ${sourcePath}`,
      synced_to: [],
    }
  }

  const synced = []
  const errors = []

  targetProjects.forEach((targetProject) => {
    const targetBase = resolve(targetProject)
    const targetDir = docType === 'api_contract'
      ? join(targetBase, '.helloagents', 'api', 'upstream')
      : join(targetBase, '.helloagents', 'docs', 'upstream')

    try {
      mkdirSync(targetDir, { recursive: true })
      const targetFile = join(targetDir, basename(source))
      copyFileSync(source, targetFile)

      const metaContent = `<!--\n同步自: ${source}\n同步时间: ${nowText()}\n文档类型: ${docType}\n-->\n\n`
      const original = safeReadText(targetFile)
      if (!original.startsWith('<!--')) {
        writeFileSync(targetFile, `${metaContent}${original}`, 'utf-8')
      }

      synced.push({
        project: targetBase,
        path: targetFile,
        status: 'success',
      })
    } catch (error) {
      errors.push({
        project: targetBase,
        error: error.message,
      })
    }
  })

  return {
    success: errors.length === 0,
    source,
    doc_type: docType,
    synced_to: synced,
    errors: errors.length ? errors : null,
  }
}

export function batchSyncFromResult(resultMessage, basePath = '.') {
  const techDocs = resultMessage.tech_docs || []
  if (!techDocs.length) {
    return {
      success: true,
      message: 'No tech docs to sync',
      results: [],
    }
  }

  const base = resolve(basePath)
  const results = techDocs
    .filter((doc) => doc?.path && Array.isArray(doc?.sync_to) && doc.sync_to.length)
    .map((doc) => {
      const projectBase = resultMessage.project
        ? (String(resultMessage.project).startsWith('/') ? resultMessage.project : join(base, resultMessage.project))
        : '.'
      const fullPath = doc.path.startsWith('/')
        ? doc.path
        : join(projectBase, doc.path)
      const targets = doc.sync_to.map((target) => (String(target).startsWith('/') ? target : join(base, target)))
      return syncTechDoc(fullPath, targets, doc.type || 'api_contract')
    })

  return {
    success: results.every((item) => item.success),
    total_docs: techDocs.length,
    results,
  }
}

export function updateUpstreamIndex(projectPath) {
  const project = resolve(projectPath)
  const upstreamDir = join(project, '.helloagents', 'api', 'upstream')
  if (!existsSync(upstreamDir)) {
    return {
      success: true,
      message: 'No upstream directory',
      files: [],
    }
  }

  const upstreamFiles = readdirSync(upstreamDir)
    .filter((name) => name.endsWith('.md') && !name.startsWith('_'))
    .map((name) => {
      const filePath = join(upstreamDir, name)
      const content = safeReadText(filePath)
      let source = null
      let syncTime = null
      if (content.startsWith('<!--')) {
        const metaEnd = content.indexOf('-->')
        if (metaEnd > 0) {
          const meta = content.slice(4, metaEnd)
          meta.split(/\r?\n/u).forEach((line) => {
            if (line.includes('同步自:')) source = line.split('同步自:')[1]?.trim() || null
            if (line.includes('同步时间:')) syncTime = line.split('同步时间:')[1]?.trim() || null
          })
        }
      }
      return {
        name,
        path: relative(project, filePath),
        source,
        sync_time: syncTime,
      }
    })

  const indexPath = join(upstreamDir, '_index.md')
  const lines = [
    '# 上游 API 契约索引',
    '',
    `> 自动生成于 ${nowText()}`,
    '',
    '| 文件 | 来源 | 同步时间 |',
    '|------|------|----------|',
  ]
  upstreamFiles.forEach((file) => {
    const sourceDisplay = file.source ? file.source.split('/').slice(-3, -2)[0] || '未知' : '未知'
    lines.push(`| [${file.name}](${file.name}) | ${sourceDisplay} | ${file.sync_time || '未知'} |`)
  })
  writeFileSync(indexPath, `${lines.join('\n')}\n`, 'utf-8')

  return {
    success: true,
    index_path: indexPath,
    files: upstreamFiles,
  }
}
