// fullstack-publish.mjs — Optional document publish adapter (Feishu via lark-cli).
//
// The local markdown file is ALWAYS the source of truth. Publishing pushes a
// readable copy to Feishu for cross-team sharing and records the returned doc
// token + link back into the local doc header (idempotent: create once, then
// update the same doc). When no target is configured the step is a no-op and
// never blocks the solution/closeout flow.
//
// Document creation uses the USER identity (--as user), never bot.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

import { readRuntimeGlobalConfig } from './fullstack-runtime-store.mjs'

export const PUBLISH_TARGET_NONE = 'none'
export const PUBLISH_TARGET_FEISHU = 'feishu'

const LINK_MARKER = '<!-- fullstack-publish-link -->'
const TOKEN_MARKER = '<!-- fullstack-feishu-doc:'

// Resolve publish config. Precedence: explicit arg > env > global config > none.
export function resolvePublishConfig(override = {}) {
  if (override.target) return { target: override.target, feishu: override.feishu || {} }

  const envTarget = String(process.env.HELLOAGENTS_DOC_PUBLISH_TARGET || '').trim().toLowerCase()
  if (envTarget) return { target: envTarget, feishu: {} }

  const cfg = readRuntimeGlobalConfig()
  const block = cfg.doc_publish || {}
  return {
    target: String(block.target || PUBLISH_TARGET_NONE).trim().toLowerCase(),
    feishu: block.feishu || {},
  }
}

function deriveTitle(content, filePath) {
  for (const line of String(content || '').split(/\r?\n/u)) {
    const m = line.match(/^#\s+(.+)/u)
    if (m) return m[1].trim()
  }
  return basename(filePath).replace(/\.md$/u, '')
}

// Read a previously stored Feishu doc token from the local file (idempotency).
export function readStoredDocToken(content) {
  const m = String(content || '').match(/<!-- fullstack-feishu-doc:\s*([^\s>]+)\s*-->/u)
  return m ? m[1] : ''
}

// Build the lark-cli argv for create or update. Pure + testable (no I/O).
export function buildPublishCommand({ filePath, title, docToken = '', folderToken = '', wikiSpace = '' }) {
  if (docToken) {
    return {
      cmd: 'lark-cli',
      args: [
        'docs', '+update',
        '--doc', docToken,
        '--markdown', `@${filePath}`,
        '--mode', 'overwrite',
        '--as', 'user',
        '--format', 'json',
      ],
      op: 'update',
    }
  }
  const args = [
    'docs', '+create',
    '--title', title,
    '--markdown', `@${filePath}`,
    '--as', 'user',
    '--format', 'json',
  ]
  if (wikiSpace) args.push('--wiki-space', wikiSpace)
  else if (folderToken) args.push('--folder-token', folderToken)
  return { cmd: 'lark-cli', args, op: 'create' }
}

// Extract { token, url } from lark-cli JSON output (defensive across shapes).
export function extractDocRef(stdout) {
  let json
  try {
    json = JSON.parse(stdout)
  } catch {
    return { token: '', url: '' }
  }
  const data = json.data || json
  const doc = data.document || data.doc || data
  const token = doc.document_id || doc.obj_token || doc.objToken || doc.token || data.document_id || ''
  const url = doc.url || data.url || doc.share_url || ''
  return { token: String(token || ''), url: String(url || '') }
}

// Write the doc token + link back into the local file header (idempotent).
function writeBackRef(filePath, token, url) {
  if (!existsSync(filePath)) return false
  let content = readFileSync(filePath, 'utf-8')
  const linkLine = url ? `${LINK_MARKER} feishu 文档: ${url}` : ''
  const tokenLine = token ? `${TOKEN_MARKER} ${token} -->` : ''

  // Replace existing markers in place, else insert after the first heading.
  if (content.includes(LINK_MARKER)) {
    content = content.replace(new RegExp(`${LINK_MARKER}.*`, 'u'), linkLine)
  }
  if (content.includes(TOKEN_MARKER)) {
    content = content.replace(/<!-- fullstack-feishu-doc:[^>]*-->/u, tokenLine)
  }

  if (!content.includes(LINK_MARKER) || !content.includes(TOKEN_MARKER)) {
    const lines = content.split(/\r?\n/u)
    const headingIdx = lines.findIndex((l) => /^#\s/u.test(l))
    const insert = [linkLine, tokenLine].filter(Boolean)
    if (headingIdx >= 0) lines.splice(headingIdx + 1, 0, '', ...insert)
    else lines.unshift(...insert, '')
    content = lines.join('\n')
  }
  writeFileSync(filePath, content, 'utf-8')
  return true
}

// Publish one local document. Async because the Feishu branch shells out to
// lark-cli. The `none` branch stays a trivial no-op.
export async function publishDocument(filePath, options = {}) {
  const config = resolvePublishConfig(options)

  if (config.target === PUBLISH_TARGET_NONE || !config.target) {
    return { success: true, published: false, target: PUBLISH_TARGET_NONE, source_of_truth: filePath, reason: 'publish_target_none' }
  }

  if (!existsSync(filePath)) {
    return { success: false, published: false, target: config.target, error: `Local document not found: ${filePath}` }
  }

  if (config.target !== PUBLISH_TARGET_FEISHU) {
    return { success: false, published: false, target: config.target, error: `Unknown publish target: ${config.target}` }
  }

  const content = readFileSync(filePath, 'utf-8')
  const docToken = readStoredDocToken(content)
  const folderToken = String(config.feishu.folder_token || '').trim()
  const wikiSpace = String(config.feishu.wiki_space || '').trim()

  // Creating a NEW doc needs a destination (per chosen policy: 指定目录/wiki空间).
  // Updating an existing doc does not.
  if (!docToken && !folderToken && !wikiSpace) {
    return {
      success: false,
      published: false,
      target: PUBLISH_TARGET_FEISHU,
      source_of_truth: filePath,
      needs_config: true,
      reason: 'feishu_destination_missing',
      hint: '请在 fullstack.yaml 的 doc_publish.feishu 配置 folder_token 或 wiki_space（创建文档需指定目录/wiki空间）。',
    }
  }

  const command = buildPublishCommand({
    filePath,
    title: deriveTitle(content, filePath),
    docToken,
    folderToken,
    wikiSpace,
  })

  if (options.dryRun) {
    return { success: true, published: false, target: PUBLISH_TARGET_FEISHU, dry_run: true, op: command.op, command: `${command.cmd} ${command.args.join(' ')}` }
  }

  let stdout = ''
  try {
    stdout = execFileSync(command.cmd, command.args, { encoding: 'utf-8' })
  } catch (error) {
    return {
      success: false,
      published: false,
      target: PUBLISH_TARGET_FEISHU,
      source_of_truth: filePath,
      op: command.op,
      error: `lark-cli ${command.op} failed: ${error.stderr || error.message || 'unknown error'}`,
    }
  }

  const { token, url } = command.op === 'create' ? extractDocRef(stdout) : { token: docToken, url: '' }
  if (command.op === 'create' && token) {
    writeBackRef(filePath, token, url)
  } else if (command.op === 'update' && url) {
    writeBackRef(filePath, docToken, url)
  }

  return {
    success: true,
    published: true,
    target: PUBLISH_TARGET_FEISHU,
    op: command.op,
    source_of_truth: filePath,
    doc_token: token || docToken,
    url,
  }
}

// Exposed for tests / manual wiring.
export function recordPublishLink(filePath, token, url) {
  return writeBackRef(filePath, token, url)
}
