import { describe, expect, it } from 'vitest'
import { authoredBidChecks, chapters } from './chapters'
import { buildSession } from './session'
import { LEAD_POOLS } from './generators'
import { parseHolding } from '../bridge/cards'

/** Uitkomen volgens de les: serie vanaf de hoogste kaart, anders klein met een honneur, anders hoog. */
function leadKind(holding: string): 'seq' | 'low' | 'high' {
  const r = parseHolding(holding)
  if (r[0] >= 10 && r[1] === r[0] - 1) return 'seq'
  return r[0] >= 11 ? 'low' : 'high'
}

function leadOk(holding: string, answer: number[]): boolean {
  const r = parseHolding(holding)
  const kind = leadKind(holding)
  if (kind === 'seq') return answer.length === 1 && answer[0] === r[0]
  if (kind === 'low') return answer.includes(r[r.length - 1]) && answer.every((a) => a < 10)
  return answer.includes(r[0]) && answer.every((a) => a < 10)
}

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
  it('uitkomen volgt de afspraken', () => {
    for (const kind of ['seq', 'low', 'high'] as const) for (const [holding, lead] of LEAD_POOLS[kind]) {
      expect(leadKind(holding), holding).toBe(kind)
      expect(leadOk(holding, parseHolding(lead)), holding).toBe(true)
    }
    for (const ch of chapters) for (const l of ch.lessons) for (const e of l.items ?? []) {
      if (e.kind !== 'pick' || !e.prompt.startsWith('Je komt uit')) continue
      const holding = e.cards.map((c) => (c.rank === 10 ? '10' : 'TBVHA'[c.rank - 10] ?? String(c.rank))).join('')
      expect(leadOk(holding, e.answer.map((c) => c.rank)), holding).toBe(true)
    }
  })
  it('lesids zijn uniek', () => {
    const ids = chapters.flatMap((c) => c.lessons.map((l) => l.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
