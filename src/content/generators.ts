// Oefeningen die telkens met nieuwe handen worden gedeeld.

import {
  type Card, type Hand, type Seat, type Suit, SEATS, SEAT_NAME, SUITS, SUIT_NAME, SUIT_SYMBOL,
  cardLabel, cardsIn, dealWhere, fullDeck, handWhere, hcp, holdingLabel, isBalanced, pattern,
  parseHolding, pick, randInt, randomDeal, shape, shuffle,
} from '../bridge/cards'
import {
  type Advice, type Bid, ALL_BIDS, answerToDouble, bidLabel, competitiveAction, isGame, openingBid,
  responseTo2C, responseToNT, responseToSuit, staymanAnswer, tricksNeeded,
} from '../bridge/bidding'
import { type PlayedCard, seatsFrom, sureTricks, trickWinner } from '../bridge/play'
import type { Exercise, Generator } from './types'

const S = (s: Suit) => SUIT_SYMBOL[s]

/** Deel tot de engine een eenduidig antwoord heeft dat bij `want` past. */
function handFor(advise: (h: Hand) => Advice | null, want: (a: Advice, h: Hand) => boolean, extra: (h: Hand) => boolean = () => true) {
  const find = (ok: (a: Advice, h: Hand) => boolean, tries: number) => {
    for (let i = 0; i < tries; i++) {
      const h = randomDeal().S
      if (!extra(h)) continue
      const a = advise(h)
      if (a && ok(a, h)) return { hand: h, advice: a }
    }
    return null
  }
  // Zeldzame doelen (bijv. 1SA op 1♣) vallen terug op elke eenduidige hand.
  return find(want, 4000) ?? find(() => true, 50000)!
}

// --------------------------------------------------------------- kaarten

export const genTapHonours: Generator = () => {
  const hand = handWhere((h) => h.filter((c) => c.rank >= 11).length >= 3)
  return {
    kind: 'tap', skill: 'honneurs',
    prompt: 'Tik alle honneurs aan (aas, heer, vrouw en boer).',
    hand, correct: hand.filter((c) => c.rank >= 11),
    explain: 'De honneurs zijn A (aas), H (heer), V (vrouw) en B (boer). De tien telt niet mee voor de punten.',
  }
}

export const genFollowSuit: Generator = () => {
  const suit = pick(SUITS)
  const hand = handWhere((h) => { const n = cardsIn(h, suit).length; return n >= 1 && n <= 4 })
  const free = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].filter((r) => !cardsIn(hand, suit).includes(r))
  return {
    kind: 'tap', skill: 'kleur bekennen', played: [{ seat: 'W', card: { suit, rank: pick(free) } }],
    prompt: 'West komt uit. Tik alle kaarten aan die je mag bijspelen.',
    hand, correct: hand.filter((c) => c.suit === suit),
    explain: `Je moet kleur bekennen: heb je ${SUIT_NAME[suit]}, dan moet je ${SUIT_NAME[suit]} bijspelen.`,
  }
}

function randomTrick(trump: Suit | null): { trick: PlayedCard[]; led: Suit } {
  const deck = shuffle(fullDeck())
  const led = pick(SUITS)
  const leader = pick(SEATS)
  const order = seatsFrom(leader)
  const used: Card[] = []
  const take = (f: (c: Card) => boolean) => {
    const i = deck.findIndex((c) => f(c) && !used.includes(c))
    const c = deck[i]
    used.push(c)
    return c
  }
  const trick: PlayedCard[] = order.map((seat, i) => {
    if (i === 0) return { seat, card: take((c) => c.suit === led) }
    const r = Math.random()
    if (r < 0.65) return { seat, card: take((c) => c.suit === led) }
    if (trump && trump !== led && r < 0.85) return { seat, card: take((c) => c.suit === trump) }
    return { seat, card: take((c) => c.suit !== led && c.suit !== trump) }
  })
  return { trick, led }
}

export const genTrickNT: Generator = () => {
  const { trick, led } = randomTrick(null)
  const w = trickWinner(trick, null)
  return {
    kind: 'trick', skill: 'slag winnen', trick, trump: null, answer: w.seat,
    prompt: `Zonder troef (SA). ${SEAT_NAME[trick[0].seat]} komt uit. Wie wint deze slag?`,
    explain: `Er is ${SUIT_NAME[led]} gevraagd. Zonder troef wint de hoogste ${SUIT_NAME[led]}: ${cardLabel(w.card)} van ${SEAT_NAME[w.seat]}. Een andere kleur bijspelen wint nooit.`,
  }
}

export const genTrickTrump: Generator = () => {
  const trump = pick(SUITS)
  let t = randomTrick(trump)
  while (t.led === trump && Math.random() < 0.7) t = randomTrick(trump)
  const w = trickWinner(t.trick, trump)
  const ruffed = w.card.suit === trump && t.led !== trump
  return {
    kind: 'trick', skill: 'troef', trick: t.trick, trump, answer: w.seat,
    prompt: `${SUIT_NAME[trump][0].toUpperCase() + SUIT_NAME[trump].slice(1)} is troef. ${SEAT_NAME[t.trick[0].seat]} komt uit. Wie wint deze slag?`,
    explain: ruffed
      ? `${SEAT_NAME[w.seat]} troeft met ${cardLabel(w.card)}. Een troefkaart wint van elke kaart in een andere kleur (en de hoogste troef wint).`
      : `Er is niet getroefd, dus de hoogste ${SUIT_NAME[t.led]} wint: ${cardLabel(w.card)} van ${SEAT_NAME[w.seat]}.`,
  }
}

// ---------------------------------------------------------------- punten

export const genHcp: Generator = () => {
  const hand = randomDeal().S
  const p = hcp(hand)
  const parts = SUITS.map((s) => {
    const v = cardsIn(hand, s).reduce((a, r) => a + Math.max(0, r - 10), 0)
    return v ? `${S(s)} ${v}` : null
  }).filter(Boolean)
  return {
    kind: 'number', skill: 'punten tellen', hand, answer: p,
    prompt: 'Hoeveel punten heeft deze hand?',
    explain: `A = 4, H = 3, V = 2, B = 1. Per kleur: ${parts.join(', ') || 'geen honneurs'}. Samen ${p}.`,
  }
}

export const genBalanced: Generator = () => {
  const want = Math.random() < 0.5
  const hand = handWhere((h) => isBalanced(h) === want)
  const pat = pattern(hand).join('-')
  return {
    kind: 'mc', skill: 'SA-verdeling', hand, options: ['Ja', 'Nee'], answer: want ? 0 : 1,
    prompt: 'Heeft deze hand een SA-verdeling?',
    explain: `De verdeling is ${pat}. SA-verdelingen zijn 4-3-3-3, 4-4-3-2 en 5-3-3-2: geen renonce, geen singleton en hoogstens één doubleton.`,
  }
}

const randomContract = () => pick(ALL_BIDS.slice(0, 30))

export const genTricksNeeded: Generator = () => {
  const b = randomContract()
  return {
    kind: 'number', skill: 'contract', answer: tricksNeeded(b),
    prompt: `Hoeveel slagen moet de leider halen in ${bidLabel(b)}?`,
    explain: `Het niveau plus zes: ${bidLabel(b).charAt(0)} + 6 = ${tricksNeeded(b)} slagen.`,
  }
}

export const genIsGame: Generator = () => {
  const b = pick(['2NT', '3NT', '4NT', '3H', '4H', '4S', '3S', '4C', '5C', '4D', '5D', '2S', '3C', '6H'])
  const game = isGame(b)
  return {
    kind: 'mc', skill: 'manche', options: ['Ja', 'Nee'], answer: game ? 0 : 1,
    prompt: `Is ${bidLabel(b)} een manchecontract (of hoger)?`,
    explain: 'De manches zijn 3SA, 4♥, 4♠, 5♣ en 5♦. Alles daaronder is een deelscore.',
  }
}

export const genBidOrder: Generator = () => {
  const [a, b] = shuffle(ALL_BIDS.slice(0, 20)).slice(0, 2)
  const hi = ALL_BIDS.indexOf(a) > ALL_BIDS.indexOf(b) ? a : b
  const opts = [a, b]
  return {
    kind: 'mc', skill: 'biedladder', options: opts.map(bidLabel), answer: opts.indexOf(hi),
    prompt: 'Welk bod is hoger?',
    explain: 'Eerst telt het niveau. Op hetzelfde niveau is de volgorde ♣ ♦ ♥ ♠ SA (van laag naar hoog).',
  }
}

// --------------------------------------------------------------- openen

type OpenKind = 'pass' | 'one' | 'nt' | 'two'
export function genOpening(kinds: OpenKind[] = ['pass', 'one', 'one', 'nt']): Generator {
  return () => {
    const kind = pick(kinds)
    const { hand, advice } = handFor(openingBid, (a, h) => {
      if (kind === 'pass') return a.bid === 'P' && hcp(h) >= 9
      if (kind === 'nt') return a.bid === '1NT'
      if (kind === 'two') return a.bid.startsWith('2')
      return a.bid.startsWith('1') && a.bid !== '1NT'
    }, (h) => kind !== 'two' || hcp(h) >= 20)
    return bidEx(hand, 'S', [], advice, 'openen', 'Jij bent gever. Wat bied je?')
  }
}

// --------------------------------------------------------- antwoorden

function bidEx(hand: Hand, dealer: Seat, calls: Bid[], advice: Advice, skill: string, prompt: string): Exercise {
  return { kind: 'bid', skill, hand, dealer, calls, answer: advice.bid, prompt, explain: advice.why }
}

export function genResponse(opens: Suit[] = SUITS): Generator {
  return () => {
    const opened = pick(opens)
    const target = pick(['fit', 'new', 'nt', 'pass', 'fit', 'new'])
    const { hand, advice } = handFor((h) => responseToSuit(opened, h), (a) => {
      if (target === 'pass') return a.bid === 'P'
      if (target === 'nt') return a.bid === '1NT'
      if (target === 'fit') return a.bid.endsWith(opened)
      return a.bid !== 'P' && a.bid !== '1NT' && !a.bid.endsWith(opened)
    })
    return bidEx(hand, 'N', [`1${opened}`, 'P'], advice, 'antwoorden', `Partner opent 1${S(opened)}. Wat antwoord je?`)
  }
}

export const genNTResponse: Generator = () => {
  const target = pick(['transfer', 'stayman', 'nt', 'nt', 'pass', 'stayman'])
  const { hand, advice } = handFor((h) => responseToNT(1, h), (a) => ({
    transfer: a.bid === '2D' || a.bid === '2H',
    stayman: a.bid === '2C',
    nt: a.bid === '2NT' || a.bid === '3NT',
    pass: a.bid === 'P',
  } as Record<string, boolean>)[target])
  return bidEx(hand, 'N', ['1NT', 'P'], advice, '1SA antwoorden', 'Partner opent 1SA. Wat bied je?')
}

export const gen2NTResponse: Generator = () => {
  const { hand, advice } = handFor((h) => responseToNT(2, h), () => true)
  return bidEx(hand, 'N', ['2NT', 'P'], advice, '2SA antwoorden', 'Partner opent 2SA (20-22). Wat bied je?')
}

export const genStaymanAnswer: Generator = () => {
  const hand = handWhere((h) => openingBid(h)?.bid === '1NT')
  return bidEx(hand, 'S', ['1NT', 'P', '2C', 'P'], staymanAnswer(1, hand), 'Stayman', 'Jij opende 1SA, partner vraagt Stayman. Wat antwoord je?')
}

export const genTransferAccept: Generator = () => {
  const hand = handWhere((h) => openingBid(h)?.bid === '1NT')
  const t = pick(['2D', '2H'] as const)
  const target = t === '2D' ? 'H' : 'S'
  return bidEx(hand, 'S', ['1NT', 'P', t, 'P'], {
    bid: `2${target}`, why: `${bidLabel(t)} is een transfer (Jacoby): partner heeft een vijfkaart ${SUIT_NAME[target]}. Jij biedt die kleur: 2${S(target)}, ook met weinig ${SUIT_NAME[target]}.`,
  }, 'Jacoby', `Jij opende 1SA, partner biedt ${bidLabel(t)}. Wat bied je?`)
}

export const gen2CResponse: Generator = () => {
  const strong = Math.random() < 0.4
  const { hand, advice } = handFor(responseTo2C, (a) => strong ? a.bid !== '2D' : a.bid === '2D')
  return bidEx(hand, 'N', ['2C', 'P'], advice, '2♣', 'Partner opent 2♣. Wat bied je?')
}

export function genCompetitive(): Exercise {
  const opened = pick(SUITS)
  const target = pick(['X', 'X', 'over', 'over', 'pass', 'jump'])
  const { hand, advice } = handFor((h) => competitiveAction(opened, h), (a) => {
    if (target === 'X') return a.bid === 'X'
    if (target === 'pass') return a.bid === 'P'
    if (target === 'jump') return a.why.includes('sprongvolgbod')
    return a.bid !== 'P' && a.bid !== 'X'
  })
  return bidEx(hand, 'E', [`1${opened}`], advice, 'tussenbieden', `Oost (rechts van je) opent 1${S(opened)}. Wat doe jij?`)
}
export const genOvercall: Generator = genCompetitive

export const genAdvanceDouble: Generator = () => {
  const opened = pick(SUITS)
  const { hand, advice } = handFor((h) => answerToDouble(opened, h), () => true)
  return bidEx(hand, 'W', [`1${opened}`, 'X', 'P'], advice, 'informatiedoublet', `West opent 1${S(opened)}, partner doubleert, oost past. Wat bied je?`)
}

// --------------------------------------------------------------- afspel

/** Willekeurige kleur verdeeld over noord en zuid, met minstens één topkaart. */
function randomCombo(): { N: number[]; S: number[] } {
  for (;;) {
    const ranks = shuffle([14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
    const n = randInt(2, 5), s = randInt(1, 4)
    const N = ranks.slice(0, n).sort((a, b) => b - a)
    const Sx = ranks.slice(n, n + s).sort((a, b) => b - a)
    if (N.includes(14) || Sx.includes(14) || Math.random() < 0.15) return { N, S: Sx }
  }
}

export const genSureTricks: Generator = () => {
  const { N, S: Z } = randomCombo()
  const suit = pick(SUITS)
  const t = sureTricks(N, Z)
  const top = [...N, ...Z].sort((a, b) => b - a)
  let seq = 0
  for (let r = 14; top.includes(r); r--) seq++
  return {
    kind: 'number', skill: 'vaste slagen', answer: t,
    layout: { suit, N: holdingLabel(N), S: holdingLabel(Z) },
    prompt: 'Hoeveel vaste slagen hebben noord en zuid samen in deze kleur?',
    explain: seq === 0
      ? 'Zonder de aas heb je geen vaste slag: de tegenstanders kunnen je eerste slag altijd winnen.'
      : `Je hebt ${seq} aaneengesloten topkaart${seq > 1 ? 'en' : ''} vanaf de aas` +
        (t < seq ? `, maar de langste hand heeft maar ${Math.max(N.length, Z.length)} kaarten. Dus ${t} vaste slag${t > 1 ? 'en' : ''}.` : `: ${t} vaste slag${t > 1 ? 'en' : ''}.`),
  }
}

/** Tel de vaste slagen van noord-zuid in een SA-contract. */
export const genPlanCount: Generator = () => {
  const d = dealWhere((x) => {
    const p = hcp(x.N) + hcp(x.S)
    return p >= 24 && p <= 28 && isBalanced(x.S)
  })
  const per = SUITS.map((s) => sureTricks(cardsIn(d.N, s), cardsIn(d.S, s)))
  const total = per.reduce((a, b) => a + b, 0)
  return {
    kind: 'number', skill: 'speelplan', answer: total, hands: { N: d.N, S: d.S },
    prompt: 'Jij speelt 3SA. Hoeveel vaste slagen heb je (noord + zuid samen)?',
    explain: `Per kleur: ${SUITS.map((s, i) => `${S(s)} ${per[i]}`).join(', ')}. Samen ${total} vaste slagen, dus je komt ${Math.max(0, 9 - total)} slag${9 - total === 1 ? '' : 'en'} tekort voor 3SA.`,
  }
}

/**
 * Uitkomen: de hoogste van een serie (tot en met de 10); zonder serie met een
 * honneur een lage kaart, zonder honneur de hoogste kaart.
 */
export const genLead: Generator = () => {
  const kind = pick(['seq', 'seq', 'low', 'high'] as const)
  const pools: Record<typeof kind, [string, string][]> = {
    seq: [['HV9', 'H'], ['HV87', 'H'], ['VB32', 'V'], ['VB10', 'V'], ['B1084', 'B'], ['HB1064', 'B'], ['AVB2', 'V'], ['HVB4', 'H'], ['AH74', 'A'], ['AHV3', 'A'], ['B1072', 'B']],
    low: [['V8732', '32'], ['AB92', '2'], ['H853', '35'], ['B742', '24'], ['A965', '5'], ['H9642', '24'], ['V763', '3'], ['B9854', '45']],
    high: [['8732', '87'], ['9643', '96'], ['7542', '75'], ['964', '96'], ['87532', '87'], ['9852', '98']],
  }
  const [txt, lead] = pick(pools[kind])
  const suit = pick(SUITS)
  const cards = parseHolding(txt).map((rank) => ({ suit, rank }))
  const answer = parseHolding(lead).map((rank) => ({ suit, rank }))
  const good = answer.map(cardLabel).join(' of ')
  const explain = {
    seq: `Je hebt een serie: start met de hoogste kaart daarvan, ${good}. Die belooft de kaart er direct onder.`,
    low: `Geen serie, wel een honneur: kom uit met een lage kaart (${good}). Zo weet partner dat je iets in de kleur hebt.`,
    high: `Geen honneur in de kleur: kom uit met een hoge kaart (${good}). Zo weet partner dat je hier niets hebt.`,
  }[kind]
  return {
    kind: 'pick', skill: 'uitkomen', cards, answer,
    prompt: `Dit is je beste kleur en je komt erin uit. Met welke kaart start je?`,
    explain,
  }
}

export const allGenerators = {
  genTapHonours, genFollowSuit, genTrickNT, genTrickTrump, genHcp, genBalanced, genTricksNeeded, genIsGame,
  genBidOrder, genNTResponse, gen2NTResponse, genStaymanAnswer, genTransferAccept, gen2CResponse, genOvercall,
  genAdvanceDouble, genSureTricks, genPlanCount, genLead,
}

/** Alleen pas / 2SA / 3SA op 1SA, zonder vierkaart hoog (stof van 5b). */
export const genNTRaise: Generator = () => {
  const { hand, advice } = handFor((h) => responseToNT(1, h), (a) => ['P', '2NT', '3NT'].includes(a.bid),
    (h) => { const s = shape(h); return s.H < 4 && s.S < 4 })
  return bidEx(hand, 'N', ['1NT', 'P'], advice, '1SA antwoorden', 'Partner opent 1SA. Wat bied je?')
}
