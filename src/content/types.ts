import type { Card, Hand, Seat, Suit } from '../bridge/cards'
import type { Bid } from '../bridge/bidding'
import type { PlayedCard } from '../bridge/play'

/** Eén kleur in beeld per speler; '?' = verborgen, undefined = niet getoond. */
export interface SuitLayout {
  suit: Suit
  N?: string
  E?: string
  S?: string
  W?: string
}

interface Base {
  prompt: string
  explain: string
  /** Vaardigheid, voor de statistieken en om fouten te herhalen. */
  skill?: string
  /** Kaarten die al op tafel liggen. */
  played?: PlayedCard[]
}

export type Exercise =
  | (Base & { kind: 'mc'; options: string[]; answer: number; hand?: Hand; layout?: SuitLayout; hands?: { N: Hand; S: Hand } })
  | (Base & { kind: 'number'; answer: number; hand?: Hand; layout?: SuitLayout; hands?: { N: Hand; S: Hand } })
  | (Base & { kind: 'bid'; hand: Hand; dealer: Seat; calls: Bid[]; answer: Bid })
  | (Base & { kind: 'trick'; trick: PlayedCard[]; trump: Suit | null; answer: Seat })
  | (Base & { kind: 'tap'; hand: Hand; correct: Card[] })
  | (Base & { kind: 'pick'; cards: Card[]; answer: Card[]; layout?: SuitLayout })

export interface TheoryPage {
  title: string
  /** Eenvoudige opmaak: alinea's gescheiden door een lege regel, regels met "- " worden een lijst. */
  body: string
}

export type Generator = () => Exercise

export interface Lesson {
  id: string
  title: string
  /** Vaste oefeningen; komen altijd voor. */
  items?: Exercise[]
  /** Gegenereerde oefeningen: [generator, aantal]. */
  gen?: [Generator, number][]
}

export interface Chapter {
  id: string
  /** Hoofdstuknummer zoals in het boek, bijvoorbeeld "5a". */
  nr: string
  title: string
  subtitle: string
  color: string
  theory: TheoryPage[]
  lessons: Lesson[]
}
