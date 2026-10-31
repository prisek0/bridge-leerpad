// Biedafspraken uit "Leer bridge met Berry Westra", deel 1 (vierkaart hoog).
// Elke functie geeft het juiste bod plus een korte uitleg, of null als de
// hand buiten de stof van deel 1 valt of de afspraken geen eenduidig antwoord
// geven. Oefeningen gebruiken alleen handen met een eenduidig antwoord.

import {
  type Hand, type Strain, type Suit, SUIT_NAME, SUIT_SYMBOL, STRAINS, SUITS,
  cardsIn, hcp, isBalanced, isMajor, shape, suitIndex,
} from './cards'

/** "1H", "3NT", "P" (pas), "X" (doublet), "XX" (redoublet). */
export type Bid = string

export interface Advice {
  bid: Bid
  why: string
}

export const call = (level: number, strain: Strain): Bid => `${level}${strain}`

export function parseBid(b: Bid): { level: number; strain: Strain } | null {
  const m = /^([1-7])(C|D|H|S|NT)$/.exec(b)
  return m ? { level: Number(m[1]), strain: m[2] as Strain } : null
}

export function bidLabel(b: Bid): string {
  if (b === 'P') return 'pas'
  if (b === 'X') return 'doublet'
  if (b === 'XX') return 'redoublet'
  const p = parseBid(b)
  return p ? `${p.level}${SUIT_SYMBOL[p.strain]}` : b
}

export const bidRank = (b: Bid) => {
  const p = parseBid(b)
  return p ? (p.level - 1) * 5 + suitIndex(p.strain) : -1
}

/** Laagste niveau waarop je een kleur mag bieden boven het vorige bod. */
export function cheapestLevel(strain: Strain, above: Bid): number {
  const p = parseBid(above)
  if (!p) return 1
  return suitIndex(strain) > suitIndex(p.strain) ? p.level : p.level + 1
}

const S = (s: Suit) => SUIT_SYMBOL[s]
const pts = (n: number) => `${n} punt${n === 1 ? '' : 'en'}`

/**
 * Kies uit kandidaat-kleuren: de langste; van twee (of meer) vierkaarten de
 * laagste, van twee vijfkaarten de hoogste.
 */
export function chooseSuit(hand: Hand, candidates: Suit[]): { suit: Suit; rule: string } | null {
  const sh = shape(hand)
  if (!candidates.length) return null
  const max = Math.max(...candidates.map((s) => sh[s]))
  const tied = candidates.filter((s) => sh[s] === max)
  // SUITS staat hoog → laag
  const byRank = [...tied].sort((a, b) => SUITS.indexOf(a) - SUITS.indexOf(b))
  if (tied.length === 1) return { suit: tied[0], rule: `je langste kleur is ${SUIT_NAME[tied[0]]}` }
  if (max === 4) {
    const s = byRank[byRank.length - 1]
    return { suit: s, rule: `van twee vierkaarten kies je de laagste: ${SUIT_NAME[s]}` }
  }
  const s = byRank[0]
  return { suit: s, rule: `van twee vijfkaarten kies je de hoogste: ${SUIT_NAME[s]}` }
}

// ---------------------------------------------------------------- openen

export function openingBid(hand: Hand): Advice | null {
  const p = hcp(hand)
  const bal = isBalanced(hand)
  const sh = shape(hand)
  const fiveMajor = sh.H >= 5 || sh.S >= 5

  if (p >= 23 && bal) return { bid: '2C', why: `${pts(p)} met een SA-verdeling: open 2♣ en bied daarna SA.` }
  if (p >= 23) return { bid: '2C', why: `Met ${pts(p)} wil je hoe dan ook de manche spelen: open 2♣ (kunstmatig, manchedwingend).` }
  if (p >= 20) {
    if (bal && !fiveMajor) return { bid: '2NT', why: `20-22 punten met een SA-verdeling: open 2SA (${pts(p)}).` }
    if (bal) return null
    const c = chooseSuit(hand, SUITS)
    if (!c || c.suit === 'C' || sh[c.suit] < 5) return null
    return { bid: call(2, c.suit), why: `${pts(p)} en een vijfkaart ${SUIT_NAME[c.suit]}: open met een sterke 2${S(c.suit)}.` }
  }
  if (p >= 15 && p <= 17 && bal) {
    if (fiveMajor) return null
    return { bid: '1NT', why: `15-17 punten met een SA-verdeling: open 1SA (${pts(p)}).` }
  }
  if (p >= 13) {
    const c = chooseSuit(hand, SUITS)!
    return { bid: call(1, c.suit), why: `${pts(p)}, dus je opent. ${cap(c.rule)}, dus 1${S(c.suit)}.` }
  }
  return { bid: 'P', why: `Je hebt ${pts(p)}. Openen doe je vanaf 13 punten, dus je past.` }
}

// ---------------------------------------------- antwoorden op 1 in een kleur

export function responseToSuit(opened: Suit, hand: Hand): Advice | null {
  const p = hcp(hand)
  const sh = shape(hand)
  const o = S(opened)
  if (p < 6) return { bid: 'P', why: `Je hebt ${pts(p)}. Antwoorden doe je vanaf 6 punten, dus je past.` }

  if (isMajor(opened) && sh[opened] >= 4) {
    if (p <= 9) return { bid: call(2, opened), why: `Vierkaart steun in ${SUIT_NAME[opened]} en 6-9 punten: steun naar 2${o}.` }
    if (p <= 11) return { bid: call(3, opened), why: `Vierkaart steun en 10-11 punten: 3${o}, een uitnodiging voor de manche.` }
    if (p <= 16) return { bid: call(4, opened), why: `Vierkaart steun en 12+ punten: samen minstens 25 punten, dus direct 4${o}.` }
    return null
  }

  const pool = SUITS.filter((s) => s !== opened && sh[s] >= 4)
  const oneLevel = pool.filter((s) => SUITS.indexOf(s) < SUITS.indexOf(opened))

  // Steun in een lage kleur: eerst kijken of er een vierkaart hoog op éénniveau is.
  if (!isMajor(opened) && sh[opened] >= 4) {
    const c = chooseSuit(hand, oneLevel)
    if (c) {
      if (!isMajor(c.suit) || p > 16) return null
      return { bid: call(1, c.suit), why: `Met steun in een lage kleur steun je niet meteen: eerst zoek je een fit in een hoge kleur. ${cap(c.rule)}, dus 1${S(c.suit)}.` }
    }
    if (p <= 9) return { bid: call(2, opened), why: `Geen vierkaart hoog, wel steun in ${SUIT_NAME[opened]}: 2${o} met 6-9 punten.` }
    if (p <= 11) return { bid: call(3, opened), why: `Geen vierkaart hoog, wel steun in ${SUIT_NAME[opened]} en 10-11 punten: 3${o}.` }
    return null
  }

  let pickFrom: Suit[] = []
  if (p >= 10) pickFrom = pool
  else pickFrom = oneLevel

  const c = chooseSuit(hand, pickFrom)
  if (c) {
    const level = SUITS.indexOf(c.suit) < SUITS.indexOf(opened) ? 1 : 2
    if (level === 2 && oneLevel.some((s) => sh[s] === sh[c.suit])) return null
    if (p > 16) return null
    const lvlWhy = level === 1
      ? `Een nieuwe kleur op éénniveau kan vanaf 6 punten.`
      : `Een nieuwe kleur op tweeniveau vraagt 10+ punten; die heb je (${pts(p)}).`
    return { bid: call(level, c.suit), why: `Geen steun voor een hoge kleur, dus je zoekt een fit. ${cap(c.rule)}. ${lvlWhy}` }
  }

  if (p <= 9) return { bid: '1NT', why: `6-9 punten, geen steun en geen vierkaart die je op éénniveau kunt bieden: 1SA.` }
  return null
}

// ------------------------------------------------ antwoorden op 1SA en 2SA

export function responseToNT(level: 1 | 2, hand: Hand): Advice | null {
  const p = hcp(hand)
  const sh = shape(hand)
  const ntName = level === 1 ? '1SA' : '2SA'
  const total = level === 1 ? '15-17' : '20-22'
  if (sh.H >= 5 && sh.S >= 5) return null
  if (sh.H >= 5) return { bid: call(level + 1, 'D'), why: `Vijfkaart harten: Jacoby, bied ${level + 1}♦ en partner biedt ${level + 1}♥. Een transfer kan met elk aantal punten.` }
  if (sh.S >= 5) return { bid: call(level + 1, 'H'), why: `Vijfkaart schoppen: Jacoby, bied ${level + 1}♥ en partner biedt ${level + 1}♠. Een transfer kan met elk aantal punten.` }
  if (sh.C >= 6 || sh.D >= 6) return null

  if (level === 1) {
    if ((sh.H === 4 || sh.S === 4) && p >= 8 && p <= 15)
      return { bid: '2C', why: `Een vierkaart hoog en 8+ punten (${pts(p)}): vraag met Stayman (2♣) of partner ook een vierkaart hoog heeft.` }
    if (p <= 7) return { bid: 'P', why: `Partner heeft hoogstens 17 punten. Met ${pts(p)} kom je niet aan 25 samen: pas.` }
    if (p <= 9) return { bid: '2NT', why: `${pts(p)}: samen 23-26. Bied 2SA, partner gaat naar 3SA als hij niet minimaal is.` }
    if (p <= 15) return { bid: '3NT', why: `${pts(p)} + partners ${total}: samen minstens 25, dus direct 3SA.` }
    return null
  }
  if ((sh.H === 4 || sh.S === 4) && p >= 4 && p <= 10)
    return { bid: '3C', why: `Een vierkaart hoog en genoeg voor de manche: Stayman op 2SA is 3♣.` }
  if (p <= 3) return { bid: 'P', why: `Met ${pts(p)} is er geen manche: pas op ${ntName}.` }
  if (p <= 10) return { bid: '3NT', why: `${pts(p)} + partners ${total}: genoeg voor de manche, bied 3SA.` }
  return null
}

/** Antwoord van de 1SA/2SA-openaar op Stayman. */
export function staymanAnswer(level: 1 | 2, hand: Hand): Advice {
  const sh = shape(hand)
  const l = level + 1
  if (sh.H >= 4) return { bid: call(l, 'H'), why: sh.S >= 4
    ? `Twee vierkaarten hoog: van twee vierkaarten de laagste, dus ${l}♥.`
    : `Je hebt een vierkaart harten: ${l}♥.` }
  if (sh.S >= 4) return { bid: call(l, 'S'), why: `Je hebt een vierkaart schoppen (geen vierkaart harten): ${l}♠.` }
  return { bid: call(l, 'D'), why: `Geen vierkaart hoog: ${l}♦ is het afgesproken 'nee'.` }
}

// ---------------------------------------------------- de 2♣ opening

const topHonours = (hand: Hand, s: Suit) => cardsIn(hand, s).filter((r) => r >= 12).length

export function responseTo2C(hand: Hand): Advice | null {
  const p = hcp(hand)
  if (p < 8) return { bid: '2D', why: `Op 2♣ mag je niet passen. Met ${pts(p)} wacht je af met 2♦ en laat je partner vertellen.` }
  const sh = shape(hand)
  const fives = SUITS.filter((s) => sh[s] >= 5)
  const good = fives.filter((s) => topHonours(hand, s) >= 2)
  if (fives.length > 1) return null
  if (good.length === 1) {
    const s = good[0]
    const level = s === 'C' || s === 'D' ? 3 : 2
    return { bid: call(level, s), why: `8+ punten en een redelijke vijfkaart ${SUIT_NAME[s]}: bied ${level}${S(s)}.` }
  }
  if (fives.length === 1) return null
  return { bid: '2D', why: `Geen redelijke vijfkaart: bied 2♦ en geef de 2♣-openaar de ruimte.` }
}

// ---------------------------------------------------------- tussenbieden

/** Rechterhandtegenstander opende 1 in een kleur; wat doe jij? */
export function competitiveAction(opened: Suit, hand: Hand): Advice | null {
  const p = hcp(hand)
  const sh = shape(hand)
  const others = SUITS.filter((s) => s !== opened)
  const takeoutShape = sh[opened] <= 2 && others.every((s) => sh[s] >= 3)
  const o = S(opened)

  if (takeoutShape && p >= 13 && p <= 21) {
    if (isBalanced(hand) && p >= 15 && p <= 17) return null
    return { bid: 'X', why: `Openingskracht (${pts(p)}), kort in ${SUIT_NAME[opened]} en steun voor alle andere kleuren: informatiedoublet.` }
  }
  const long = others.filter((s) => sh[s] >= 5)
  if (long.length > 1) return null
  if (long.length === 1) {
    const s = long[0]
    const good = topHonours(hand, s) >= 2 || (cardsIn(hand, s).includes(14) && cardsIn(hand, s).includes(11))
    const level = cheapestLevel(s, call(1, opened))
    if (!good) return p <= 7 ? { bid: 'P', why: `Een volgbod doe je op een goede lange kleur. Deze kleur is te slap: pas.` } : null
    if (sh[s] >= 6 && p >= 13 && p <= 16)
      return { bid: call(level + 1, s), why: `Een goede zeskaart met openingskracht: een sprongvolgbod, ${level + 1}${S(s)}.` }
    if (sh[s] === 5 && p >= 8 && p <= 12 && (level === 1 || p >= 10))
      return { bid: call(level, s), why: `Een goede vijfkaart ${SUIT_NAME[s]}: volg met ${level}${S(s)} over 1${o}.` }
    return null
  }
  if (p <= 9 && !takeoutShape) return { bid: 'P', why: `Geen goede vijfkaart en geen doubletverdeling: je past.` }
  return null
}

/** Partner gaf een informatiedoublet op 1 in een kleur, de volgende speler past. */
export function answerToDouble(opened: Suit, hand: Hand): Advice | null {
  const p = hcp(hand)
  if (p > 8) return null
  const sh = shape(hand)
  const others = SUITS.filter((s) => s !== opened)
  const max = Math.max(...others.map((s) => sh[s]))
  const longest = others.filter((s) => sh[s] === max)
  if (longest.length !== 1) return null
  const s = longest[0]
  const level = cheapestLevel(s, call(1, opened))
  return { bid: call(level, s), why: `Op een informatiedoublet mag je niet passen, ook niet met ${pts(p)}. Bied je langste kleur zo goedkoop mogelijk: ${level}${S(s)}.` }
}

// -------------------------------------------------- spelregels / score

/** Contracten die een manche opleveren. */
export function isGame(b: Bid): boolean {
  const p = parseBid(b)
  if (!p) return false
  if (p.strain === 'NT') return p.level >= 3
  if (p.strain === 'H' || p.strain === 'S') return p.level >= 4
  return p.level >= 5
}

/** Slagen die je moet halen voor een contract: 6 + niveau. */
export const tricksNeeded = (b: Bid) => 6 + (parseBid(b)?.level ?? 0)

/** Alle mogelijke biedingen op volgorde, voor het biedkastje. */
export const ALL_BIDS: Bid[] = [1, 2, 3, 4, 5, 6, 7].flatMap((l) => STRAINS.map((s) => call(l, s)))

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
