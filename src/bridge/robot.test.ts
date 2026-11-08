import { describe, expect, it } from 'vitest'
import { SEATS, hcp, randomDeal, shape, partnerOf } from './cards'
import { legalCalls, robotAuction, seatAt } from './auction'
import { contractScore, legalPlays, tableWithAuction, toAct } from './table'
import { playOut, robotCard } from './robot'

describe('robots', () => {
  it('bieden alleen toegestane biedingen en komen tot een eind', () => {
    for (let i = 0; i < 400; i++) {
      const d = randomDeal()
      const dealer = SEATS[i % 4]
      const calls = robotAuction(d, dealer)
      for (let k = 0; k < calls.length; k++) expect(legalCalls(dealer, calls.slice(0, k))).toContain(calls[k])
      expect(calls.length).toBeLessThan(40)
    }
  })
  it('spelen alleen toegestane kaarten, 13 slagen', () => {
    for (let i = 0; i < 200; i++) {
      const d = randomDeal()
      let t = tableWithAuction(d, 'N', robotAuction(d, 'N'))
      if (t.phase !== 'play') continue
      const seat = toAct(t)!
      expect(legalPlays(t, seat)).toContainEqual(robotCard(t, seat))
      t = playOut(t)
      expect(t.tricks.length).toBe(13)
    }
  })
  it('vinden meestal de manche met 25+ en een fit in een hoge kleur', () => {
    let tries = 0, game = 0
    for (let i = 0; i < 3000 && tries < 300; i++) {
      const d = randomDeal()
      const p = hcp(d.N) + hcp(d.S)
      const fit = (['H', 'S'] as const).some((s) => shape(d.N)[s] + shape(d.S)[s] >= 8)
      if (p < 26 || p > 31 || !fit || hcp(d.E) + hcp(d.W) > 14) continue
      tries++
      const calls = robotAuction(d, 'N')
      const t = tableWithAuction(d, 'N', calls)
      const c = t.contract
      if (c && (c.declarer === 'N' || c.declarer === 'S') && contractScore(c, 13).score >= 300) game++
    }
    expect(game / tries).toBeGreaterThan(0.8)
  })
  it('stoppen laag met weinig punten', () => {
    let tries = 0, high = 0
    for (let i = 0; i < 3000 && tries < 300; i++) {
      const d = randomDeal()
      const p = hcp(d.N) + hcp(d.S)
      if (p < 19 || p > 22) continue
      tries++
      const c = tableWithAuction(d, 'N', robotAuction(d, 'N')).contract
      if (c && (c.declarer === 'N' || c.declarer === 'S') && c.level >= 4) high++
    }
    expect(high / tries).toBeLessThan(0.12)
  })
  it('voorbeeldbiedingen', () => {
    const samples: string[] = []
    for (let i = 0; i < 12; i++) {
      const d = randomDeal()
      const calls = robotAuction(d, 'N')
      samples.push(`${hcp(d.N)}+${hcp(d.S)} vs ${hcp(d.E)}+${hcp(d.W)}: ` + calls.map((c, k) => `${seatAt('N', k)}:${c}`).join(' '))
    }
    console.log(samples.join('\n'))
    expect(partnerOf('N')).toBe('S')
  })
})
