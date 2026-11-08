// Eén spel aan tafel: bieden, afspelen en de score. Alles is onveranderlijk:
// elke stap geeft een nieuwe tafel terug, zodat de app makkelijk kan tekenen.

import { type Card, type Deal, type Seat, type Suit, SEATS, leftOf, partnerOf, sameCard, sortHand } from './cards'
import { type Bid } from './bidding'
import { type Contract, auctionOver, finalContract, seatAt } from './auction'
import { type PlayedCard, trickWinner } from './play'

export interface Trick { cards: PlayedCard[]; winner: Seat }

export interface Table {
  /** De kaarten zoals ze gedeeld zijn. */
  deal: Deal
  /** Wat iedereen nog in de hand heeft. */
  hands: Deal
  dealer: Seat
  calls: Bid[]
  contract: Contract | null
  /** De slag op tafel; vier kaarten = af, wacht op `collect`. */
  trick: PlayedCard[]
  tricks: Trick[]
  phase: 'auction' | 'play' | 'done'
}

export function newTable(deal: Deal, dealer: Seat): Table {
  return { deal, hands: deal, dealer, calls: [], contract: null, trick: [], tricks: [], phase: 'auction' }
}

/** Een tafel waar de bieding al gedaan is (bijvoorbeeld door robots). */
export function tableWithAuction(deal: Deal, dealer: Seat, calls: Bid[]): Table {
  let t = newTable(deal, dealer)
  for (const c of calls) t = addCall(t, c)
  return t
}

export const trump = (t: Table): Suit | null => (t.contract && t.contract.strain !== 'NT' ? t.contract.strain : null)
export const dummyOf = (t: Table): Seat | null => (t.contract ? partnerOf(t.contract.declarer) : null)
/** De dummy gaat open na de uitkomst. */
export const dummyVisible = (t: Table) => t.phase !== 'auction' && (t.tricks.length > 0 || t.trick.length > 0)

/** Wie moet nu iets doen? null als de slag nog opgeruimd moet worden of het spel klaar is. */
export function toAct(t: Table): Seat | null {
  if (t.phase === 'auction') return seatAt(t.dealer, t.calls.length)
  if (t.phase === 'done' || t.trick.length === 4) return null
  if (t.trick.length) return leftOf(t.trick[t.trick.length - 1].seat)
  if (!t.tricks.length) return leftOf(t.contract!.declarer)
  return t.tricks[t.tricks.length - 1].winner
}

export function addCall(t: Table, call: Bid): Table {
  const calls = [...t.calls, call]
  if (!auctionOver(calls)) return { ...t, calls }
  const contract = finalContract(t.dealer, calls)
  return { ...t, calls, contract, phase: contract ? 'play' : 'done' }
}

export function legalPlays(t: Table, seat: Seat): Card[] {
  const hand = t.hands[seat]
  if (!t.trick.length || t.trick.length === 4) return hand
  const led = t.trick[0].card.suit
  const follow = hand.filter((c) => c.suit === led)
  return follow.length ? follow : hand
}

export function addCard(t: Table, card: Card): Table {
  const seat = toAct(t)!
  const hands = { ...t.hands, [seat]: t.hands[seat].filter((c) => !sameCard(c, card)) }
  return { ...t, hands, trick: [...t.trick, { seat, card }] }
}

/** Ruim een volle slag op; na de dertiende slag is het spel klaar. */
export function collect(t: Table): Table {
  if (t.trick.length !== 4) return t
  const winner = trickWinner(t.trick, trump(t)).seat
  const tricks = [...t.tricks, { cards: t.trick, winner }]
  return { ...t, trick: [], tricks, phase: tricks.length === 13 ? 'done' : 'play' }
}

/** Slagen van de partij van de leider. */
export function declarerTricks(t: Table): number {
  if (!t.contract) return 0
  const d = t.contract.declarer
  return t.tricks.filter((x) => x.winner === d || x.winner === partnerOf(d)).length
}

export const nsTricks = (t: Table) => t.tricks.filter((x) => x.winner === 'N' || x.winner === 'S').length

/** Alle kaarten die al gespeeld zijn (ook in de lopende slag). */
export function playedCards(t: Table): Card[] {
  return [...t.tricks.flatMap((x) => x.cards.map((p) => p.card)), ...t.trick.map((p) => p.card)]
}

// ------------------------------------------------------------------ score

/**
 * Wedstrijdtelling, niet kwetsbaar. Per slag boven de zes: ♣ ♦ 20, ♥ ♠ 30,
 * SA 40 voor de eerste en 30 voor de rest. 100 of meer is een manche (+300),
 * anders een deelscore (+50). Down: 50 per slag (gedoubleerd 100, 300, 500, …).
 */
export function contractScore(c: Contract, tricks: number): { score: number; parts: string[] } {
  const need = 6 + c.level
  const per = c.strain === 'NT' ? 30 : c.strain === 'H' || c.strain === 'S' ? 30 : 20
  const mult = c.doubled === 2 ? 4 : c.doubled === 1 ? 2 : 1
  if (tricks >= need) {
    const base = (c.strain === 'NT' ? 40 + 30 * (c.level - 1) : per * c.level) * mult
    const parts = [`contract ${base}`]
    let score = base
    const bonus = base >= 100 ? 300 : 50
    score += bonus
    parts.push(base >= 100 ? `manche ${bonus}` : `deelscore ${bonus}`)
    if (c.level === 6) { score += 500; parts.push('klein slem 500') }
    if (c.level === 7) { score += 1000; parts.push('groot slem 1000') }
    if (c.doubled) { const ins = 50 * c.doubled; score += ins; parts.push(`gedoubleerd gemaakt ${ins}`) }
    const over = tricks - need
    if (over > 0) {
      const o = c.doubled ? over * 100 * c.doubled : over * per
      score += o
      parts.push(`${over} overslag${over > 1 ? 'en' : ''} ${o}`)
    }
    return { score, parts }
  }
  const down = need - tricks
  let pen = 0
  if (!c.doubled) pen = 50 * down
  else for (let i = 1; i <= down; i++) pen += (i === 1 ? 100 : i <= 3 ? 200 : 300) * c.doubled
  return { score: -pen, parts: [`${down} down: ${pen}`] }
}

/** Score voor noord-zuid (positief is goed voor noord-zuid). */
export function nsScore(t: Table): number {
  if (!t.contract) return 0
  const s = contractScore(t.contract, declarerTricks(t)).score
  return t.contract.declarer === 'N' || t.contract.declarer === 'S' ? s : -s
}

// ------------------------------------------------------------------ delen

/** Draai het spel een halve slag: noord wordt zuid, oost wordt west. */
export function rotateDeal(d: Deal): Deal {
  return { N: d.S, E: d.W, S: d.N, W: d.E }
}
export const rotateSeat = (s: Seat): Seat => partnerOf(s)

export function sortedDeal(d: Deal): Deal {
  const out = {} as Deal
  for (const s of SEATS) out[s] = sortHand(d[s])
  return out
}
