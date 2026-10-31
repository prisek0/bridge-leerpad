import { describe, expect, it } from 'vitest'
import { authoredBidChecks, chapters } from './chapters'
import { buildSession } from './session'

describe('inhoud', () => {
  it('vaste biedoefeningen kloppen met de biedengine', () => {
    const wrong = authoredBidChecks().filter((c) => c.engine !== c.expected)
    expect(wrong).toEqual([])
  })
  it('elke les kan vaak achter elkaar gebouwd worden', () => {
    for (const ch of chapters) for (const l of ch.lessons) for (let i = 0; i < 15; i++) {
      const s = buildSession(l)
      expect(s.length).toBeGreaterThan(3)
      for (const e of s) expect(e.explain.length).toBeGreaterThan(5)
    }
  })
  it('lesids zijn uniek', () => {
    const ids = chapters.flatMap((c) => c.lessons.map((l) => l.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
