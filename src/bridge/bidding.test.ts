import { describe, expect, it } from 'vitest'
import { hcp, isBalanced, parseHand, randomDeal } from './cards'
import {
  answerToDouble, competitiveAction, openingBid, responseTo2C, responseToNT, responseToSuit, staymanAnswer,
} from './bidding'
import { sureTricks, trickWinner } from './play'
import { parseHolding } from './cards'

const h = parseHand

describe('punten en verdeling', () => {
  it('telt honneurpunten', () => {
    expect(hcp(h('AH42.V93.B7.A852'))).toBe(4 + 3 + 2 + 1 + 4)
  })
  it('herkent een SA-verdeling', () => {
    expect(isBalanced(h('AH42.V93.B7.A852'))).toBe(true)
    expect(isBalanced(h('AH432.V932.B7.A8'))).toBe(false)
  })
})

describe('openen', () => {
  it.each([
    ['64.HV82.B9765.AB', 'P'],
    ['H4.HV82.B9765.AB', '1D'],
    ['AH42.HV93.B72.82', '1H'], // twee vierkaarten: de laagste
    ['AH942.HV932.7.A8', '1S'], // twee vijfkaarten: de hoogste
    ['AH4.HV9.B72.A852', '1NT'],
    ['AH4.AV9.HB7.AB52', '2NT'],
    ['AH4.AH9.AB7.AHV2', '2C'],
    ['AHV82.AH93.A7.52', '2S'],
  ])('%s → %s', (hand, bid) => {
    expect(openingBid(h(hand))?.bid).toBe(bid)
  })
})

describe('antwoorden op 1 in een kleur (voorbeelden uit de handleiding)', () => {
  it.each([
    ['S', 'A982.H3.AV65.982', '4S'],
    ['S', 'A982.83.AV65.982', '3S'],
    ['S', 'A982.83.V652.982', '2S'],
    ['D', 'A982.H3.AV65.982', '1S'],
    ['D', 'A982.83.V652.982', '1S'],
    ['D', '982.83.V652.A982', '2D'],
    ['D', '982.83.AV65.A982', '3D'],
    ['C', '8.HB765.AHV3.872', '1H'],
    ['D', 'HV76.9843.B107.86', '1H'],
    ['H', 'V82.83.HB742.V92', '1NT'],
    ['H', '82.832.HB742.AV2', '2D'],
    ['S', '8.832.HB742.V932', '1NT'],
    ['H', '82.832.9742.V932', 'P'],
  ] as const)('1%s met %s → %s', (opened, hand, bid) => {
    expect(responseToSuit(opened, h(hand))?.bid).toBe(bid)
  })
})

describe('antwoorden op 1SA', () => {
  it.each([
    ['765.B98643.765.6', '2D'],
    ['B9876.8.B743.82', '2H'],
    ['HV87.B43.V82.H43', '2C'],
    ['HV8.B43.982.H543', '2NT'],
    ['HV8.A43.V82.H543', '3NT'],
    ['V87.B43.982.H543', 'P'],
  ])('%s → %s', (hand, bid) => {
    expect(responseToNT(1, h(hand))?.bid).toBe(bid)
  })
  it('Stayman-antwoorden', () => {
    expect(staymanAnswer(1, h('AH42.V932.H7.A8')).bid).toBe('2H')
    expect(staymanAnswer(1, h('AH42.V93.H72.A8')).bid).toBe('2S')
    expect(staymanAnswer(1, h('AH4.V93.H762.A84')).bid).toBe('2D')
  })
})

describe('2♣ en tussenbieden', () => {
  it('antwoorden op 2♣', () => {
    expect(responseTo2C(h('842.V93.B762.984'))?.bid).toBe('2D')
    expect(responseTo2C(h('AH842.93.B762.84'))?.bid).toBe('2S')
  })
  it('informatiedoublet, volgbod en pas', () => {
    expect(competitiveAction('S', h('-.HB76.AV982.H1032'))?.bid).toBe('X')
    expect(competitiveAction('D', h('HV87.AB7.H8.AV64'))?.bid).toBe('X')
    expect(competitiveAction('C', h('AHB87.84.V93.852'))?.bid).toBe('1S')
    expect(competitiveAction('C', h('98762.84.V93.H52'))?.bid).toBe('P')
  })
  it('antwoord op het doublet', () => {
    expect(answerToDouble('H', h('9762.84.V9532.52'))?.bid).toBe('2D')
  })
})

describe('afspel', () => {
  it('troef wint de slag', () => {
    const w = trickWinner([
      { seat: 'W', card: { suit: 'H', rank: 14 } },
      { seat: 'N', card: { suit: 'H', rank: 2 } },
      { seat: 'E', card: { suit: 'S', rank: 3 } },
      { seat: 'S', card: { suit: 'H', rank: 13 } },
    ], 'S')
    expect(w.seat).toBe('E')
  })
  it('telt vaste slagen', () => {
    expect(sureTricks(parseHolding('AH'), parseHolding('V'))).toBe(2)
    expect(sureTricks(parseHolding('AHV'), parseHolding('B2'))).toBe(3)
    expect(sureTricks(parseHolding('HV7'), parseHolding('B4'))).toBe(0)
    expect(sureTricks(parseHolding('AH32'), parseHolding('V54'))).toBe(3)
  })
})

describe('engine op willekeurige handen', () => {
  it('crasht nooit en geeft altijd een uitleg', () => {
    for (let i = 0; i < 3000; i++) {
      const d = randomDeal()
      for (const f of [
        () => openingBid(d.S), () => responseToSuit('H', d.S), () => responseToSuit('C', d.S),
        () => responseToNT(1, d.S), () => competitiveAction('D', d.S), () => answerToDouble('S', d.S),
      ]) {
        const a = f()
        if (a) expect(a.why.length).toBeGreaterThan(10)
      }
    }
  })
})
