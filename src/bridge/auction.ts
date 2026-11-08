// Een hele bieding aan tafel: wie is aan de beurt, wat mag, wat betekent
// een bod, en wat biedt een robot. Waar deel 1 een afspraak heeft, gebruiken
// we de functies uit bidding.ts. Daarbuiten ("vrije" biedingen, zoals het
// herbod van de openaar) bieden de robots eenvoudig en natuurlijk: fit
// zoeken, punten optellen, manche bij 25.

import {
  type Hand, type Seat, type Strain, type Suit, SUITS, SUIT_NAME, SUIT_SYMBOL,
  hcp, isBalanced, isMajor, leftOf, partnerOf, shape,
} from './cards'
import {
  type Advice, type Bid, ALL_BIDS, answerToDouble, bidLabel, bidRank, call, chooseSuit, competitiveAction,
  cheapestLevel, openingBid, parseBid, responseTo2C, responseToNT, responseToSuit, staymanAnswer,
} from './bidding'

export interface Contract {
  level: number
  strain: Strain
  declarer: Seat
  doubled: 0 | 1 | 2
}

export function seatAt(dealer: Seat, i: number): Seat {
  let s = dealer
  for (let k = 0; k < i; k++) s = leftOf(s)
  return s
}

export const sameSide = (a: Seat, b: Seat) => a === b || partnerOf(a) === b

/** Klaar na drie keer pas achter elkaar (of vier keer pas aan het begin). */
export const auctionOver = (calls: Bid[]) => calls.length >= 4 && calls.slice(-3).every((c) => c === 'P')

interface BidAt { bid: Bid; seat: Seat; i: number }

export function lastBid(dealer: Seat, calls: Bid[]): BidAt | null {
  for (let i = calls.length - 1; i >= 0; i--) if (parseBid(calls[i])) return { bid: calls[i], seat: seatAt(dealer, i), i }
  return null
}

export function legalCalls(dealer: Seat, calls: Bid[]): Bid[] {
  const me = seatAt(dealer, calls.length)
  const lb = lastBid(dealer, calls)
  const out: Bid[] = ['P']
  let j = calls.length - 1
  while (j >= 0 && calls[j] === 'P') j--
  if (j >= 0 && !sameSide(seatAt(dealer, j), me)) {
    if (parseBid(calls[j])) out.push('X')
    else if (calls[j] === 'X') out.push('XX')
  }
  for (const b of ALL_BIDS) if (!lb || bidRank(b) > bidRank(lb.bid)) out.push(b)
  return out
}

/** Het eindcontract; de leider is wie van die partij de speelsoort het eerst noemde. */
export function finalContract(dealer: Seat, calls: Bid[]): Contract | null {
  const lb = lastBid(dealer, calls)
  if (!lb) return null
  const p = parseBid(lb.bid)!
  let declarer = lb.seat
  for (let i = 0; i < calls.length; i++) {
    const q = parseBid(calls[i])
    const s = seatAt(dealer, i)
    if (q && q.strain === p.strain && sameSide(s, lb.seat)) { declarer = s; break }
  }
  let doubled: 0 | 1 | 2 = 0
  for (let i = lb.i + 1; i < calls.length; i++) {
    if (calls[i] === 'X') doubled = 1
    if (calls[i] === 'XX') doubled = 2
  }
  return { level: p.level, strain: p.strain, declarer, doubled }
}

export const gameLevel = (s: Strain) => (s === 'NT' ? 3 : isMajor(s as Suit) ? 4 : 5)

export function contractLabel(c: Contract): string {
  return `${c.level}${SUIT_SYMBOL[c.strain]}${c.doubled === 1 ? ' X' : c.doubled === 2 ? ' XX' : ''}`
}

// ------------------------------------------------------------ situaties

/** De biedsituaties waar deel 1 een afspraak voor heeft; de rest is 'free'. */
export type Situation =
  | { kind: 'open' }
  | { kind: 'respond-suit'; opened: Suit }
  | { kind: 'respond-nt'; level: 1 | 2 }
  | { kind: 'stayman-answer'; level: 1 | 2 }
  | { kind: 'transfer-accept'; level: 1 | 2; suit: Suit }
  | { kind: 'respond-2c' }
  | { kind: 'overcall'; opened: Suit }
  | { kind: 'advance-double'; opened: Suit }
  | { kind: 'free' }

export function situation(dealer: Seat, calls: Bid[]): Situation {
  const me = seatAt(dealer, calls.length)
  const n = calls.length
  const bids = calls.map((c, i) => ({ c, i, seat: seatAt(dealer, i) })).filter((x) => x.c !== 'P')
  if (!bids.length) return { kind: 'open' }
  if (bids.length === 1) {
    const b = bids[0]
    const p = parseBid(b.c)
    if (!p) return { kind: 'free' }
    if (b.seat === partnerOf(me) && b.i === n - 2) {
      if (p.level === 1 && p.strain !== 'NT') return { kind: 'respond-suit', opened: p.strain }
      if (b.c === '1NT') return { kind: 'respond-nt', level: 1 }
      if (b.c === '2NT') return { kind: 'respond-nt', level: 2 }
      if (b.c === '2C') return { kind: 'respond-2c' }
    }
    if (b.i === n - 1 && p.level === 1 && p.strain !== 'NT') return { kind: 'overcall', opened: p.strain }
    return { kind: 'free' }
  }
  if (bids.length === 2) {
    const [a, b] = bids
    if (a.seat === me && b.seat === partnerOf(me) && b.i === a.i + 2 && n === b.i + 2) {
      const lvl = a.c === '1NT' ? 1 : a.c === '2NT' ? 2 : 0
      if (lvl === 1 || lvl === 2) {
        if (b.c === call(lvl + 1, 'C')) return { kind: 'stayman-answer', level: lvl }
        if (b.c === call(lvl + 1, 'D')) return { kind: 'transfer-accept', level: lvl, suit: 'H' }
        if (b.c === call(lvl + 1, 'H')) return { kind: 'transfer-accept', level: lvl, suit: 'S' }
      }
    }
    const pa = parseBid(a.c)
    if (pa && pa.level === 1 && pa.strain !== 'NT' && a.seat === leftOf(me) && b.c === 'X' && b.i === a.i + 1 && n === b.i + 2)
      return { kind: 'advance-double', opened: pa.strain }
  }
  return { kind: 'free' }
}

function adviseFor(sit: Situation, hand: Hand): Advice | null {
  switch (sit.kind) {
    case 'open': return openingBid(hand)
    case 'respond-suit': return responseToSuit(sit.opened, hand)
    case 'respond-nt': return responseToNT(sit.level, hand)
    case 'stayman-answer': return staymanAnswer(sit.level, hand)
    case 'transfer-accept': {
      const b = call(sit.level + 1, sit.suit)
      return { bid: b, why: `Partner vraagt met een transfer (Jacoby) om ${SUIT_NAME[sit.suit]}: je biedt ${bidLabel(b)}, hoeveel ${SUIT_NAME[sit.suit]} je ook hebt.` }
    }
    case 'respond-2c': return responseTo2C(hand)
    case 'overcall': return competitiveAction(sit.opened, hand)
    case 'advance-double': return answerToDouble(sit.opened, hand)
    case 'free': return null
  }
}

/** In welk hoofdstuk staat de afspraak voor dit bod? */
export function chapterOf(sit: Situation, a: Advice): string {
  switch (sit.kind) {
    case 'open': return a.bid.startsWith('2') ? 'h11' : 'h5a'
    case 'respond-suit': return 'h6'
    case 'respond-nt': return sit.level === 2 ? 'h11' : ['P', '2NT', '3NT'].includes(a.bid) ? 'h5b' : 'h7'
    case 'stayman-answer': case 'transfer-accept': return 'h7'
    case 'respond-2c': return 'h11'
    default: return 'h10'
  }
}

/** Naam van de vaardigheid, dezelfde als bij de oefeningen. */
export function skillOf(sit: Situation, a: Advice): string {
  switch (sit.kind) {
    case 'open': return 'openen'
    case 'respond-suit': return 'antwoorden'
    case 'respond-nt': return sit.level === 2 ? '2SA antwoorden' : a.bid === '2C' ? 'Stayman' : ['2D', '2H'].includes(a.bid) ? 'Jacoby' : '1SA antwoorden'
    case 'stayman-answer': return 'Stayman'
    case 'transfer-accept': return 'Jacoby'
    case 'respond-2c': return '2♣'
    case 'overcall': return 'tussenbieden'
    case 'advance-double': return 'informatiedoublet'
    default: return 'bieden'
  }
}

// ------------------------------------------- wat weet je van de anderen?

/** Wat een speler met zijn biedingen heeft laten zien. */
export interface Shown {
  min: number
  max: number
  /** Minimale lengte per kleur. */
  len: Record<Suit, number>
  bal: boolean
  /** Het laatste bod dwingt partner nog een keer te bieden. */
  forcing: boolean
  /** Het laatste bod was een uitnodiging voor de manche in deze speelsoort. */
  invite: Strain | null
  /** Manchedwingend (na 2♣). */
  gf: boolean
}

const freshShown = (): Shown => ({ min: 0, max: 37, len: { S: 0, H: 0, D: 0, C: 0 }, bal: false, forcing: false, invite: null, gf: false })

function narrow(s: Shown, lo: number, hi: number) {
  const nlo = Math.max(s.min, lo), nhi = Math.min(s.max, hi)
  if (nlo <= nhi) { s.min = nlo; s.max = nhi }
  else { s.min = Math.max(0, lo); s.max = Math.max(s.min, hi) }
}
const atLeast = (s: Shown, suit: Suit, n: number) => { s.len[suit] = Math.max(s.len[suit], n) }

export interface CallNote { seat: Seat; call: Bid; text: string }

/** Lees de bieding: per bod een uitleg, en per speler wat hij liet zien. */
export function readAuction(dealer: Seat, calls: Bid[]): { shown: Record<Seat, Shown>; notes: CallNote[] } {
  const shown: Record<Seat, Shown> = { N: freshShown(), E: freshShown(), S: freshShown(), W: freshShown() }
  const notes: CallNote[] = []
  for (let i = 0; i < calls.length; i++) {
    const seat = seatAt(dealer, i)
    const before = calls.slice(0, i)
    shown[seat].forcing = false
    shown[seat].invite = null
    notes.push({ seat, call: calls[i], text: meaning(situation(dealer, before), calls[i], seat, dealer, before, shown) })
  }
  return { shown, notes }
}

const sym = (s: Strain) => SUIT_SYMBOL[s]

function meaning(sit: Situation, c: Bid, seat: Seat, dealer: Seat, before: Bid[], shown: Record<Seat, Shown>): string {
  const me = shown[seat]
  const p = parseBid(c)
  switch (sit.kind) {
    case 'open': {
      if (c === 'P') { narrow(me, 0, 12); return 'Pas: minder dan 13 punten.' }
      if (c === '1NT' || c === '2NT') {
        const lo = c === '1NT' ? 15 : 20
        narrow(me, lo, lo + 2); me.bal = true
        SUITS.forEach((s) => atLeast(me, s, 2))
        return `${bidLabel(c)}: ${lo}-${lo + 2} punten en een SA-verdeling.`
      }
      if (c === '2C') { narrow(me, 23, 37); me.gf = true; me.forcing = true; return '2♣: sterk, 23 punten of meer. Zegt niets over klaveren; partner mag niet passen tot de manche.' }
      if (p && p.level === 1 && p.strain !== 'NT') { narrow(me, 13, 19); atLeast(me, p.strain, 4); return `${bidLabel(c)}: 13-19 punten en minstens een vierkaart ${SUIT_NAME[p.strain]}.` }
      if (p && p.level === 2 && p.strain !== 'NT') { narrow(me, 20, 22); atLeast(me, p.strain, 5); return `${bidLabel(c)}: sterk, 20-22 punten en een vijfkaart ${SUIT_NAME[p.strain]}.` }
      break
    }
    case 'respond-suit': {
      const o = sit.opened
      if (c === 'P') { narrow(me, 0, 5); return 'Pas: minder dan 6 punten.' }
      if (c === call(2, o)) { narrow(me, 6, 9); atLeast(me, o, 4); return `${bidLabel(c)}: steun (vier ${SUIT_NAME[o]}) en 6-9 punten.` }
      if (c === call(3, o)) { narrow(me, 10, 11); atLeast(me, o, 4); me.invite = o; return `${bidLabel(c)}: steun en 10-11 punten, een uitnodiging voor de manche.` }
      if (c === call(4, o) && isMajor(o)) { narrow(me, 12, 16); atLeast(me, o, 4); return `${bidLabel(c)}: steun en 12+ punten, direct de manche.` }
      if (c === '1NT') { narrow(me, 6, 9); return '1SA: 6-9 punten, geen steun en geen vierkaart op éénniveau.' }
      if (p && p.strain !== 'NT' && p.strain !== o && p.level === cheapestLevel(p.strain, call(1, o))) {
        narrow(me, p.level === 1 ? 6 : 10, 16); atLeast(me, p.strain, 4); me.forcing = true
        return `${bidLabel(c)}: een zoekbod, minstens een vierkaart ${SUIT_NAME[p.strain]} en ${p.level === 1 ? '6' : '10'}+ punten. Partner mag niet passen.`
      }
      break
    }
    case 'respond-nt': {
      const L = sit.level
      if (c === 'P') { narrow(me, 0, L === 1 ? 7 : 3); return `Pas: te weinig voor de manche (0-${L === 1 ? 7 : 3} punten).` }
      if (c === call(L + 1, 'C')) { narrow(me, L === 1 ? 8 : 4, 37); me.forcing = true; return `${bidLabel(c)}: Stayman, vraagt of partner een vierkaart hoog heeft.` }
      if (c === call(L + 1, 'D')) { atLeast(me, 'H', 5); me.forcing = true; return `${bidLabel(c)}: Jacoby, een vijfkaart harten. Partner moet ${L + 1}♥ bieden.` }
      if (c === call(L + 1, 'H')) { atLeast(me, 'S', 5); me.forcing = true; return `${bidLabel(c)}: Jacoby, een vijfkaart schoppen. Partner moet ${L + 1}♠ bieden.` }
      if (c === '2NT' && L === 1) { narrow(me, 8, 9); me.bal = true; me.invite = 'NT'; return '2SA: 8-9 punten, een uitnodiging voor 3SA.' }
      if (c === '3NT') { narrow(me, L === 1 ? 10 : 4, L === 1 ? 15 : 10); return '3SA: genoeg punten voor de manche.' }
      break
    }
    case 'stayman-answer': {
      const L = sit.level + 1
      if (c === call(L, 'D')) return `${bidLabel(c)}: geen vierkaart hoog.`
      if (c === call(L, 'H')) { atLeast(me, 'H', 4); return `${bidLabel(c)}: een vierkaart harten.` }
      if (c === call(L, 'S')) { atLeast(me, 'S', 4); return `${bidLabel(c)}: een vierkaart schoppen, geen vierkaart harten.` }
      break
    }
    case 'transfer-accept':
      if (c === call(sit.level + 1, sit.suit)) return `${bidLabel(c)}: voert de transfer uit.`
      break
    case 'respond-2c': {
      me.gf = true
      if (c === '2D') return '2♦: wachtbod. Zegt niets over ruiten; de 2♣-openaar vertelt verder.'
      if (p && p.strain !== 'NT') { narrow(me, 8, 37); atLeast(me, p.strain, 5); return `${bidLabel(c)}: 8+ punten en een goede vijfkaart ${SUIT_NAME[p.strain]}.` }
      break
    }
    case 'overcall': {
      if (c === 'P') return 'Pas.'
      if (c === 'X') {
        narrow(me, 13, 21); me.forcing = true
        SUITS.filter((s) => s !== sit.opened).forEach((s) => atLeast(me, s, 3))
        return `Doublet: een informatiedoublet. Openingskracht, kort in ${SUIT_NAME[sit.opened]} en steun voor de andere kleuren. Partner moet bieden.`
      }
      if (c === '1NT') { narrow(me, 15, 18); me.bal = true; return '1SA-volgbod: een sterke hand met een SA-verdeling, zoals een 1SA-opening.' }
      if (p && p.strain !== 'NT') {
        const cheap = cheapestLevel(p.strain, call(1, sit.opened))
        if (p.level === cheap) { narrow(me, cheap === 1 ? 8 : 10, 12); atLeast(me, p.strain, 5); return `${bidLabel(c)}: volgbod, een goede vijfkaart ${SUIT_NAME[p.strain]}.` }
        if (p.level === cheap + 1) { narrow(me, 13, 16); atLeast(me, p.strain, 6); return `${bidLabel(c)}: sprongvolgbod, een goede zeskaart en openingskracht.` }
      }
      break
    }
    case 'advance-double':
      if (p && p.strain !== 'NT') { narrow(me, 0, 8); atLeast(me, p.strain, 3); return `${bidLabel(c)}: antwoord op het doublet, de langste kleur (0-8 punten).` }
      break
    case 'free':
      break
  }
  return freeMeaning(c, seat, dealer, before, shown)
}

/** Kleuren die een speler zelf geboden heeft. */
function suitsBidBy(seat: Seat, dealer: Seat, calls: Bid[]): Suit[] {
  const out: Suit[] = []
  calls.forEach((c, i) => {
    const p = parseBid(c)
    if (p && p.strain !== 'NT' && seatAt(dealer, i) === seat && !out.includes(p.strain)) out.push(p.strain)
  })
  return out
}

/** Wie van deze partij bood als eerste? */
function openerOf(seat: Seat, dealer: Seat, calls: Bid[]): Seat | null {
  for (let i = 0; i < calls.length; i++) {
    const s = seatAt(dealer, i)
    if (sameSide(s, seat) && calls[i] !== 'P') return s
  }
  return null
}

type Kind = 'game' | 'invite' | 'part'
/** Uitnodigen doe je één onder de manche; in een lage kleur op drieniveau (richting 3SA). */
const inviteLevel = (s: Strain) => (s === 'NT' ? 2 : 3)
function kindOf(level: number, strain: Strain): Kind {
  return level >= gameLevel(strain) ? 'game' : level === inviteLevel(strain) ? 'invite' : 'part'
}

/** Partners bereik is smal (bijv. 15-17): dan bepaal jij. Anders vertel je wat je hebt. */
const isPlacing = (pa: Shown, paMax: number) => paMax - pa.min <= 4

function freeMeaning(c: Bid, seat: Seat, dealer: Seat, before: Bid[], shown: Record<Seat, Shown>): string {
  const me = shown[seat], pa = shown[partnerOf(seat)]
  if (c === 'P') {
    if (pa.invite) { narrow(me, me.min, 24 - pa.max); return 'Pas: wijst de uitnodiging af.' }
    return 'Pas.'
  }
  if (c === 'X') return 'Doublet: denkt dat de tegenpartij down gaat (strafdoublet).'
  if (c === 'XX') return 'Redoublet.'
  const p = parseBid(c)!
  const partnerSuits = suitsBidBy(partnerOf(seat), dealer, before)
  const mySuits = suitsBidBy(seat, dealer, before)
  const gf = me.gf || pa.gf
  const kind = kindOf(p.level, p.strain)
  let what: string
  const lbl = bidLabel(c)
  if (p.strain === 'NT') { me.bal = true; what = `${lbl}: wil sans atout spelen` }
  else if (partnerSuits.includes(p.strain)) { atLeast(me, p.strain, Math.max(3, 8 - pa.len[p.strain])); what = `${lbl}: steun voor partners ${SUIT_NAME[p.strain]}` }
  else if (mySuits.includes(p.strain)) { atLeast(me, p.strain, Math.max(5, me.len[p.strain] + 1)); what = `${lbl}: een lange ${SUIT_NAME[p.strain]}` }
  else {
    atLeast(me, p.strain, 4)
    what = `${lbl}: een nieuwe kleur, minstens vier ${SUIT_NAME[p.strain]}`
    if (kind !== 'game' && openerOf(seat, dealer, before) !== seat) { me.forcing = true; what += ' (partner mag niet passen)' }
  }
  if (gf) return `${what}.`
  if (me.forcing) return `${what}.`
  const placing = isPlacing(pa, pa.max)
  if (kind === 'game') { narrow(me, 25 - pa.max, 37); return `${what}, genoeg voor de manche.` }
  if (kind === 'invite') {
    if (placing) narrow(me, 25 - pa.max, 24 - pa.min)
    else narrow(me, 22 - pa.min, 24 - pa.min)
    me.invite = p.strain
    return `${what}, een uitnodiging voor de manche.`
  }
  narrow(me, me.min, placing ? 24 - pa.max : 21 - pa.min)
  return `${what}, zonder extra kracht.`
}

// ---------------------------------------------------------- de robot

export interface CallAdvice {
  advice: Advice
  sit: Situation
  /** Valt onder een afspraak uit deel 1 (dan kan de coach het nakijken). */
  covered: boolean
}

export function adviseCall(hand: Hand, dealer: Seat, calls: Bid[]): CallAdvice {
  const sit = situation(dealer, calls)
  const a = adviseFor(sit, hand)
  if (a && legalCalls(dealer, calls).includes(a.bid)) return { advice: a, sit, covered: true }
  return { advice: freeAdvice(hand, dealer, calls, sit), sit, covered: false }
}

export const robotCall = (hand: Hand, dealer: Seat, calls: Bid[]): Bid => adviseCall(hand, dealer, calls).advice.bid

const pts = (n: number) => `${n} punt${n === 1 ? '' : 'en'}`

function freeAdvice(hand: Hand, dealer: Seat, calls: Bid[], sit: Situation): Advice {
  const my = hcp(hand)
  const sh = shape(hand)
  const n = calls.length
  const legal = legalCalls(dealer, calls)
  const can = (b: Bid) => legal.includes(b)

  // Geen afspraak voor deze opening of dit volgbod: een eenvoudige uitweg.
  if (sit.kind === 'open') {
    if (my >= 20 && isBalanced(hand)) return { bid: '2NT', why: `${pts(my)} met een SA-verdeling: 2SA.` }
    if (my >= 13) {
      const c = chooseSuit(hand, SUITS)!
      return { bid: call(1, c.suit), why: `${pts(my)}: open in je langste kleur, 1${sym(c.suit)}.` }
    }
    return { bid: 'P', why: `${pts(my)}: te weinig om te openen.` }
  }
  if (sit.kind === 'overcall' && isBalanced(hand) && my >= 15 && my <= 18 && can('1NT'))
    return { bid: '1NT', why: `${pts(my)} met een SA-verdeling: een 1SA-volgbod, net als een 1SA-opening.` }

  const seat = seatAt(dealer, n)
  const partner = partnerOf(seat)
  const { shown } = readAuction(dealer, calls)
  const pa = shown[partner]
  const lb = lastBid(dealer, calls)
  const ourBids = calls.filter((c, i) => parseBid(c) && sameSide(seatAt(dealer, i), seat))
  if (!lb || !ourBids.length) return { bid: 'P', why: 'De tegenpartij biedt en jullie hebben nog niets laten zien: pas.' }

  const ours = sameSide(lb.seat, seat)
  const cur = parseBid(lb.bid)!
  const rhoPassed = calls[n - 1] === 'P'
  const gf = shown[seat].gf || pa.gf
  const forced = pa.forcing && rhoPassed && lb.seat === partner
  const paMax = Math.min(pa.max, 40 - my)
  const lo = my + pa.min, hi = my + paMax
  const placing = isPlacing(pa, paMax)
  const sumTxt = placing ? `samen ${lo === hi ? lo : `${lo}-${hi}`} punten` : `samen minstens ${lo} punten`

  // Fit: samen acht kaarten of meer. Een eigen zeskaart telt als fit.
  const fits = SUITS.filter((s) => sh[s] + pa.len[s] >= 8)
    .sort((a, b) => Number(isMajor(b)) - Number(isMajor(a)) || (sh[b] + pa.len[b]) - (sh[a] + pa.len[a]))
  const own6 = SUITS.filter((s) => sh[s] >= 6).sort((a, b) => sh[b] - sh[a])
  const majorFit = fits.find(isMajor)
  const minorFit = fits.find((s) => !isMajor(s))
  const balanced = isBalanced(hand)
  let strain: Strain | null = null
  let fitTxt = ''
  if (majorFit) { strain = majorFit; fitTxt = `een fit in ${SUIT_NAME[majorFit]}` }
  else if (balanced || pa.bal) { strain = 'NT'; fitTxt = 'geen fit in een hoge kleur' }
  else if (minorFit) { strain = lo >= 25 ? 'NT' : minorFit; fitTxt = `een fit in ${SUIT_NAME[minorFit]}` }
  else if (own6.length) { strain = own6[0]; fitTxt = `een zeskaart ${SUIT_NAME[own6[0]]}` }

  // Partner nodigde uit: accepteren of passen.
  if (pa.invite && rhoPassed && lb.seat === partner) {
    const st: Strain = majorFit ?? pa.invite
    const g = call(gameLevel(st), st)
    if (my + paMax >= 25 && can(g)) return { bid: g, why: `Partner nodigt uit. Met ${pts(my)} zit je niet aan je minimum: bied de manche, ${bidLabel(g)}.` }
    return { bid: 'P', why: `Partner nodigt uit, maar met ${pts(my)} zit je aan de onderkant: pas.` }
  }

  // Partner bood al een manche: daar blijf je.
  if (ours && lb.seat === partner && cur.level >= gameLevel(cur.strain) && !forced)
    return { bid: 'P', why: 'Partner heeft de manche geboden: pas.' }

  const acceptable = (): boolean => {
    if (cur.strain === 'NT') return balanced || pa.bal
    return sh[cur.strain] + pa.len[cur.strain] >= 7 || sh[cur.strain] >= 5
  }

  if (strain) {
    const gl = gameLevel(strain)
    const total = gf ? Math.max(lo, 25) : lo
    let target: number
    let kind: Kind
    if (lo >= 33 && placing) { target = 6; kind = 'game' }
    else if (total >= 25) { target = gl; kind = 'game' }
    else if (placing ? hi >= 25 : lo >= 22) { target = inviteLevel(strain); kind = 'invite' }
    else { target = 0; kind = 'part' }
    const cheap = cheapestLevel(strain, lb.bid)
    const label = (lvl: number) => bidLabel(call(lvl, strain!))

    if (!ours) {
      // De tegenpartij bood het laatst: meedingen met een fit, of passen.
      if (strain !== 'NT' && kind !== 'part' && cheap <= target) return { bid: call(target, strain), why: `Jullie hebben ${fitTxt} en ${sumTxt}: bied ${label(target)}.` }
      const fitLen = strain === 'NT' ? 0 : sh[strain] + pa.len[strain]
      if (strain !== 'NT' && cheap <= fitLen - 6 && cheap <= 3 && lo >= 17 && my >= 6)
        return { bid: call(cheap, strain), why: `Jullie hebben ${fitTxt}: ga door tot ${label(cheap)} en laat de tegenpartij niet goedkoop spelen.` }
      return { bid: 'P', why: 'De tegenpartij biedt; zonder goede fit en extra punten pas je.' }
    }

    if (kind === 'part') {
      if (cur.strain === strain || (acceptable() && !forced && !gf)) return { bid: 'P', why: `Met ${sumTxt} zit er geen manche in. Het contract is goed zo: pas.` }
      if (cheap <= Math.min(3, gl - 1)) return { bid: call(cheap, strain), why: `Met ${sumTxt} zit er geen manche in. Speel liever in ${strain === 'NT' ? 'SA' : SUIT_NAME[strain]}: ${label(cheap)}.` }
      return { bid: 'P', why: 'Hoger bieden levert niets op: pas.' }
    }
    if (cur.strain === strain && cur.level >= target) return { bid: 'P', why: 'Jullie zitten al in het goede contract: pas.' }
    const lvl = Math.max(target, cheap)
    if (lvl > Math.max(target, gl)) return { bid: 'P', why: 'Hoger bieden levert niets op: pas.' }
    const why = kind === 'game'
      ? `Jullie hebben ${fitTxt} en ${sumTxt}: genoeg voor de manche. Bied ${label(lvl)}.`
      : `Jullie hebben ${fitTxt} en ${sumTxt}: misschien een manche. Nodig uit met ${label(lvl)}.`
    if (lvl === target || kind === 'game' || lvl <= gl) return { bid: call(lvl, strain), why }
  }

  if (!ours) return { bid: 'P', why: 'De tegenpartij biedt; zonder goede fit pas je.' }

  // Geen fit en geen SA-verdeling: zoek verder met een nieuwe kleur, of bied SA.
  const ourSuits = [...suitsBidBy(seat, dealer, calls), ...suitsBidBy(partner, dealer, calls)]
  if (lo >= 25 && !gf && can('3NT')) return { bid: '3NT', why: `Samen minstens 25 punten, maar nog geen fit: bied 3SA.` }
  const maxLvl = lo >= 25 || gf ? 3 : 2
  const fresh = SUITS.filter((s) => sh[s] >= 4 && !ourSuits.includes(s) && cheapestLevel(s, lb.bid) <= maxLvl)
    .sort((a, b) => sh[b] - sh[a] || cheapestLevel(a, lb.bid) - cheapestLevel(b, lb.bid))
  if (fresh.length && (forced || gf || !acceptable() || lo >= 22)) {
    const s = fresh[0]
    const b = call(cheapestLevel(s, lb.bid), s)
    return { bid: b, why: `Nog geen fit gevonden. Laat je ${SUIT_NAME[s]} zien: ${bidLabel(b)}.` }
  }
  if (!forced && !gf && acceptable()) return { bid: 'P', why: 'Geen fit en geen extra kracht: pas.' }
  const nt = lo >= 25 || gf ? 3 : cheapestLevel('NT', lb.bid)
  if (nt <= 3 && can(call(nt, 'NT'))) return { bid: call(nt, 'NT'), why: `Geen fit gevonden: probeer ${nt}SA.` }
  for (const s of [...own6, ...SUITS.filter((x) => sh[x] >= 5)]) {
    const l = cheapestLevel(s, lb.bid)
    if (l <= 4) return { bid: call(l, s), why: `Geen fit gevonden: speel in je eigen lange kleur, ${bidLabel(call(l, s))}.` }
  }
  return { bid: 'P', why: 'Pas.' }
}

/** Biedt de hele bieding met robots (voor gegeven spellen en de andere tafel). */
export function robotAuction(hands: Record<Seat, Hand>, dealer: Seat, start: Bid[] = []): Bid[] {
  const calls = [...start]
  while (!auctionOver(calls) && calls.length < 60) calls.push(robotCall(hands[seatAt(dealer, calls.length)], dealer, calls))
  return calls
}
