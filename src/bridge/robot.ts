// De robots aan tafel spelen met eenvoudige vuistregels, dezelfde als in
// deel 1: uitkomen van een serie, tweede hand laag, derde hand hoog, honneur
// op honneur, troef trekken en snijden. Ze kijken alleen naar wat een echte
// speler ook ziet: de eigen hand, de dummy en de gespeelde kaarten.

import { type Card, type Seat, type Suit, SUITS, cardsIn, leftOf, partnerOf, sameCard } from './cards'
import { parseBid } from './bidding'
import { seatAt } from './auction'
import { type Table, addCard, collect, dummyOf, dummyVisible, legalPlays, playedCards, toAct, trump } from './table'
import { trickWinner } from './play'

const low = (cs: Card[]) => cs.reduce((a, b) => (b.rank < a.rank ? b : a))
const high = (cs: Card[]) => cs.reduce((a, b) => (b.rank > a.rank ? b : a))
const ofSuit = (cs: Card[], s: Suit) => cs.filter((c) => c.suit === s)

/** Kaarten die deze speler kan zien: eigen hand, plus de dummy als die open ligt. */
function known(t: Table, seat: Seat): Card[] {
  const d = dummyOf(t)
  const own = t.hands[seat]
  if (!d) return own
  if (seat === t.contract!.declarer) return [...own, ...t.hands[d]]
  if (dummyVisible(t) && seat !== d) return [...own, ...t.hands[d]]
  if (seat === d) return [...own, ...t.hands[t.contract!.declarer]]
  return own
}

/** Ongespeelde kaarten van een kleur die hoger zijn dan `card` en die we niet zelf kennen. */
function threats(t: Table, card: Card, mine: Card[]): number {
  const gone = playedCards(t)
  let n = 0
  for (let r = card.rank + 1; r <= 14; r++) {
    const c = { suit: card.suit, rank: r }
    if (!gone.some((g) => sameCard(g, c)) && !mine.some((m) => sameCard(m, c))) n++
  }
  return n
}

/** Is deze kaart de hoogste die nog in het spel is (op kaarten van eigen partij na)? */
const isTop = (t: Table, card: Card, mine: Card[]) => threats(t, card, mine) === 0

/** Vaste slagen van de leiderspartij in een kleur, met de kaarten die nog over zijn. */
export function topTricks(t: Table, suit: Suit, a: Card[], b: Card[]): number {
  const gone = playedCards(t)
  const ours = [...a, ...b]
  let n = 0
  for (let r = 14; r >= 2; r--) {
    const c = { suit, rank: r }
    if (gone.some((g) => sameCard(g, c))) continue
    if (ours.some((o) => sameCard(o, c))) n++
    else break
  }
  return Math.min(n, Math.max(ofSuit(a, suit).length, ofSuit(b, suit).length))
}

/** Uitkomen volgens deel 1: hoogste van een serie vanaf de top, anders met een honneur laag, zonder honneur hoog. */
export function leadCard(cards: Card[]): Card {
  const cs = [...cards].sort((a, b) => b.rank - a.rank)
  if (cs.length >= 2 && cs[0].rank >= 10 && cs[1].rank === cs[0].rank - 1) return cs[0]
  if (cs.length <= 2) return cs[0]
  if (cs[0].rank >= 11) return cs[cs.length - 1]
  return cs[0]
}

/** De laagste kaart van de bovenste serie (bijvoorbeeld de V uit H V 4). */
function bottomOfTop(cs: Card[]): Card {
  const s = [...cs].sort((a, b) => b.rank - a.rank)
  let i = 0
  while (i + 1 < s.length && s[i + 1].rank === s[i].rank - 1) i++
  return s[i]
}

const beats = (c: Card, w: Card, tr: Suit | null) => (c.suit === w.suit ? c.rank > w.rank : c.suit === tr)

export function robotCard(t: Table, seat: Seat): Card {
  const legal = legalPlays(t, seat)
  if (legal.length === 1) return legal[0]
  const c = t.contract!
  const declSide = seat === c.declarer || seat === partnerOf(c.declarer)
  if (!t.trick.length) return declSide ? declarerLead(t, seat) : defenderLead(t, seat)
  return follow(t, seat, legal, declSide)
}

// ----------------------------------------------------------- bijspelen

function follow(t: Table, seat: Seat, legal: Card[], declSide: boolean): Card {
  const tr = trump(t)
  const led = t.trick[0].card
  const w = trickWinner(t.trick, tr)
  const partnerWins = w.seat === partnerOf(seat)
  const pos = t.trick.length
  const mine = known(t, seat)
  const following = legal[0].suit === led.suit

  if (!following) {
    const trumps = tr ? legal.filter((x) => x.suit === tr) : []
    const partnerSafe = partnerWins && (pos === 3 || isTop(t, w.card, mine) || w.card.rank >= 13)
    if (trumps.length && !partnerSafe) {
      const over = trumps.filter((x) => beats(x, w.card, tr))
      if (over.length) return low(over)
    }
    return discard(t, seat, legal)
  }

  const over = legal.filter((x) => beats(x, w.card, tr))
  if (pos === 3) return partnerWins || !over.length ? low(legal) : low(over)

  if (pos === 1) {
    // Honneur op honneur, behalve als de dummy de kaart eronder heeft.
    if (led.rank >= 11 && over.length) {
      const leader = t.trick[0].seat
      const below = { suit: led.suit, rank: led.rank - 1 }
      const leaderVisible = leader === dummyOf(t) || declSide
      const seq = leaderVisible && t.hands[leader].some((x) => sameCard(x, below))
      if (!seq) return low(over)
    }
    if (declSide) {
      // Als tweede hand van de leiderspartij: met een vrije slag in de andere hand laag.
      const other = t.hands[partnerOf(seat)]
      const otherTop = ofSuit(other, led.suit).some((x) => isTop(t, x, mine))
      if (!otherTop) {
        const tops = over.filter((x) => isTop(t, x, mine))
        if (tops.length && t.tricks.length >= 1) return low(tops)
      }
    }
    return low(legal)
  }

  // Derde hand.
  const fourth = leftOf(seat)
  const fourthVisible = fourth === dummyOf(t) && dummyVisible(t) || declSide && fourth === partnerOf(seat)
  if (partnerWins) {
    if (isTop(t, w.card, mine)) return low(legal)
    if (fourthVisible) {
      const f = ofSuit(t.hands[fourth], led.suit)
      if (!f.some((x) => x.rank > w.card.rank) && (f.length || !tr || !ofSuit(t.hands[fourth], tr).length)) return low(legal)
    }
    if (!declSide && w.card.rank >= 11) return low(legal)
  }
  if (declSide) {
    // Een kaart die de slag kan houden: een topkaart, of de snit (A V: de vrouw).
    const target = Math.max(...t.trick.map((p) => (p.card.suit === led.suit ? p.card.rank : 0)))
    const win = legal.filter((x) => x.rank > target && (threats(t, x, mine) === 0 || (x.rank >= 10 && threats(t, x, mine) === 1)))
    return win.length ? low(win) : low(legal)
  }
  // Tegenspeler: derde hand hoog, zo hoog als nodig.
  if (!over.length) return low(legal)
  if (fourthVisible) {
    const f = ofSuit(t.hands[fourth], led.suit)
    const best = f.length ? high(f) : null
    const enough = best ? over.filter((x) => x.rank > best.rank) : over
    return enough.length ? low(enough) : low(legal)
  }
  const top = bottomOfTop(legal)
  return beats(top, w.card, tr) ? top : low(over)
}

function discard(t: Table, seat: Seat, legal: Card[]): Card {
  const tr = trump(t)
  const mine = known(t, seat)
  let best: Card | null = null
  let bestVal = Infinity
  for (const s of SUITS) {
    const cs = ofSuit(legal, s)
    if (!cs.length) continue
    const lowest = low(cs)
    let val = cs.filter((x) => x.rank >= 11).length * 10 + cs.filter((x) => isTop(t, x, mine)).length * 30 - cs.length
    if (s === tr) val += 100
    if (val < bestVal) { bestVal = val; best = lowest }
  }
  return best ?? low(legal)
}

// --------------------------------------------------------- uitkomen

/** Kleuren die een speler in de bieding noemde. */
function bidSuits(t: Table, seat: Seat): Suit[] {
  const out: Suit[] = []
  t.calls.forEach((c, i) => {
    const p = parseBid(c)
    if (p && p.strain !== 'NT' && seatAt(t.dealer, i) === seat) out.push(p.strain)
  })
  return out
}

function defenderLead(t: Table, seat: Seat): Card {
  const hand = t.hands[seat]
  const tr = trump(t)
  const partner = partnerOf(seat)
  const mine = known(t, seat)
  const decl = t.contract!.declarer
  const oppSuits = [...bidSuits(t, decl), ...bidSuits(t, partnerOf(decl))]
  const sideSuits = SUITS.filter((s) => s !== tr && ofSuit(hand, s).length)

  if (!t.tricks.length) {
    const ps = bidSuits(t, partner).find((s) => s !== tr && ofSuit(hand, s).length)
    if (ps) return leadCard(ofSuit(hand, ps))
    const seqSuit = sideSuits.find((s) => {
      const cs = cardsIn(hand, s)
      return cs.length >= 2 && cs[0] >= 12 && cs[1] === cs[0] - 1
    })
    if (seqSuit) return leadCard(ofSuit(hand, seqSuit))
    const score = (s: Suit) => {
      const cs = cardsIn(hand, s)
      let v = cs.length * 3 + cs.filter((r) => r >= 11).length
      if (oppSuits.includes(s)) v -= 8
      if (tr && cs[0] === 14 && cs[1] !== 13) v -= 6
      if (!tr && cs.length >= 4) v += 3
      return v
    }
    const pool = sideSuits.length ? sideSuits : SUITS.filter((s) => ofSuit(hand, s).length)
    const s = [...pool].sort((a, b) => score(b) - score(a))[0]
    return leadCard(ofSuit(hand, s))
  }

  // Later in het spel: vrije slagen incasseren als dat veilig is.
  const dummy = dummyOf(t)!
  for (const s of sideSuits) {
    const tops = ofSuit(hand, s).filter((x) => isTop(t, x, mine))
    if (!tops.length) continue
    const ruffable = tr && dummyVisible(t) && !ofSuit(t.hands[dummy], s).length && ofSuit(t.hands[dummy], tr).length
    if (!ruffable) return high(tops)
  }
  // Partners kleur terugspelen.
  const partnerLed = t.tricks.find((x) => x.cards[0].seat === partner)?.cards[0].card.suit
  if (partnerLed && partnerLed !== tr && ofSuit(hand, partnerLed).length) {
    const cs = ofSuit(hand, partnerLed)
    return cs.length <= 2 ? high(cs) : low(cs)
  }
  // Je eigen eerste kleur doorspelen.
  const ownLed = t.tricks.find((x) => x.cards[0].seat === seat)?.cards[0].card.suit
  if (ownLed && ownLed !== tr && ofSuit(hand, ownLed).length >= 2) return leadCard(ofSuit(hand, ownLed))
  const pool = sideSuits.length ? sideSuits : SUITS.filter((s) => ofSuit(hand, s).length)
  const s = [...pool].sort((a, b) => ofSuit(hand, b).length - ofSuit(hand, a).length)[0]
  return leadCard(ofSuit(hand, s))
}

function declarerLead(t: Table, seat: Seat): Card {
  const tr = trump(t)
  const H = t.hands[seat], O = t.hands[partnerOf(seat)]
  const mine = [...H, ...O]
  const gone = playedCards(t)
  const c = t.contract!
  const need = 6 + c.level
  const won = t.tricks.filter((x) => x.winner === seat || x.winner === partnerOf(seat)).length

  // 1. Troef trekken zolang de tegenpartij nog troef heeft en wij er meer hebben.
  if (tr) {
    const ourTr = ofSuit(mine, tr).length
    const oppTr = 13 - ourTr - gone.filter((g) => g.suit === tr).length
    if (oppTr > 0 && ourTr > oppTr && ofSuit(H, tr).length) return playSuit(t, seat, tr)
  }
  // 2. Genoeg vaste slagen? Incasseren.
  const sure = SUITS.map((s) => topTricks(t, s, H, O))
  const total = sure.reduce((a, b) => a + b, 0)
  if (won + total >= need) {
    const s = SUITS.find((x, i) => sure[i] > 0 && ofSuit(H, x).length)
    if (s) return playSuit(t, seat, s)
  }
  // 3. Troefcontract: een verliezer introeven in de korte hand.
  if (tr && ofSuit(O, tr).length) {
    const s = SUITS.find((x) => x !== tr && ofSuit(H, x).length && !ofSuit(O, x).length && !ofSuit(H, x).some((y) => isTop(t, y, mine)))
    if (s) return low(ofSuit(H, s))
  }
  // 4. De beste kleur ontwikkelen: lang en met honneurs, nog niet helemaal vrij.
  const score = (s: Suit) => {
    const a = ofSuit(H, s), b = ofSuit(O, s)
    if (!a.length) return -99
    const len = a.length + b.length
    const honours = [...a, ...b].filter((x) => x.rank >= 10).length
    const done = topTricks(t, s, H, O) >= Math.max(a.length, b.length)
    return len * 2 + honours * 2 - (done ? 6 : 0) - (s === tr ? 3 : 0)
  }
  const s = [...SUITS].sort((a, b) => score(b) - score(a))[0]
  return playSuit(t, seat, s)
}

/** Speel een kleur slim: de korte hand eerst, naar een vork toe, of een serie van boven. */
function playSuit(t: Table, seat: Seat, s: Suit): Card {
  const H = ofSuit(t.hands[seat], s)
  const O = ofSuit(t.hands[partnerOf(seat)], s)
  const mine = [...t.hands[seat], ...t.hands[partnerOf(seat)]]
  const topsH = H.filter((x) => isTop(t, x, mine))
  const topsO = O.filter((x) => isTop(t, x, mine))
  // Korte hand eerst: heeft deze hand minder kaarten en een vrije slag, speel die.
  if (topsH.length && (H.length <= O.length || !topsO.length)) return high(topsH)
  // Vrije slagen in de andere hand: speel klein ernaartoe.
  if (topsO.length && H.length) return low(H)
  // Een vork (A V of H B) in de andere hand: klein ernaartoe, dan snijden.
  const oRanks = O.map((x) => x.rank)
  const tenace = O.length >= 2 && oRanks.some((r) => isTop(t, { suit: s, rank: r }, mine)) && oRanks.some((r) => threats(t, { suit: s, rank: r }, mine) === 1)
  if (tenace) return low(H)
  // Een serie van boven (H V B, V B 10): de hoogste maakt de aas van de tegenpartij los.
  const sorted = [...H].sort((a, b) => b.rank - a.rank)
  if (sorted.length >= 2 && sorted[0].rank >= 10 && sorted[1].rank === sorted[0].rank - 1) return sorted[0]
  return low(H)
}

// ------------------------------------------------------------ uitspelen

/** Laat robots de rest van het spel spelen (voor de andere tafel of "rest automatisch"). */
export function playOut(t: Table): Table {
  let x = t
  let guard = 0
  while (x.phase === 'play' && guard++ < 80) {
    if (x.trick.length === 4) { x = collect(x); continue }
    const seat = toAct(x)!
    x = addCard(x, robotCard(x, seat))
  }
  return x
}
