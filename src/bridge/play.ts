// Het afspel: wie wint de slag, hoeveel vaste slagen zitten er in een kleur.

import { type Card, type Seat, type Suit, leftOf } from './cards'

export interface PlayedCard {
  seat: Seat
  card: Card
}

/** De eerste kaart bepaalt de gevraagde kleur. Troef wint, anders de hoogste in de gevraagde kleur. */
export function trickWinner(trick: PlayedCard[], trump: Suit | null): PlayedCard {
  let best = trick[0]
  for (const pc of trick.slice(1)) {
    const c = pc.card, b = best.card
    const beats = c.suit === b.suit ? c.rank > b.rank : c.suit === trump
    if (beats) best = pc
  }
  return best
}

/** Spelers in volgorde, beginnend bij de uitkomer. */
export function seatsFrom(first: Seat): Seat[] {
  const out: Seat[] = [first]
  for (let i = 0; i < 3; i++) out.push(leftOf(out[out.length - 1]))
  return out
}

/**
 * Vaste slagen in één kleur voor een partij (bijvoorbeeld noord en zuid):
 * het aantal aaneengesloten hoogste kaarten vanaf de aas, maar nooit meer
 * dan het aantal kaarten in de langste hand.
 */
export function sureTricks(a: number[], b: number[]): number {
  const all = new Set([...a, ...b])
  let top = 0
  for (let r = 14; r >= 2 && all.has(r); r--) top++
  return Math.min(top, Math.max(a.length, b.length))
}
