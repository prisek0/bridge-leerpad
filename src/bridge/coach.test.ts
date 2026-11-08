import { describe, expect, it } from 'vitest'
import { type Card, type Deal, type Suit, parseHand } from './cards'
import type { Bid } from './bidding'
import { type Table, addCard, collect, tableWithAuction } from './table'
import { checkPlay, leadAdvice, planCount } from './coach'
import { LEAD_POOLS } from '../content/generators'
import { parseHolding } from './cards'

const h = parseHand
const card = (s: string): Card => ({ suit: s.slice(-1) as Suit, rank: parseHolding(s.slice(0, -1))[0] })
function table(d: Deal, dealer: 'N' | 'E' | 'S' | 'W', calls: Bid[], cards: string[] = []): Table {
  let t = tableWithAuction(d, dealer, calls)
  for (const c of cards) { t = addCard(t, card(c)); if (t.trick.length === 4) t = collect(t) }
  return t
}

// Zuid speelt 3SA, west komt uit.
const deal: Deal = {
  N: h('AV4.H52.A863.762'),
  E: h('H73.VB4.V95.AB84'),
  S: h('652.A86.HB4.HV93'),
  W: h('B1098.10973.1072.105'),
}

describe('coach', () => {
  it('uitkomen volgt dezelfde regels als de oefeningen', () => {
    for (const kind of ['seq', 'low', 'high'] as const) for (const [holding, lead] of LEAD_POOLS[kind]) {
      const a = leadAdvice(parseHolding(holding).map((rank) => ({ suit: 'S' as Suit, rank })))!
      expect(a.kind, holding).toBe(kind)
      const pool = parseHolding(lead)
      expect(a.good.every((c) => pool.includes(c.rank)), holding).toBe(true)
      expect(a.good.length, holding).toBeGreaterThan(0)
    }
  })
  it('geeft een tip bij een verkeerde uitkomst, en niet bij een goede', () => {
    const t = table(deal, 'S', ['1NT', 'P', '3NT', 'P', 'P', 'P'])
    expect(checkPlay(t, 'W', card('8S'), new Set())?.ok).toBe(false)
    expect(checkPlay(t, 'W', card('BS'), new Set())?.ok).toBe(true)
  })
  it('snijden: niet van de A V af spelen', () => {
    // West kwam uit met ♥10, zuid won met de aas en speelt nu een kleine schoppen.
    const t = table(deal, 'S', ['1NT', 'P', '3NT', 'P', 'P', 'P'], ['10H', '2H', 'BH', 'AH'])
    expect(checkPlay(t, 'S', card('2S'), new Set())).toBeNull()
    const fromNorth = table(deal, 'S', ['1NT', 'P', '3NT', 'P', 'P', 'P'], ['10H', 'HH', '4H', '6H'])
    expect(checkPlay(fromNorth, 'N', card('AS'), new Set())?.rule).toBe('snijden')
  })
  it('derde hand hoog', () => {
    // West komt uit met ♦2, de dummy (noord) legt ♦3: oost is derde hand.
    const t = table(deal, 'S', ['1NT', 'P', '3NT', 'P', 'P', 'P'], ['2D', '3D'])
    expect(checkPlay(t, 'E', card('5D'), new Set())).toMatchObject({ rule: 'derde hand', ok: false })
    expect(checkPlay(t, 'E', card('VD'), new Set())).toMatchObject({ rule: 'derde hand', ok: true })
  })
  it('telt vaste slagen voor het speelplan', () => {
    const t = table(deal, 'S', ['1NT', 'P', '3NT', 'P', 'P', 'P'], ['BS'])
    const p = planCount(t)
    expect(p.per).toEqual({ S: 1, H: 2, D: 2, C: 0 })
    expect(p.need).toBe(9)
  })
})
