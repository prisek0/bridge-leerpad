// De coach kijkt mee tijdens het afspelen en tegenspelen. Hij kent alleen de
// vuistregels uit deel 1 en kijkt alleen naar wat jij ook kunt zien. Elke tip
// noemt het hoofdstuk waar de regel in staat, zodat de app tips van stof die
// je nog niet gehad hebt kan overslaan.

import { type Card, type Seat, type Suit, SEAT_NAME, SUITS, cardLabel, partnerOf, rankLabel, sameCard } from './cards'
import { type Table, dummyOf, playedCards, trump } from './table'
import { trickWinner } from './play'
import { topTricks } from './robot'

export interface Verdict {
  /** 'h3' enzovoort. */
  chapter: string
  rule: string
  /** Volgt de kaart de regel? */
  ok: boolean
  text: string
  /** Kaarten die de coach wel zou spelen. */
  better: Card[]
}

const fine = (chapter: string, rule: string, text = ''): Verdict => ({ chapter, rule, ok: true, text, better: [] })
const tip = (chapter: string, rule: string, text: string, better: Card[] = []): Verdict => ({ chapter, rule, ok: false, text, better })

const ofSuit = (cs: Card[], s: Suit) => cs.filter((c) => c.suit === s).sort((a, b) => b.rank - a.rank)
const lowest = (cs: Card[]) => cs.reduce((a, b) => (b.rank < a.rank ? b : a))
const names = (cs: Card[]) => cs.map(cardLabel).join(' of ')

/** Hogere kaarten die nog in het spel zijn en niet in deze handen zitten. */
function outstandingAbove(t: Table, card: Card, mine: Card[]): number {
  const gone = playedCards(t)
  let n = 0
  for (let r = card.rank + 1; r <= 14; r++) {
    const c = { suit: card.suit, rank: r }
    if (!gone.some((g) => sameCard(g, c)) && !mine.some((m) => sameCard(m, c))) n++
  }
  return n
}

/**
 * Uitkomen volgens deel 1. Alleen bij drie of meer kaarten: voor een
 * doubleton heeft deel 1 geen afspraak.
 */
export function leadAdvice(cards: Card[]): { kind: 'seq' | 'low' | 'high'; good: Card[] } | null {
  const cs = [...cards].sort((a, b) => b.rank - a.rank)
  if (cs.length < 3) return null
  if (cs[0].rank >= 10 && cs[1].rank === cs[0].rank - 1) return { kind: 'seq', good: [cs[0]] }
  // Met een honneur: de laagste kaart; met een vijfkaart mag ook de vierde van boven.
  if (cs[0].rank >= 11) return { kind: 'low', good: (cs.length >= 5 ? cs.slice(-2) : cs.slice(-1)).filter((c) => c.rank < 10) }
  return { kind: 'high', good: cs.slice(0, 2) }
}

export function leadExplain(kind: 'seq' | 'low' | 'high', good: Card[]): string {
  return {
    seq: `Je hebt een serie vanaf je hoogste kaart: kom uit met de hoogste daarvan, ${names(good)}.`,
    low: `Geen serie vanaf je hoogste kaart, wel een honneur: kom uit met een lage kaart (${names(good)}).`,
    high: `Geen honneur in deze kleur: kom uit met een hoge kaart (${names(good)}), dan weet partner dat je hier niets hebt.`,
  }[kind]
}

/**
 * Bekijk de kaart die jij wilt spelen. `seat` is de hand waaruit je speelt
 * (als leider kan dat ook de dummy zijn). Geeft een oordeel als er een
 * vuistregel van toepassing is, anders null.
 */
export function checkPlay(t: Table, seat: Seat, card: Card, used: Set<string>): Verdict | null {
  const c = t.contract!
  const decl = c.declarer
  const declSide = seat === decl || seat === partnerOf(decl)
  const tr = trump(t)
  const hand = t.hands[seat]
  const pos = t.trick.length
  const dummy = dummyOf(t)!

  // ------------------------------------------------ tegenspel
  if (!declSide) {
    // De uitkomst.
    if (!t.tricks.length && pos === 0) {
      const a = leadAdvice(ofSuit(hand, card.suit))
      if (!a) return null
      if (!a.good.some((g) => sameCard(g, card))) return tip('h3', 'uitkomen', leadExplain(a.kind, a.good), a.good)
      return fine('h3', 'uitkomen', `Goede uitkomst! ${leadExplain(a.kind, a.good)}`)
    }
    if (pos === 0) return null
    const led = t.trick[0]
    const mine = ofSuit(hand, led.card.suit)
    if (!mine.length || card.suit !== led.card.suit) return null
    const leaderIsOpp = led.seat !== partnerOf(seat)

    // Tweede hand: honneur op honneur, anders laag.
    if (pos === 1 && leaderIsOpp) {
      const covers = mine.filter((x) => x.rank > led.card.rank)
      if (led.card.rank >= 11 && covers.length) {
        const below = { suit: led.card.suit, rank: led.card.rank - 1 }
        const dummySeq = led.seat === dummy && t.hands[dummy].some((x) => sameCard(x, below))
        if (!dummySeq && card.rank < led.card.rank) {
          const cover = lowest(covers)
          return tip('h9', 'honneur op honneur', `De tegenpartij speelt een honneur (${cardLabel(led.card)}) voor. Leg er een honneur op: met ${cardLabel(cover)} moet de leider twee honneurs gebruiken voor één slag, en kan een lagere kaart van jullie een slag worden.`, [cover])
        }
        if (dummySeq && card.rank > led.card.rank) {
          const smalls = mine.filter((x) => x.rank < led.card.rank)
          if (smalls.length) return tip('h9', 'honneur op honneur', `De dummy heeft ook ${rankLabel(below.rank)}: na je dekking zijn de dummykaarten toch vrij. Er kan bij jullie niets promoveren, dus dekken heeft hier geen zin.`, [lowest(smalls)])
        }
        return fine('h9', 'honneur op honneur')
      }
      if (led.card.rank <= 10 && card.rank >= 12 && mine.some((x) => x.rank < 10) && !used.has('tweede hand')) {
        const fourth = partnerOf(led.seat)
        const fourthShown = fourth === dummy ? ofSuit(t.hands[dummy], led.card.suit) : null
        // Kan de kaart slagen maken die anders verloren gaan? Laat de regel dan los.
        if (fourthShown && !fourthShown.some((x) => x.rank > card.rank) && outstandingAbove(t, card, hand) === 0) return null
        const lows = mine.filter((x) => x.rank < 10)
        return tip('h9', 'tweede hand', `Tweede hand laag: je partner zit nog achter de leider. Bewaar ${cardLabel(card)} om een honneur van de tegenpartij te vangen.`, [lowest(lows)])
      }
      if (led.card.rank <= 10 && card.rank < 10 && mine.some((x) => x.rank >= 12)) return fine('h9', 'tweede hand')
      return null
    }

    // Derde hand: zo hoog als nodig.
    if (pos === 2 && !leaderIsOpp && led.card.rank <= 10) {
      const second = t.trick[1]
      const w = trickWinner(t.trick, tr)
      if (w.card.suit !== led.card.suit) return null
      let i = 0
      while (i + 1 < mine.length && mine[i + 1].rank === mine[i].rank - 1) i++
      const topSeq = mine.slice(0, i + 1)
      const bottom = topSeq[topSeq.length - 1]
      // Ligt de dummy als vierde hand? Dan weet je precies wat nodig is; dat laten we hier.
      if (partnerOf(second.seat) === dummy) return null
      if (bottom.rank <= w.card.rank || bottom.rank < 10) return null
      if (card.rank < bottom.rank)
        return tip('h3', 'derde hand', `De derde man doet wat hij kan: speel hoog, ${cardLabel(bottom)}. Zo win je de slag of dwing je de leider een hoge kaart te gebruiken.${topSeq.length > 1 ? ' Van kaarten die aansluiten speel je de laagste.' : ''}`, [bottom])
      return fine('h3', 'derde hand')
    }
    return null
  }

  // ------------------------------------------------ als leider
  const other = partnerOf(seat)
  const both = [...t.hands[decl], ...t.hands[dummy]]
  if (pos !== 0) return null

  // Troef trekken.
  if (tr && card.suit !== tr && !used.has('troef trekken')) {
    const ours = both.filter((x) => x.suit === tr).length
    const oppTr = 13 - ours - playedCards(t).filter((x) => x.suit === tr).length
    const ruffPlan = ofSuit(t.hands[other], card.suit).length < ofSuit(hand, card.suit).length && ofSuit(t.hands[other], tr).length > 0
    if (oppTr > 0 && ours >= 8 && ofSuit(hand, tr).length && !ruffPlan && t.tricks.length <= 6)
      return tip('h9', 'troef trekken', `De tegenpartij heeft nog ${oppTr} troef${oppTr > 1 ? 'en' : ''}. Meestal trek je eerst troef, anders kunnen ze je hoge kaarten introeven.`, ofSuit(hand, tr).slice(0, 1))
  }

  const H = ofSuit(hand, card.suit), O = ofSuit(t.hands[other], card.suit)

  // Snijden: speel naar de A V toe, niet ervan af.
  if (!used.has('snijden') && H.some((x) => x.rank === 14) && H.some((x) => x.rank === 12) && O.length) {
    const kGone = playedCards(t).some((x) => x.suit === card.suit && x.rank === 13) || both.some((x) => x.suit === card.suit && x.rank === 13)
    if (!kGone && (card.rank === 14 || card.rank < 12))
      return tip('h2', 'snijden', `Met A V speel je **naar** de A V toe: begin met een kleine kaart uit de andere hand. Zit de heer vóór je A V, dan wint je vrouw. Kun je de andere hand nu niet bereiken, speel dan gerust door.`)
  }

  // De korte hand eerst.
  if (!used.has('korte hand') && H.length > O.length && O.length) {
    const mineAll = both
    const topsO = O.filter((x) => outstandingAbove(t, x, mineAll) === 0)
    const isTopCard = outstandingAbove(t, card, mineAll) === 0
    const sure = topTricks(t, card.suit, t.hands[decl], t.hands[dummy])
    if (isTopCard && topsO.length === O.length && sure >= O.length + 1 && card.rank > topsO[0].rank)
      return tip('h2', 'korte hand', `Speel eerst de hoge kaart${O.length > 1 ? 'en' : ''} van de korte hand (${names(O)}). Anders kom je straks niet meer bij je vrije slagen in de lange hand.`)
  }
  return null
}

/** Speelplan: vaste slagen per kleur voor de leiderspartij. */
export function planCount(t: Table): { per: Record<Suit, number>; total: number; need: number } {
  const d = t.contract!.declarer
  const per = {} as Record<Suit, number>
  for (const s of SUITS) per[s] = topTricks(t, s, t.hands[d], t.hands[partnerOf(d)])
  const total = SUITS.reduce((a, s) => a + per[s], 0)
  return { per, total, need: 6 + t.contract!.level }
}

/** De kleur die het meest oplevert om te ontwikkelen: lang, met aansluitende honneurs. */
export function developSuit(t: Table): Suit | null {
  const d = t.contract!.declarer
  const a = t.hands[d], b = t.hands[partnerOf(d)]
  const tr = trump(t)
  let best: Suit | null = null
  let bestVal = 0
  for (const s of SUITS) {
    if (s === tr) continue
    const len = Math.max(ofSuit(a, s).length, ofSuit(b, s).length)
    const extra = len - topTricks(t, s, a, b)
    const honours = [...a, ...b].filter((x) => x.suit === s && x.rank >= 10).length
    const val = extra * 2 + honours + ofSuit(a, s).length + ofSuit(b, s).length - 6
    if (extra > 0 && val > bestVal) { bestVal = val; best = s }
  }
  return best
}

// ---------------------------------------------------------- commentaar

/** Een korte opmerking over de slag die net af is, of null. */
export function commentTrick(t: Table, you: Seat[]): string | null {
  const last = t.tricks[t.tricks.length - 1]
  if (!last) return null
  const c = t.contract!
  const declSide = (s: Seat) => s === c.declarer || s === partnerOf(c.declarer)
  const tr = trump(t)
  const led = last.cards[0].card.suit
  const youDeclare = you.includes(c.declarer)

  // Een snit van de leider.
  if (youDeclare) {
    const q = last.cards.find((p) => declSide(p.seat) && p.card.rank === 12 && p.card.suit === led)
    if (q && last.cards[0].seat !== q.seat && last.cards[0].card.rank < 12) {
      const handHadAce = t.deal[q.seat].some((x) => x.suit === led && x.rank === 14)
      if (handHadAce) {
        if (last.winner === q.seat) return `De snit lukt! De heer zat vóór je A V. Je vrouw wint de slag.`
        const k = last.cards.find((p) => p.card.suit === led && p.card.rank === 13)
        if (k) return `De snit mislukt: ${SEAT_NAME[k.seat]} had de heer achter je vrouw. Toch was snijden de beste kans.`
      }
    }
  }
  // Introeven.
  const ruff = tr && led !== tr ? last.cards.find((p) => p.card.suit === tr && p.seat === last.winner) : null
  if (ruff && !declSide(ruff.seat) && youDeclare) return `${SEAT_NAME[ruff.seat]} troeft je slag! Daarom trek je als leider meestal eerst troef.`
  // Troeven zijn binnen.
  if (tr && youDeclare && led === tr) {
    const ours = [...t.deal[c.declarer], ...t.deal[partnerOf(c.declarer)]].filter((x) => x.suit === tr)
    const oppLeft = 13 - ours.length - playedCards(t).filter((x) => x.suit === tr && !ours.some((y) => sameCard(x, y))).length
    if (oppLeft === 0 && last.cards.some((p) => !declSide(p.seat) && p.card.suit === tr)) return 'De tegenpartij heeft geen troef meer. Nu kun je veilig je vrije slagen spelen.'
  }
  return null
}

