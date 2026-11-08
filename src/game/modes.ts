// De speelvormen op het tabblad Spelen, en het delen van passende spellen.

import { type Deal, type Seat, SEATS, hcp, partnerOf, randomDeal, shape } from '../bridge/cards'
import type { Bid } from '../bridge/bidding'
import { type Contract, finalContract, robotAuction } from '../bridge/auction'
import { rotateDeal } from '../bridge/table'
import { chapters } from '../content/chapters'
import type { Progress } from '../state/progress'

export type ModeId = 'afspel' | 'tegenspel' | 'bieden' | 'club'

export interface Mode {
  id: ModeId
  title: string
  sub: string
  icon: string
  /** Hoofdstuk dat je gehad moet hebben. */
  unlock: string
  deals: number
  /** Jij biedt zelf. */
  bid: boolean
  /** Er wordt afgespeeld. */
  play: boolean
}

export const MODES: Mode[] = [
  { id: 'afspel', title: 'Afspelen', sub: 'Jij bent de leider. Haal je contract!', icon: '🎯', unlock: 'h1', deals: 4, bid: false, play: true },
  { id: 'tegenspel', title: 'Tegenspelen', sub: 'Samen met partner het contract down spelen', icon: '🛡️', unlock: 'h3', deals: 4, bid: false, play: true },
  { id: 'bieden', title: 'Bieden met partner', sub: 'Zes spellen bieden, daarna zie je alle handen', icon: '💬', unlock: 'h5a', deals: 6, bid: true, play: false },
  { id: 'club', title: 'Clubavond', sub: 'Vier spellen bieden en spelen, tegen de andere tafel', icon: '🏆', unlock: 'h5a', deals: 4, bid: true, play: true },
]

/** Een hoofdstuk telt als "gehad" zodra je de eerste les ervan hebt gedaan. */
export function learnedChapters(p: Progress): Set<string> {
  const out = new Set<string>()
  for (const ch of chapters) if (p.playAll || p.completed[ch.lessons[0].id]) out.add(ch.id)
  return out
}

export function chapterName(id: string): string {
  const ch = chapters.find((c) => c.id === id)
  return ch ? `hoofdstuk ${ch.nr} (${ch.title})` : id
}

export interface Setup {
  deal: Deal
  dealer: Seat
  /** Vooraf geboden door robots (bij afspelen en tegenspelen). */
  calls?: Bid[]
}

export const isNS = (s: Seat) => s === 'N' || s === 'S'
const dealerFor = (board: number): Seat => SEATS[(board - 1) % 4]

/** Een spel met een contract voor de goede partij, eventueel een halve slag gedraaid. */
function dealWithContract(want: (c: Contract, d: Deal) => boolean): Setup {
  for (let i = 0; i < 400; i++) {
    let deal = randomDeal()
    let dealer = SEATS[i % 4]
    const calls = robotAuction(deal, dealer)
    let c = finalContract(dealer, calls)
    if (!c) continue
    // Liever niet steeds 1-contracten.
    if (c.level === 1 && Math.random() < 0.6) continue
    if (!want(c, deal)) {
      deal = rotateDeal(deal)
      dealer = partnerOf(dealer)
      c = finalContract(dealer, calls)!
      if (!want(c, deal)) continue
    }
    return { deal, dealer, calls }
  }
  throw new Error('Geen passend spel gevonden')
}

export function makeSetup(mode: Mode, board: number): Setup {
  switch (mode.id) {
    case 'afspel':
      return dealWithContract((c) => c.declarer === 'S')
    case 'tegenspel': {
      // Meestal kom jij uit (leider oost), soms partner (leider west).
      const leader: Seat = Math.random() < 0.6 ? 'E' : 'W'
      return dealWithContract((c) => c.declarer === leader)
    }
    case 'bieden': {
      for (;;) {
        const deal = randomDeal()
        const p = hcp(deal.N) + hcp(deal.S)
        if (Math.random() < 0.9 ? p >= 20 : true) return { deal, dealer: dealerFor(board) }
      }
    }
    case 'club': {
      for (;;) {
        const deal = randomDeal()
        const dealer = dealerFor(board)
        // Niet rondpassen: dat is aan tafel geen leuk spel.
        if (finalContract(dealer, robotAuction(deal, dealer))) return { deal, dealer }
      }
    }
  }
}

/**
 * Het contract dat bij de handen van noord-zuid hoort, met alle kaarten open:
 * 25+ punten is een manche, liefst in een hoge kleur met een achtkaart fit.
 */
export function idealContract(d: Deal): { text: string; game: boolean; strain: 'NT' | 'H' | 'S' | 'C' | 'D' | null; pts: number } {
  const pts = hcp(d.N) + hcp(d.S)
  const a = shape(d.N), b = shape(d.S)
  const fit = (['S', 'H'] as const).filter((s) => a[s] + b[s] >= 8).sort((x, y) => (b[y] + a[y]) - (b[x] + a[x]))[0] ?? null
  if (pts < 20) return { text: `Samen ${pts} punten: dat is te weinig voor een eigen contract. Passen of laag blijven is prima.`, game: false, strain: null, pts }
  if (pts >= 25) {
    if (fit) return { text: `Samen ${pts} punten en een fit in ${fit === 'S' ? 'schoppen' : 'harten'}: 4${fit === 'S' ? '♠' : '♥'} is het mooiste contract.`, game: true, strain: fit, pts }
    return { text: `Samen ${pts} punten en geen fit in een hoge kleur: 3SA is het mooiste contract.`, game: true, strain: 'NT', pts }
  }
  if (fit) return { text: `Samen ${pts} punten: geen manche. Met de fit in ${fit === 'S' ? 'schoppen' : 'harten'} is een deelscore in ${fit === 'S' ? '♠' : '♥'} goed.`, game: false, strain: fit, pts }
  return { text: `Samen ${pts} punten: geen manche. Een deelscore is goed.`, game: false, strain: null, pts }
}

