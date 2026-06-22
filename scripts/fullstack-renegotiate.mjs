// fullstack-renegotiate.mjs — Contract renegotiation from real deliverables.
//
// Solves the "role collaboration is too rigid" problem: the initial task
// contract is derived purely from static topology. Once an upstream task
// actually completes and produces real API contracts / tech docs, the
// downstream task's contract should be re-derived from those real artifacts
// instead of the original guess. This turns a one-shot pipeline into a
// feedback loop without letting engineers talk to each other directly.

function collectUpstreamContracts(upstreamTask = {}) {
  const result = upstreamTask.result || {}
  const contracts = []
  const docs = []

  const pushDoc = (entry) => {
    if (!entry) return
    if (typeof entry === 'string') {
      docs.push(entry)
      return
    }
    if (typeof entry === 'object') {
      const path = entry.path || entry.key || ''
      if (path) docs.push(path)
      if (entry.type === 'api_contract' && path) contracts.push(path)
    }
  }

  ;(result.tech_docs || []).forEach(pushDoc)
  ;(result.artifacts || []).forEach(pushDoc)

  return {
    api_contracts: [...new Set(contracts)],
    docs: [...new Set(docs)],
    has_api_change: contracts.length > 0
      || /interface|api|contract|接口|契约/iu.test(JSON.stringify(result.changes || [])),
  }
}

// Re-derive a single downstream task contract from completed upstream tasks.
// Returns the updated task_contract plus a human-readable changelog of what
// changed relative to the original (static) contract.
export function renegotiateContract(downstreamTask = {}, upstreamTasks = []) {
  const original = downstreamTask.task_contract || {}
  const upstreamContracts = []
  let anyApiChange = false
  const upstreamProjects = new Set(original.upstream_projects || [])

  upstreamTasks.forEach((upstream) => {
    if (!upstream || upstream.status !== 'completed') return
    upstreamProjects.add(upstream.project)
    const collected = collectUpstreamContracts(upstream)
    collected.api_contracts.forEach((path) => upstreamContracts.push(path))
    if (collected.has_api_change) anyApiChange = true
  })

  const resolvedContracts = [...new Set([
    ...(original.upstream_contracts || []),
    ...upstreamContracts,
  ])]

  const updated = {
    ...original,
    upstream_projects: [...upstreamProjects].sort(),
    upstream_contracts: resolvedContracts,
  }

  const changelog = []

  if (upstreamContracts.length) {
    updated.upstream_contracts = resolvedContracts
    changelog.push(`接入上游真实契约 ${upstreamContracts.length} 份`)
  }

  // If an upstream API actually changed, the downstream task is no longer a
  // routine change: bump verification and add an explicit integration focus.
  if (anyApiChange) {
    if (updated.verify_mode !== 'api_contract_required') {
      updated.verify_mode = 'integration_ready'
    }
    updated.risk_level = 'high'
    const testerFocus = new Set(updated.tester_focus || [])
    testerFocus.add('与上游真实契约联调验证')
    updated.tester_focus = [...testerFocus]
    const reviewerFocus = new Set(updated.reviewer_focus || [])
    reviewerFocus.add('是否已按上游最终契约对齐（而非初始假设）')
    updated.reviewer_focus = [...reviewerFocus]
    changelog.push('检测到上游接口变化，升级验证模式与联调关注点')
  }

  return {
    changed: changelog.length > 0,
    task_contract: updated,
    changelog,
    resolved_upstream_contracts: resolvedContracts,
  }
}

// Renegotiate every downstream task in a task-group state whose upstream
// dependencies have completed. Pure function: returns proposed updates, does
// not mutate state (the task-store applies them).
export function renegotiateReadyDownstream(state = {}) {
  const tasks = state.tasks || {}
  const updates = []

  Object.entries(tasks).forEach(([taskId, task]) => {
    const dependsOn = task.depends_on || []
    if (!dependsOn.length) return
    if (['completed', 'skipped'].includes(task.status)) return

    const upstreamTasks = dependsOn.map((depId) => tasks[depId]).filter(Boolean)
    const allUpstreamDone = upstreamTasks.length === dependsOn.length
      && upstreamTasks.every((up) => ['completed', 'skipped'].includes(up.status))
    if (!allUpstreamDone) return

    const result = renegotiateContract(task, upstreamTasks)
    if (result.changed) {
      updates.push({ task_id: taskId, ...result })
    }
  })

  return { updates, count: updates.length }
}
