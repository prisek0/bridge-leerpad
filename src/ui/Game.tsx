import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  type Card, type Hand, type Seat, type Suit, SEAT_NAME, SUITS, SUIT_SYMBOL, cardLabel, cardsIn, hcp, holdingLabel, sameCard,
} from '../bridge/cards'
import { type Bid, bidLabel } from '../bridge/bidding'
import {
  type Contract, adviseCall, chapterOf, contractLabel, legalCalls, readAuction, robotAuction, robotCall, seatAt, skillOf,
} from '../bridge/auction'
import {
  type Table, addCall, addCard, collect, contractScore, declarerTricks, dummyOf, dummyVisible, legalPlays, newTable, nsScore,
  tableWithAuction, toAct, trump,
} from '../bridge/table'
import { trickWinner } from '../bridge/play'
import { playOut, robotCard } from '../bridge/robot'
import { checkPlay, commentTrick, developSuit, leadAdvice, leadExplain, planCount } from '../bridge/coach'
import type { Exercise } from '../content/types'
import { type Mode, type Setup, chapterName, idealContract, isNS, learnedChapters, makeSetup } from '../game/modes'
import { type Progress, finishLesson, recordAnswer, recordSkill, setSetting } from '../state/progress'
import { Auction, BidBox, HandFan, HandRows, PlayingCard, Rich, Sym } from './Cards'
import { confetti, sounds } from './fx'

type Tone = 'good' | 'tip' | 'bad' | 'info'
interface Bubble { tone: Tone; text: string; actions?: { label: string; primary?: boolean; run: () => void }[] }
interface Note { tone: Tone; text: string }

export interface DealResult {
  board: number
  contract: Contract | null
  tricks: number
  ns: number
  other?: { contract: Contract | null; tricks: number; ns: number }
  xp: number
  role: 'decl' | 'def' | 'none'
  made: boolean | null
}

const declLabel = (c: Contract) => `${contractLabel(c)} door ${SEAT_NAME[c.declarer]}`

function initialTable(s: Setup): Table {
  return s.calls ? tableWithAuction(s.deal, s.dealer, s.calls) : newTable(s.deal, s.dealer)
}

export function Game({ mode, p, onExit }: { mode: Mode; p: Progress; onExit: () => void }) {
  const learned = useMemo(() => learnedChapters(p), [p.playAll, p.completed])
  const [board, setBoard] = useState(1)
  const [setup, setSetup] = useState<Setup>(() => makeSetup(mode, 1))
  const [t, setT] = useState<Table>(() => initialTable(setup))
  const [bubble, setBubble] = useState<Bubble | null>(null)
  const [pending, setPending] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [quiz, setQuiz] = useState<{ value: number | null; answered: boolean } | null>(null)
  const [view, setView] = useState<'table' | 'review' | 'summary'>('table')
  const [results, setResults] = useState<DealResult[]>([])
  const [showAuction, setShowAuction] = useState(false)
  const [tapped, setTapped] = useState<number | null>(null)
  const [bidScore, setBidScore] = useState({ right: 0, wrong: 0 })
  const used = useRef(new Set<string>())
  const recorded = useRef(new Set<string>())
  const turnSeen = useRef('')
  const flags = useRef({ quizDone: false, made: false, finished: false })
  const other = useMemo(() => {
    if (mode.id !== 'club') return null
    const calls = robotAuction(setup.deal, setup.dealer)
    return playOut(tableWithAuction(setup.deal, setup.dealer, calls))
  }, [setup])
  const coachOn = p.coach

  const you = (x: Table): Seat[] => {
    if (x.phase === 'auction') return mode.bid ? ['S'] : []
    if (!mode.play || !x.contract) return []
    return isNS(x.contract.declarer) ? ['N', 'S'] : ['S']
  }
  const youDeclare = !!t.contract && isNS(t.contract.declarer) && mode.play
  const note = (tone: Tone, text: string) => setNotes((n) => [...n, { tone, text }])
  const say = (b: Bubble | null) => setBubble(b)

  // ------------------------------------------------------------- bieden

  const auctionNotes = useMemo(() => readAuction(t.dealer, t.calls).notes, [t.calls, t.dealer])

  const bidExercise = (answer: Bid, why: string, skill: string): Exercise => ({
    kind: 'bid', skill, hand: t.hands.S, dealer: t.dealer, calls: t.calls, answer, explain: why,
    prompt: 'Uit een gespeeld spel: wat bied je?',
  })

  const makeCall = (b: Bid) => {
    setPending(false)
    setT((x) => addCall(x, b))
  }

  const userBid = (b: Bid) => {
    if (pending) return
    const ca = adviseCall(t.hands.S, t.dealer, t.calls)
    if (ca.covered && learned.has(chapterOf(ca.sit, ca.advice))) {
      const right = b === ca.advice.bid
      recordAnswer(bidExercise(ca.advice.bid, ca.advice.why, skillOf(ca.sit, ca.advice)), right)
      setBidScore((s) => right ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 })
      if (right) {
        if (p.sound) sounds.right()
        say({ tone: 'good', text: `Goed geboden! ${ca.advice.why}` })
        return makeCall(b)
      }
      note('bad', `Je bood ${bidLabel(b)}, de afspraak is ${bidLabel(ca.advice.bid)}. ${ca.advice.why}`)
      if (p.sound) sounds.wrong()
      if (!coachOn) return makeCall(b)
      setPending(true)
      return say({
        tone: 'bad', text: `Volgens de afspraken bied je hier ${bidLabel(ca.advice.bid)}. ${ca.advice.why}`,
        actions: [
          { label: `Bied ${bidLabel(ca.advice.bid)}`, primary: true, run: () => makeCall(ca.advice.bid) },
          { label: `Toch ${bidLabel(b)}`, run: () => makeCall(b) },
        ],
      })
    }
    say(null)
    makeCall(b)
  }

  /** Wat zeiden de anderen sinds jouw vorige bod? */
  const sinceYou = (): string => {
    const lines: string[] = []
    for (let i = t.calls.length - 1; i >= 0 && seatAt(t.dealer, i) !== 'S'; i--) {
      if (t.calls[i] === 'P') continue
      const n = auctionNotes[i]
      lines.unshift(`${n.seat === 'N' ? 'Partner' : SEAT_NAME[n.seat]}: ${n.text}`)
    }
    return lines.join('\n')
  }

  // Jouw beurt in de bieding: de coach zet het klaar.
  useEffect(() => {
    if (view !== 'table' || t.phase !== 'auction' || toAct(t) !== 'S' || !mode.bid) return
    const key = `${board}-a${t.calls.length}`
    if (turnSeen.current === key) return
    turnSeen.current = key
    const ca = adviseCall(t.hands.S, t.dealer, t.calls)
    const ctx = sinceYou()
    if (ca.covered) {
      const ch = chapterOf(ca.sit, ca.advice)
      if (!learned.has(ch)) {
        say({
          tone: 'info', text: `${ctx ? ctx + '\n\n' : ''}Dit bod leer je in ${chapterName(ch)}. De coach helpt: ${bidLabel(ca.advice.bid)}. ${ca.advice.why}`,
          actions: [{ label: `Bied ${bidLabel(ca.advice.bid)}`, primary: true, run: () => { say(null); makeCall(ca.advice.bid) } }],
        })
        setPending(true)
        return
      }
      if (ctx) say({ tone: 'info', text: ctx })
      else if (bubble?.tone !== 'good') say(null)
      return
    }
    say({
      tone: 'tip', text: `${ctx ? ctx + '\n\n' : ''}Hier heeft deel 1 geen vaste afspraak. Tip van de coach: ${bidLabel(ca.advice.bid)}. ${ca.advice.why}`,
      actions: [{ label: `Neem ${bidLabel(ca.advice.bid)}`, primary: true, run: () => { say(null); makeCall(ca.advice.bid) } }],
    })
  })

  // ------------------------------------------------------------- spelen

  const playCard = (card: Card) => {
    setPending(false)
    setT((x) => addCard(x, card))
  }

  const userCard = (seat: Seat, card: Card) => {
    if (pending || quiz) return
    const v = checkPlay(t, seat, card, used.current)
    if (v && learned.has(v.chapter)) {
      const key = `${v.rule}-${t.tricks.length}`
      const first = !recorded.current.has(key)
      recorded.current.add(key)
      if (v.rule === 'uitkomen' && first) {
        const a = leadAdvice(t.hands[seat].filter((c) => c.suit === card.suit))!
        recordAnswer({
          kind: 'pick', skill: 'uitkomen', prompt: `Uit een gespeeld spel: je komt uit in ${SUIT_SYMBOL[card.suit]}. Met welke kaart?`,
          cards: t.hands[seat].filter((c) => c.suit === card.suit).sort((a, b) => b.rank - a.rank), answer: a.good, explain: leadExplain(a.kind, a.good),
        }, v.ok)
      } else if (first) recordSkill(v.rule, v.ok)
      if (v.ok) {
        if (v.text) say({ tone: 'good', text: v.text })
      } else {
        if (['tweede hand', 'troef trekken', 'snijden', 'korte hand'].includes(v.rule)) used.current.add(v.rule)
        if (first) note('tip', v.text)
        if (coachOn) {
          setPending(true)
          const acts: Bubble['actions'] = []
          if (v.better.length) acts.push({ label: `Speel ${cardLabel(v.better[0])}`, primary: true, run: () => { say(null); playCard(v.better[0]) } })
          acts.push({ label: `Toch ${cardLabel(card)}`, run: () => { say(null); playCard(card) } })
          if (!v.better.length) acts.push({ label: 'Andere kaart', primary: true, run: () => { say(null); setPending(false) } })
          say({ tone: 'tip', text: v.text, actions: acts })
          return
        }
      }
    } else if (bubble?.tone === 'tip' || bubble?.tone === 'info') say(null)
    playCard(card)
  }

  // Robots, slagen opruimen, speelplan en einde van het spel.
  useEffect(() => {
    if (view !== 'table' || pending) return
    if (t.phase === 'done' || (t.phase === 'play' && !mode.play)) return finishDeal()
    if (t.phase === 'play' && t.trick.length === 4) {
      const id = setTimeout(() => afterTrick(collect(t)), 1050)
      return () => clearTimeout(id)
    }
    const seat = toAct(t)
    if (!seat) return
    if (you(t).includes(seat)) {
      if (t.phase === 'play' && youDeclare && !flags.current.quizDone && dummyVisible(t) && learned.has('h2')) {
        flags.current.quizDone = true
        setQuiz({ value: null, answered: false })
      }
      if (t.phase === 'play' && !t.tricks.length && !t.trick.length && seat === 'S') {
        say({ tone: 'info', text: `Jij komt uit tegen ${declLabel(t.contract!)}. Kies je beste kleur.` })
      }
      return
    }
    const id = setTimeout(() => {
      if (t.phase === 'auction') setT(addCall(t, robotCall(t.hands[seat], t.dealer, t.calls)))
      else setT(addCard(t, robotCard(t, seat)))
    }, t.phase === 'auction' ? 420 : 620)
    return () => clearTimeout(id)
  }, [t, view, pending, quiz])

  const afterTrick = (nt: Table) => {
    setT(nt)
    if (nt.phase === 'done') return
    const c = nt.contract!
    const need = 6 + c.level
    const dt = declarerTricks(nt)
    const defT = nt.tricks.length - dt
    if (!flags.current.made && (dt === need || defT === 14 - need)) {
      flags.current.made = true
      const declMade = dt === need
      const good = declMade === youDeclare
      if (p.sound && good) sounds.right()
      say({ tone: good ? 'good' : 'info', text: declMade
        ? (youDeclare ? `Je contract is binnen: ${need} slagen! Elke extra slag is een overslag.` : `De leider heeft zijn ${need} slagen. Probeer er nog zoveel mogelijk te pakken.`)
        : (youDeclare ? `Helaas, het contract kan niet meer: de tegenpartij heeft ${defT} slagen. Beperk de schade.` : `Het contract gaat down! Jullie hebben ${defT} slagen.`) })
      return
    }
    const cm = commentTrick(nt, you(nt))
    if (cm) { say({ tone: 'info', text: cm }); note('info', cm) }
    else if (bubble && !bubble.actions) say(null)
  }

  const autoplay = () => {
    say(null)
    setQuiz(null)
    setT((x) => playOut(x.trick.length === 4 ? collect(x) : x))
  }

  const hint = () => {
    const seat = toAct(t)
    if (!seat) return
    if (t.phase === 'auction') {
      const ca = adviseCall(t.hands.S, t.dealer, t.calls)
      return say({ tone: 'tip', text: `De coach zou ${bidLabel(ca.advice.bid)} bieden. ${ca.advice.why}` })
    }
    const c = robotCard(t, seat)
    const v = checkPlay(t, seat, c, new Set())
    say({ tone: 'tip', text: `De coach zou ${cardLabel(c)} spelen${seat === 'N' ? ' (uit de dummy)' : ''}.${v?.ok && v.text ? ' ' + v.text : ''}` })
  }

  // ------------------------------------------------------- einde spel

  function finishDeal() {
    if (flags.current.finished) return
    flags.current.finished = true
    const c = t.contract
    const tricks = declarerTricks(t)
    let role: DealResult['role'] = 'none'
    let made: boolean | null = null
    if (c && mode.play) {
      role = isNS(c.declarer) ? 'decl' : 'def'
      made = tricks >= 6 + c.level
    }
    const goodResult = role === 'decl' ? made : role === 'def' ? !made : null
    let xp = 3 + Math.min(3, bidScore.right) + (goodResult ? 2 : 0)
    if (mode.id === 'club' && other && nsScore(t) > nsScore(other)) xp += 2
    finishLesson(null, xp)
    if (p.sound) sounds.done()
    if (goodResult) confetti()
    setResults((r) => [...r, {
      board, contract: c, tricks, ns: mode.play ? nsScore(t) : 0, xp, role, made,
      other: other ? { contract: other.contract, tricks: declarerTricks(other), ns: nsScore(other) } : undefined,
    }])
    setView('review')
  }

  const nextDeal = () => {
    if (board >= mode.deals) return setView('summary')
    const s = makeSetup(mode, board + 1)
    setBoard(board + 1)
    setSetup(s)
    setT(initialTable(s))
    setNotes([])
    setBubble(null)
    setPending(false)
    setQuiz(null)
    setTapped(null)
    setShowAuction(false)
    used.current = new Set()
    recorded.current = new Set()
    flags.current = { quizDone: false, made: false, finished: false }
    setView('table')
  }

  // Bij afspelen en tegenspelen: eerst kort het contract.
  useEffect(() => {
    if (t.phase === 'play' && !t.tricks.length && !t.trick.length && !mode.bid && view === 'table') {
      const c = t.contract!
      say({ tone: 'info', text: youDeclare
        ? `Contract: ${declLabel(c)}. Jij speelt beide handen: zuid én de dummy (noord). ${SEAT_NAME[toAct(t)!]} komt uit.`
        : `Contract: ${declLabel(c)}. Jij en partner (noord) spelen tegen. ${toAct(t) === 'S' ? 'Jij komt uit.' : 'Partner komt uit.'}` })
    }
  }, [setup])

  if (view === 'summary') return <Summary mode={mode} results={results} bidScore={bidScore} onExit={onExit} />
  if (view === 'review') return <Review mode={mode} t={t} setup={setup} result={results[results.length - 1]} notes={notes} last={board >= mode.deals} onNext={nextDeal} onExit={onExit} />

  const turn = toAct(t)
  const yourTurn = !!turn && you(t).includes(turn) && !pending && !quiz
  const c = t.contract

  return (
    <div className="game">
      <header className="lesson-top game-top">
        <button type="button" className="close" onClick={onExit} aria-label="Stoppen">✕</button>
        <div className="gt-title">
          <span className="gt-kicker">{mode.title} · spel {board} van {mode.deals}</span>
          {c && t.phase === 'play'
            ? <span className="gt-contract"><Rich text={declLabel(c)} /></span>
            : <span className="gt-contract">Bieden · gever {SEAT_NAME[t.dealer]}</span>}
        </div>
        {c && t.phase === 'play' && (
          <div className="gt-tricks" aria-label="Slagen">
            <span>NZ <b>{t.tricks.filter((x) => isNS(x.winner)).length}</b></span>
            <span>OW <b>{t.tricks.filter((x) => !isNS(x.winner)).length}</b></span>
          </div>
        )}
      </header>

      {t.phase === 'auction' ? (
        <main className="game-body">
          <Auction dealer={t.dealer} calls={t.calls} last={turn === 'S' ? '?' : '…'} active={tapped}
            onTap={(i) => { setTapped(i); const n = auctionNotes[i]; say({ tone: 'info', text: `${n.seat === 'N' ? 'Partner' : n.seat === 'S' ? 'Jij' : SEAT_NAME[n.seat]}: ${n.text}` }) }} />
          <CoachBubble b={bubble} />
          <HandFan hand={t.hands.S} />
          <HandRows hand={t.hands.S} title={`Jouw hand · ${hcp(t.hands.S)} punten`} />
          <BidBox key={t.calls.length} legal={legalCalls(t.dealer, t.calls)} disabled={!yourTurn} onPick={userBid} />
        </main>
      ) : (
        <main className="game-body">
          {mode.bid || t.calls.length ? (
            <button type="button" className="auction-toggle" onClick={() => setShowAuction(!showAuction)}>
              {showAuction ? 'Verberg bieding' : 'Toon bieding'}
            </button>
          ) : null}
          {showAuction && <Auction dealer={t.dealer} calls={t.calls} last={null} active={tapped}
            onTap={(i) => { setTapped(i); const n = auctionNotes[i]; say({ tone: 'info', text: `${n.seat === 'N' ? 'Partner' : n.seat === 'S' ? 'Jij' : SEAT_NAME[n.seat]}: ${n.text}` }) }} />}
          <TableView t={t} you={you(t)} yourTurn={yourTurn} onCard={userCard} />
          {quiz ? <PlanQuiz t={t} learned={learned} quiz={quiz} setQuiz={setQuiz} onDone={() => setQuiz(null)} /> : <CoachBubble b={bubble} />}
          <SouthHand t={t} yourTurn={yourTurn && turn === 'S'} onCard={userCard} />
        </main>
      )}

      <footer className="game-foot">
        <button type="button" className="chipbtn" onClick={() => setSetting('coach', !coachOn)} aria-pressed={coachOn}>
          {coachOn ? 'Coach aan' : 'Coach uit'}
        </button>
        <button type="button" className="chipbtn" disabled={!yourTurn} onClick={hint}>Hint</button>
        {t.phase === 'play' && t.tricks.length >= 3 && <button type="button" className="chipbtn" onClick={autoplay}>Speel de rest</button>}
      </footer>
    </div>
  )
}

// ----------------------------------------------------------- de tafel

function CoachBubble({ b }: { b: Bubble | null }) {
  if (!b) return <div className="coach empty" aria-hidden="true" />
  return (
    <div className={`coach ${b.tone}`} role="status">
      <div className="coach-av" aria-hidden="true">{b.tone === 'good' ? '✓' : b.tone === 'bad' ? '!' : b.tone === 'tip' ? '?' : 'C'}</div>
      <div className="coach-body">
        <div className="coach-text">{b.text.split('\n').map((l, i) => l ? <p key={i}><Rich text={l} /></p> : null)}</div>
        {b.actions && (
          <div className="coach-acts">
            {b.actions.map((a) => <button key={a.label} type="button" className={`btn ${a.primary ? 'green' : 'ghost'}`} onClick={a.run}><Rich text={a.label} /></button>)}
          </div>
        )}
      </div>
    </div>
  )
}

function visibleSeat(t: Table, you: Seat[], s: Seat): boolean {
  if (s === 'S' || t.phase === 'done') return true
  if (you.includes(s)) return true
  return s === dummyOf(t) && dummyVisible(t)
}

function TableView({ t, you, yourTurn, onCard }: { t: Table; you: Seat[]; yourTurn: boolean; onCard: (s: Seat, c: Card) => void }) {
  const turn = toAct(t)
  const winner = t.trick.length === 4 ? trickWinner(t.trick, trump(t)).seat : null
  const legal = turn ? legalPlays(t, turn) : []
  const side = (s: Seat) => {
    const vis = visibleSeat(t, you, s)
    return (
      <div className={`pseat p${s} ${turn === s ? 'turn' : ''}`}>
        <div className="pname">{seatName(t, s)}</div>
        {vis ? <SideRows hand={t.hands[s]} /> : <Backs n={t.hands[s].length} />}
      </div>
    )
  }
  const northVis = visibleSeat(t, you, 'N')
  const northTurn = yourTurn && turn === 'N'
  return (
    <div className={`ptable ${visibleSeat(t, you, 'E') && dummyVisible(t) && dummyOf(t) === 'E' ? 'wide-e' : ''} ${visibleSeat(t, you, 'W') && dummyVisible(t) && dummyOf(t) === 'W' ? 'wide-w' : ''}`}>
      <div className={`pseat pN ${turn === 'N' ? 'turn' : ''}`}>
        <div className="pname">{seatName(t, 'N')}</div>
        {northVis
          ? <MiniFan hand={t.hands.N} playable={northTurn ? legal : []} onTap={(c) => onCard('N', c)} />
          : <Backs n={t.hands.N.length} />}
      </div>
      {side('W')}
      <div className="ptrick">
        {(['N', 'W', 'E', 'S'] as Seat[]).map((s) => {
          const pc = t.trick.find((x) => x.seat === s)
          return <div key={s} className={`tslot t${s}`}>{pc && <span className={`fly from${s} ${winner === s ? 'win' : ''}`}><PlayingCard card={pc.card} small /></span>}</div>
        })}
      </div>
      {side('E')}
    </div>
  )
}

function seatName(t: Table, s: Seat): string {
  const d = dummyOf(t)
  const role = t.contract && t.phase !== 'auction' ? (s === t.contract.declarer ? ' · leider' : s === d ? ' · dummy' : '') : ''
  const base = s === 'S' ? 'Jij (zuid)' : s === 'N' ? 'Partner (noord)' : SEAT_NAME[s]
  return base + role
}

function Backs({ n }: { n: number }) {
  return <div className="backs" aria-label={`${n} kaarten`}><span className="back" /><span className="back" /><span className="back" /><b>{n}</b></div>
}

function SideRows({ hand }: { hand: Hand }) {
  return (
    <div className="siderows">
      {SUITS.map((s) => <div key={s}><Sym s={s} /> {holdingLabel(cardsIn(hand, s))}</div>)}
    </div>
  )
}

function MiniFan({ hand, playable, onTap }: { hand: Hand; playable: Card[]; onTap: (c: Card) => void }) {
  return (
    <div className="minifan">
      {SUITS.map((s) => {
        const cs = hand.filter((c) => c.suit === s)
        if (!cs.length) return null
        return (
          <div key={s} className="mf-suit">
            {cs.map((c) => {
              const ok = playable.some((x) => sameCard(x, c))
              return <PlayingCard key={c.rank} card={c} small onClick={ok ? () => onTap(c) : undefined} state={undefined} selected={false} />
            })}
          </div>
        )
      })}
    </div>
  )
}

function SouthHand({ t, yourTurn, onCard }: { t: Table; yourTurn: boolean; onCard: (s: Seat, c: Card) => void }) {
  const legal = yourTurn ? legalPlays(t, 'S') : []
  const d = dummyOf(t)
  const label = d === 'S' ? 'Jij (zuid) · dummy' : t.contract?.declarer === 'S' ? 'Jij (zuid) · leider' : 'Jij (zuid)'
  return (
    <div className={`south ${toAct(t) === 'S' ? 'turn' : ''}`}>
      <div className="pname">{label}{yourTurn && <span className="yourturn"> · jouw beurt</span>}</div>
      <div className={`fan playfan ${yourTurn ? 'active' : ''}`} style={{ ['--n' as string]: Math.max(t.hands.S.length, 1) }}>
        {sortForFan(t.hands.S).map((c) => {
          const ok = legal.some((x) => sameCard(x, c))
          return <PlayingCard key={c.suit + c.rank} card={c} onClick={ok ? () => onCard('S', c) : undefined} state={undefined} selected={false} />
        })}
      </div>
    </div>
  )
}

const FAN: Suit[] = ['S', 'H', 'C', 'D']
const sortForFan = (h: Hand) => [...h].sort((a, b) => FAN.indexOf(a.suit) - FAN.indexOf(b.suit) || b.rank - a.rank)

// ------------------------------------------------------- speelplan

function PlanQuiz({ t, learned, quiz, setQuiz, onDone }: {
  t: Table; learned: Set<string>; quiz: { value: number | null; answered: boolean }
  setQuiz: (q: { value: number | null; answered: boolean }) => void; onDone: () => void
}) {
  const plan = useMemo(() => planCount(t), [])
  const dev = useMemo(() => developSuit(t), [])
  const v = quiz.value
  const press = (d: number | 'del') => {
    if (quiz.answered) return
    const cur = v === null ? '' : String(v)
    const next = d === 'del' ? cur.slice(0, -1) : (cur + d).slice(0, 2)
    setQuiz({ value: next === '' ? null : Number(next), answered: false })
  }
  const check = () => {
    const ok = v === plan.total
    recordSkill('vaste slagen', ok)
    setQuiz({ value: v, answered: true })
  }
  const short = Math.max(0, plan.need - plan.total)
  return (
    <div className={`coach plan ${quiz.answered ? (v === plan.total ? 'good' : 'bad') : 'tip'}`}>
      <div className="coach-av" aria-hidden="true">C</div>
      <div className="coach-body">
        {!quiz.answered ? (
          <>
            <div className="coach-text"><p><strong>Speelplan.</strong> De dummy ligt op tafel. Hoeveel vaste slagen hebben jullie samen?</p></div>
            <div className="plan-pad">
              <span className="plan-val">{v ?? '…'}</span>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <button key={d} type="button" onClick={() => press(d)}>{d}</button>)}
              <button type="button" onClick={() => press('del')} aria-label="Wissen">⌫</button>
            </div>
            <div className="coach-acts">
              <button type="button" className="btn green" disabled={v === null} onClick={check}>Controleer</button>
              <button type="button" className="btn ghost" onClick={onDone}>Overslaan</button>
            </div>
          </>
        ) : (
          <>
            <div className="coach-text">
              <p><strong>{v === plan.total ? 'Goed geteld!' : `Het zijn er ${plan.total}.`}</strong> Per kleur: <Rich text={SUITS.map((s) => `${SUIT_SYMBOL[s]} ${plan.per[s]}`).join(', ')} />.</p>
              <p>Je hebt {plan.need} slagen nodig{short ? `, dus je komt er ${short} tekort.` : ': die heb je al. Incasseer ze, maar let op de korte hand eerst.'}</p>
              {short > 0 && learned.has('h8') && dev && <p><Rich text={`Plan: ontwikkel ${SUIT_SYMBOL[dev]}, daar zitten de extra slagen. Speel die kleur vroeg, nu je nog controle hebt in de andere kleuren.`} /></p>}
              {short > 0 && trump(t) && learned.has('h9') && <p>In een troefcontract: trek eerst troef, tenzij je de dummy nog nodig hebt om te troeven.</p>}
            </div>
            <div className="coach-acts"><button type="button" className="btn green" onClick={onDone}>Speel verder</button></div>
          </>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------- nabespreking

function resultLine(c: Contract | null, tricks: number): ReactNode {
  if (!c) return 'Rondgepast'
  const need = 6 + c.level
  const diff = tricks - need
  return <><Rich text={declLabel(c)} />: {diff >= 0 ? `gemaakt${diff ? ` +${diff}` : ''} (${tricks} slagen)` : `${-diff} down (${tricks} slagen)`}</>
}

function Review({ mode, t, setup, result, notes, last, onNext, onExit }: {
  mode: Mode; t: Table; setup: Setup; result: DealResult; notes: Note[]; last: boolean; onNext: () => void; onExit: () => void
}) {
  const c = t.contract
  const auctionNotes = readAuction(t.dealer, t.calls).notes
  const ideal = idealContract(setup.deal)
  const score = c && mode.play ? contractScore(c, declarerTricks(t)) : null
  const nsView = result.ns
  const verdict = mode.id === 'bieden' ? biddingVerdict(c, ideal) : null
  const title = !mode.play ? 'Bieding klaar'
    : result.role === 'decl' ? (result.made ? 'Contract gemaakt!' : 'Down gegaan')
    : result.role === 'def' ? (result.made ? 'Contract gemaakt door de tegenpartij' : 'Down gespeeld!') : 'Spel klaar'
  return (
    <div className="review">
      <header className="lesson-top"><button type="button" className="close" onClick={onExit} aria-label="Stoppen">✕</button>
        <div className="gt-kicker">{mode.title} · spel {result.board} van {mode.deals}</div></header>
      <main className="review-body">
        <h1>{title}</h1>
        {c ? <p className="rv-line">{mode.play ? resultLine(c, result.tricks) : <Rich text={`Eindcontract: ${declLabel(c)}`} />}</p> : <p className="rv-line">Iedereen paste.</p>}
        {score && <p className="muted small rv-score">{isNS(c!.declarer) ? 'Noord-zuid' : 'Oost-west'} {score.score >= 0 ? '+' : ''}{score.score} ({score.parts.join(' + ')}). Niet kwetsbaar.</p>}
        {verdict && <div className={`coach ${verdict.tone}`}><div className="coach-av" aria-hidden="true">{verdict.tone === 'good' ? '✓' : 'C'}</div><div className="coach-body"><div className="coach-text"><p><Rich text={verdict.text} /></p></div></div></div>}
        {result.other && (
          <div className="other-table">
            <div className="ot-h">De andere tafel (robots, dezelfde kaarten)</div>
            <div className="ot-row"><span>Jullie</span><span>{resultLine(c, result.tricks)}</span><b>{nsView >= 0 ? '+' : ''}{nsView}</b></div>
            <div className="ot-row"><span>Andere tafel</span><span>{resultLine(result.other.contract, result.other.tricks)}</span><b>{result.other.ns >= 0 ? '+' : ''}{result.other.ns}</b></div>
            <div className={`ot-verdict ${nsView > result.other.ns ? 'win' : nsView < result.other.ns ? 'loss' : ''}`}>
              {nsView > result.other.ns ? `Je wint dit spel met ${nsView - result.other.ns} punten!` : nsView < result.other.ns ? `De andere tafel deed het ${result.other.ns - nsView} punten beter.` : 'Gelijk spel.'}
            </div>
          </div>
        )}
        <div className="xp-gain">+{result.xp} XP</div>

        {notes.filter((n) => n.tone !== 'info').length > 0 && (
          <section className="rv-sec">
            <h2>Tips van de coach</h2>
            <ul className="rv-notes">{notes.filter((n) => n.tone !== 'info').map((n, i) => <li key={i} className={n.tone}><Rich text={n.text} /></li>)}</ul>
          </section>
        )}

        <section className="rv-sec">
          <h2>Alle handen</h2>
          <div className="compass">
            {(['N', 'W', 'E', 'S'] as Seat[]).map((s) => (
              <div key={s} className={`cmp c${s}`}><HandRows hand={setup.deal[s]} title={`${SEAT_NAME[s]} · ${hcp(setup.deal[s])}`} /></div>
            ))}
          </div>
          {!verdict && <p className="muted small">{ideal.text}</p>}
        </section>

        {t.calls.length > 0 && (
          <section className="rv-sec">
            <h2>De bieding</h2>
            <Auction dealer={t.dealer} calls={t.calls} last={null} />
            <ul className="rv-calls">
              {auctionNotes.filter((n) => n.call !== 'P' || n.seat === 'S').map((n, i) => (
                <li key={i}><b>{n.seat === 'S' ? 'Jij' : n.seat === 'N' ? 'Partner' : SEAT_NAME[n.seat]}</b>: <Rich text={n.text} /></li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <footer className="theory-foot">
        <button type="button" className="btn ghost" onClick={onExit}>Stoppen</button>
        <button type="button" className="btn green" onClick={onNext}>{last ? 'Uitslag' : 'Volgend spel'}</button>
      </footer>
    </div>
  )
}

function biddingVerdict(c: Contract | null, ideal: ReturnType<typeof idealContract>): { tone: Tone; text: string } {
  if (!c || !isNS(c.declarer)) {
    if (ideal.pts >= 23) return { tone: 'tip', text: `De tegenpartij kreeg het contract, maar ${ideal.text}` }
    return { tone: 'good', text: `De tegenpartij speelt. ${ideal.text}` }
  }
  const game = contractScore(c, 13).parts.some((x) => x.startsWith('manche'))
  if (ideal.game && !game) return { tone: 'tip', text: `Jullie bleven in een deelscore. ${ideal.text}` }
  if (!ideal.game && game && c.level <= 5) return { tone: 'tip', text: `Jullie boden een manche met maar ${ideal.pts} punten. ${ideal.text}` }
  if (ideal.game && ideal.strain && ideal.strain !== 'NT' && c.strain !== ideal.strain) return { tone: 'tip', text: `Een manche, goed! ${ideal.text}` }
  return { tone: 'good', text: `Goed contract! ${ideal.text}` }
}

function Summary({ mode, results, bidScore, onExit }: { mode: Mode; results: DealResult[]; bidScore: { right: number; wrong: number }; onExit: () => void }) {
  const xp = results.reduce((a, r) => a + r.xp, 0)
  const good = results.filter((r) => (r.role === 'decl' && r.made) || (r.role === 'def' && !r.made)).length
  const played = results.filter((r) => r.role !== 'none').length
  const you = results.reduce((a, r) => a + r.ns, 0)
  const them = results.reduce((a, r) => a + (r.other?.ns ?? 0), 0)
  const bids = bidScore.right + bidScore.wrong
  useEffect(() => { confetti() }, [])
  return (
    <div className="lesson-done">
      <div className="done-hand" aria-hidden="true">
        {['A♠', 'H♥', 'V♦', 'B♣'].map((c) => (
          <span key={c} className={`dh-card ${c.endsWith('♥') || c.endsWith('♦') ? 'red' : 'black'}`}><span className="mc-rank">{c[0]}</span><span className="mc-suit">{c[1]}</span></span>
        ))}
      </div>
      <h1>{mode.id === 'club' ? (you > them ? 'Gewonnen!' : you < them ? 'Net niet!' : 'Gelijkspel!') : `${mode.title} klaar!`}</h1>
      {mode.id === 'club' && <p className="muted">Jullie {you >= 0 ? '+' : ''}{you} tegen de andere tafel {them >= 0 ? '+' : ''}{them}</p>}
      <div className="done-stats">
        <div className="stat xp"><div className="stat-h">XP</div><div className="stat-v">+{xp}</div></div>
        {played > 0 && <div className="stat acc"><div className="stat-h">{mode.id === 'tegenspel' ? 'Down' : 'Gelukt'}</div><div className="stat-v">{good}/{played}</div></div>}
        {bids > 0 && <div className="stat time"><div className="stat-h">Bieden</div><div className="stat-v">{Math.round((bidScore.right / bids) * 100)}%</div></div>}
      </div>
      <button type="button" className="btn big green" onClick={onExit}>Doorgaan</button>
    </div>
  )
}

