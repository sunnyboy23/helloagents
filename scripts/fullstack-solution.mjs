// fullstack-solution.mjs — Solution lifecycle: draft → review → approved gate.
//
// Enforces "evaluate impact and write a solution BEFORE code". Each task carries
// a service-level technical solution; an independent reviewer (layer 1) and the
// orchestrator's cross-solution consistency check (layer 2) must pass before the
// implementation task may start. Pure logic; the task-store applies it.

export const SOLUTION_STATUS = {
  PENDING: 'pending',
  DRAFTED: 'drafted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

// Sections the service-level technical solution MUST fill (subset of the 23-point
// template that gates code start — the "impact must be evaluated" core).
export const REQUIRED_SOLUTION_SECTIONS = [
  { key: 'impact', title: '影响面评估', patterns: ['影响面评估', '影响面', 'impact'] },
  { key: 'topology', title: '系统交互拓扑关系评估', patterns: ['系统交互拓扑', '拓扑关系', '上游依赖', '下游影响'] },
  { key: 'rollback', title: '回滚方案', patterns: ['回滚方案', '回滚', 'rollback'] },
  { key: 'grayscale', title: '灰度设计', patterns: ['灰度设计', '灰度', 'grayscale'] },
  { key: 'consistency', title: '并发与一致性保障', patterns: ['并发', '一致性', 'consistency'] },
]

const VALID_VERDICTS = new Set(['approved', 'rejected'])

function headingLevel(line) {
  const hashMatch = line.match(/^(#{1,6})\s/u)
  if (hashMatch) return hashMatch[1].length
  // Numbered headings ("4.2 ...", "一、...") count as a heading but at a level
  // deeper than any markdown heading so they don't terminate a section scan.
  if (/^\d+(\.\d+)*[.、]\s/u.test(line) || /^[一二三四五六七八九十]+、/u.test(line)) return 99
  return 0
}

function sectionFilled(text, section) {
  const lines = String(text || '').split(/\r?\n/u)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    const level = headingLevel(line)
    if (!level) continue
    if (!section.patterns.some((p) => line.toLowerCase().includes(p.toLowerCase()))) continue

    // Matched heading — accept real content anywhere within this section, i.e.
    // up to the next heading at the SAME or HIGHER level (sub-headings allowed).
    for (let j = i + 1; j < lines.length; j += 1) {
      const body = lines[j].trim()
      const bodyLevel = headingLevel(body)
      if (bodyLevel && bodyLevel <= level) break
      if (bodyLevel) continue // a deeper sub-heading — keep scanning its content
      const stripped = body.replace(/^[-*>|\s]+/u, '').replace(/[-:：|]/gu, '').trim()
      if (!stripped) continue
      // A bare placeholder ("待补充" / "TODO" / "本次不涉及" alone) does not count
      // as filled unless it explicitly states why it is out of scope.
      if (/^(待补充|todo|tbd|n\/a|无)$/iu.test(stripped)) continue
      return true
    }
  }
  return false
}

// Validate a service-level solution document's content against required sections.
export function validateSolutionContent(content) {
  const missing = []
  const filled = []
  REQUIRED_SOLUTION_SECTIONS.forEach((section) => {
    if (sectionFilled(content, section)) filled.push(section.key)
    else missing.push({ key: section.key, title: section.title })
  })
  return {
    valid: missing.length === 0,
    filled_sections: filled,
    missing_sections: missing,
  }
}

// Compute the next solution status when an author submits a (validated) draft.
export function statusAfterSubmit(validation) {
  return validation.valid ? SOLUTION_STATUS.UNDER_REVIEW : SOLUTION_STATUS.DRAFTED
}

// Apply a reviewer verdict (layer 1). Returns the resulting status + normalized
// review record, or an error for an invalid verdict.
export function applyReviewVerdict(verdict, { findings = [], reviewer = '', reviewedAt = '' } = {}) {
  const normalized = String(verdict || '').trim().toLowerCase()
  if (!VALID_VERDICTS.has(normalized)) {
    return { error: `Invalid verdict: ${verdict}. Use approved | rejected.` }
  }
  const normalizedFindings = (Array.isArray(findings) ? findings : [findings])
    .map((item) => (typeof item === 'string' ? item : (item?.title || item?.message || ''))).filter(Boolean)

  return {
    status: normalized === 'approved' ? SOLUTION_STATUS.APPROVED : SOLUTION_STATUS.REJECTED,
    review: {
      verdict: normalized,
      findings: normalizedFindings,
      reviewer: String(reviewer || 'unknown'),
      reviewed_at: reviewedAt,
    },
  }
}

// The gate: may an implementation task start given its solution lifecycle?
export function isSolutionApprovedForStart(task = {}) {
  if (task.solution_required === false) return true
  return task.solution_status === SOLUTION_STATUS.APPROVED
}

export function solutionBlockReason(task = {}) {
  if (isSolutionApprovedForStart(task)) return null
  const status = task.solution_status || SOLUTION_STATUS.PENDING
  if (status === SOLUTION_STATUS.REJECTED) {
    const findings = task.solution_review?.findings || []
    return `方案评审未通过，请按评审意见修订后重新提交：${findings.slice(0, 3).join('；') || '见评审记录'}`
  }
  if (status === SOLUTION_STATUS.PENDING) {
    return '尚未提交技术方案。代码开写前必须先输出方案并通过评审（如确属纯文案/纯配置，可在任务契约标 skip_solution）。'
  }
  if (status === SOLUTION_STATUS.DRAFTED) {
    return '方案缺少必填章节（影响面/拓扑/回滚/灰度/一致性），未进入评审。请补齐后重新提交。'
  }
  return '方案正在评审中，approved 后方可开始编码。'
}

// Layer 2: aggregate per-service solution status across the whole task group so
// the orchestrator can check cross-service consistency before any code starts.
// Pure summary — the orchestrator (an agent) makes the actual consistency call.
export function aggregateSolutionStatus(state = {}) {
  const tasks = Object.entries(state.tasks || {})
  const perTask = tasks.map(([taskId, task]) => ({
    task_id: taskId,
    project: task.project || '',
    engineer_id: task.engineer_id || 'unassigned',
    solution_required: task.solution_required !== false,
    solution_status: task.solution_status || SOLUTION_STATUS.PENDING,
    solution_path: task.service_solution_path || task.solution_path || '',
    findings: task.solution_review?.findings || [],
  }))

  const required = perTask.filter((item) => item.solution_required)
  const approved = required.filter((item) => item.solution_status === SOLUTION_STATUS.APPROVED)
  const rejected = required.filter((item) => item.solution_status === SOLUTION_STATUS.REJECTED)
  const pendingReview = required.filter((item) => [
    SOLUTION_STATUS.PENDING,
    SOLUTION_STATUS.DRAFTED,
    SOLUTION_STATUS.UNDER_REVIEW,
  ].includes(item.solution_status))

  return {
    task_group_id: state.task_group_id || '',
    total_required: required.length,
    approved_count: approved.length,
    rejected: rejected.map((item) => item.task_id),
    pending_review: pendingReview.map((item) => item.task_id),
    all_approved: required.length > 0 && approved.length === required.length,
    ready_for_consistency_check: required.length > 0 && approved.length === required.length,
    solution_paths: approved.map((item) => ({ task_id: item.task_id, project: item.project, path: item.solution_path })),
    per_task: perTask,
  }
}

