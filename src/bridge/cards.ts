// Kaarten, handen en de basisberekeningen (punten, verdeling).

export type Suit = 'S' | 'H' | 'D' | 'C'
export type Strain = Suit | 'NT'
export type Seat = 'N' | 'E' | 'S' | 'W'

/** Rank 2..14 (14 = aas). */
export interface Card {
  suit: Suit
  rank: number
}

export type Hand = Card[]

export const SUITS: Suit[] = ['S', 'H', 'D', 'C']
/** Laag naar hoog, zoals in het biedkastje. */
export const STRAINS: Strain[] = ['C', 'D', 'H', 'S', 'NT']
export const SEATS: Seat[] = ['N', 'E', 'S', 'W']

export const SUIT_SYMBOL: Record<Strain, string> = { S: '♠', H: '♥', D: '♦', C: '♣', NT: 'SA' }
export const SUIT_NAME: Record<Suit, string> = { S: 'schoppen', H: 'harten', D: 'ruiten', C: 'klaveren' }
export const SEAT_NAME: Record<Seat, string> = { N: 'Noord', E: 'Oost', S: 'Zuid', W: 'West' }
/** Korte notatie aan tafel: N, O, Z, W. */
export const SEAT_SHORT: Record<Seat, string> = { N: 'N', E: 'O', S: 'Z', W: 'W' }

export const isRed = (s: Strain) => s === 'H' || s === 'D'
export const isMajor = (s: Suit) => s === 'H' || s === 'S'
export const suitIndex = (s: Strain) => STRAINS.indexOf(s)

const RANK_LABEL: Record<number, string> = { 14: 'A', 13: 'H', 12: 'V', 11: 'B', 10: '10' }
export const rankLabel = (r: number) => RANK_LABEL[r] ?? String(r)

const LABEL_RANK: Record<string, number> = { A: 14, H: 13, V: 12, B: 11, T: 10 }

export const cardLabel = (c: Card) => SUIT_SYMBOL[c.suit] + rankLabel(c.rank)
export const sameCard = (a: Card, b: Card) => a.suit === b.suit && a.rank === b.rank

/**
 * Lees een hand in Nederlandse notatie, kleuren in de volgorde ♠ ♥ ♦ ♣,
 * gescheiden door punten: "AH42.V93.B7.A852". Een streepje is een renonce.
 * "T" of "10" staat voor de tien.
 */
export function parseHand(text: string): Hand {
  const parts = text.split('.')
  if (parts.length !== 4) throw new Error(`Hand moet vier kleuren hebben: ${text}`)
  const hand: Hand = []
  parts.forEach((p, i) => {
    const suit = SUITS[i]
    const s = p.replace(/10/g, 'T').replace(/-/g, '')
    for (const ch of s) {
      const rank = LABEL_RANK[ch] ?? Number(ch)
      if (!rank || rank < 2) throw new Error(`Onbekende kaart '${ch}' in ${text}`)
      hand.push({ suit, rank })
    }
  })
  return sortHand(hand)
}

/** Een kleur los ("AVB7") naar ranks, hoog naar laag. */
export function parseHolding(text: string): number[] {
  return [...text.replace(/10/g, 'T')].map((ch) => LABEL_RANK[ch] ?? Number(ch)).sort((a, b) => b - a)
}

export const holdingLabel = (ranks: number[]) => (ranks.length ? ranks.map(rankLabel).join('') : '—')

/** Weergavevolgorde: ♠ ♥ ♣ ♦ wisselt zwart/rood af, prettig voor een waaier. */
const FAN_ORDER: Suit[] = ['S', 'H', 'C', 'D']
export function sortHand(hand: Hand, order: Suit[] = SUITS): Hand {
  return [...hand].sort((a, b) => order.indexOf(a.suit) - order.indexOf(b.suit) || b.rank - a.rank)
}
export const fanSort = (hand: Hand) => sortHand(hand, FAN_ORDER)

export const cardsIn = (hand: Hand, suit: Suit) => hand.filter((c) => c.suit === suit).map((c) => c.rank).sort((a, b) => b - a)

export function hcp(hand: Hand): number {
  return hand.reduce((sum, c) => sum + Math.max(0, c.rank - 10), 0)
}

export const suitHcp = (hand: Hand, suit: Suit) => hcp(hand.filter((c) => c.suit === suit))

export type Shape = Record<Suit, number>
export function shape(hand: Hand): Shape {
  const s: Shape = { S: 0, H: 0, D: 0, C: 0 }
  for (const c of hand) s[c.suit]++
  return s
}

/** Gesorteerde lengtes, bijvoorbeeld [4,4,3,2]. */
export const pattern = (hand: Hand) => Object.values(shape(hand)).sort((a, b) => b - a)

/** SA-verdeling: 4-3-3-3, 4-4-3-2 of 5-3-3-2. */
export function isBalanced(hand: Hand): boolean {
  const p = pattern(hand).join('')
  return p === '4333' || p === '4432' || p === '5332'
}

export function fullDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) deck.push({ suit, rank })
  return deck
}

export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export type Deal = Record<Seat, Hand>

export function randomDeal(): Deal {
  const d = shuffle(fullDeck())
  return {
    N: sortHand(d.slice(0, 13)),
    E: sortHand(d.slice(13, 26)),
    S: sortHand(d.slice(26, 39)),
    W: sortHand(d.slice(39, 52)),
  }
}

/** Deel net zo lang tot de voorwaarde klopt (rejection sampling). */
export function dealWhere(pred: (d: Deal) => boolean, tries = 20000): Deal {
  for (let i = 0; i < tries; i++) {
    const d = randomDeal()
    if (pred(d)) return d
  }
  throw new Error('Geen passende verdeling gevonden')
}

export const handWhere = (pred: (h: Hand) => boolean) => dealWhere((d) => pred(d.S)).S

export const partnerOf = (s: Seat): Seat => ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[s]
export const leftOf = (s: Seat): Seat => ({ N: 'E', E: 'S', S: 'W', W: 'N' } as const)[s]

export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
export const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1))
