import test from 'node:test'
import assert from 'node:assert/strict'

import { getProjectRuntimeKey } from '../scripts/fullstack-runtime-store.mjs'

test('getProjectRuntimeKey is stable for same path', () => {
  const path = '/tmp/demo-project'
  assert.equal(getProjectRuntimeKey(path), getProjectRuntimeKey(path))
  assert.equal(getProjectRuntimeKey(path).length, 12)
})

test('getProjectRuntimeKey changes for different paths', () => {
  assert.notEqual(
    getProjectRuntimeKey('/tmp/demo-project-a'),
    getProjectRuntimeKey('/tmp/demo-project-b'),
  )
})
