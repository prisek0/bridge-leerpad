import { type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { MODES, type Mode, type Setup, chapterName, idealContract, isNS, learnedChapters, makeSetup } from '../game/modes'
import { type Progress, type Replay, finishLesson, recordAnswer, recordSkill, replayDone, saveReplay, setSetting } from '../state/progress'
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
  /** XP voor dit spel in totaal, over alle pogingen. */
  xp: number
  /** XP van deze poging. */
  gain: number
  role: 'decl' | 'def' | 'none'
  made: boolean | null
  /** Waarom het beter kon; dan mag je het spel opnieuw spelen. */
  retry: string | null
  /** 0 is de eerste keer. */
  attempt: number
  prev?: { contract: Contract | null; tricks: number }
}

const declLabel = (c: Contract) => `${contractLabel(c)} door ${SEAT_NAME[c.declarer]}`

function initialTable(s: Setup): Table {
  return s.calls ? tableWithAuction(s.deal, s.dealer, s.calls) : newTable(s.deal, s.dealer)
}

/**
 * Kon het beter? De robots spelen altijd hetzelfde, dus wat zij met dezelfde
 * kaarten halen is een eerlijke maatstaf. Geeft de reden, of null als het goed was.
 */
function retryReason(mode: Mode, t: Table, bench: Table | null, other: Table | null, notes: Note[], ideal: ReturnType<typeof idealContract>): string | null {
  const c = t.contract
  if (mode.id === 'bieden') {
    if (notes.some((n) => n.tone === 'bad')) return 'Je week in de bieding af van de afspraken.'
    return biddingVerdict(c, ideal).tone === 'good' ? null : 'Er zat een beter contract in.'
  }
  if (mode.id === 'club') {
    if (!other || nsScore(t) >= nsScore(other)) return null
    return `De andere tafel scoorde ${nsScore(other) - nsScore(t)} punten meer met dezelfde kaarten.`
  }
  if (!c || !bench) return null
  const mine = declarerTricks(t), robot = declarerTricks(bench)
  const need = 6 + c.level
  if (isNS(c.declarer)) {
    if (mine < robot) return `De robot haalde met dezelfde kaarten ${robot} slagen, jij ${mine}.`
    if (mine < need) return `Het contract ging ${need - mine} down. Lukt het met een ander plan?`
    return null
  }
  if (mine > robot) return `De robots haalden met dezelfde kaarten ${13 - robot} slagen in de verdediging, jullie ${13 - mine}.`
  return null
}

/** Een speelvorm, of met `replays` een rij herkansingen (elk in zijn eigen speelvorm). */
export function Game({ mode: chosen, replays, p, onExit }: { mode: Mode; replays?: Replay[]; p: Progress; onExit: () => void }) {
  const learned = useMemo(() => learnedChapters(p), [p.playAll, p.completed])
  const [queue] = useState(replays)
  const modeAt = (b: number) => (queue ? MODES.find((m) => m.id === queue[b - 1].mode)! : chosen)
  const setupAt = (b: number) => (queue ? queue[b - 1].setup : makeSetup(chosen, b))
  const [board, setBoard] = useState(1)
  const mode = modeAt(board)
  const title = queue ? 'Herkansing' : mode.title
  const total = queue ? queue.length : mode.deals
  const [setup, setSetup] = useState<Setup>(() => setupAt(1))
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
  const flags = useRef({ quizDone: false, made: false, finished: false, intro: false })
  const other = useMemo(() => {
    if (mode.id !== 'club') return null
    const calls = robotAuction(setup.deal, setup.dealer)
    return playOut(tableWithAuction(setup.deal, setup.dealer, calls))
  }, [setup])
  // Bij afspelen en tegenspelen: hoe de robots dit spel zelf afspelen.
  const bench = useMemo(() => (mode.play && !mode.bid ? playOut(initialTable(setup)) : null), [setup])
  const attempt = useRef<{ n: number; prev: DealResult | null }>({ n: 0, prev: null })
  const coachOn = p.coach

  const you = (x: Table): Seat[] => {
    if (x.phase === 'auction') return mode.bid ? ['S'] : []
    if (!mode.play || !x.contract) return []
    return isNS(x.contract.declarer) ? ['N', 'S'] : ['S']
  }
  const youDeclare = !!t.contract && isNS(t.contract.declarer) && mode.play
  const note = (tone: Tone, text: string) => setNotes((n) => [...n, { tone, text }])
  // Lof of een tip blijft even staan: de robots wachten tot je het gelezen hebt.
  const readUntil = useRef(0)
  const [tick, setTick] = useState(0)
  const say = (b: Bubble | null) => {
    if (b && b.tone !== 'info' && !b.actions) readUntil.current = Date.now() + Math.min(4500, Math.max(1800, b.text.length * 40))
    setBubble(b)
  }

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
          { label: `Bied ${bidLabel(ca.advice.bid)}`, primary: true, run: () => { say(null); makeCall(ca.advice.bid) } },
          { label: `Toch ${bidLabel(b)}`, run: () => { say(null); makeCall(b) } },
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

  // Laatste kaart terug: de tafel zoals hij was vlak voor jouw laatste kaart.
  const [undoTo, setUndoTo] = useState<{ t: Table; notes: Note[]; flags: typeof flags.current; used: Set<string>; recorded: Set<string> } | null>(null)

  const playCard = (card: Card) => {
    setUndoTo({ t, notes, flags: { ...flags.current }, used: new Set(used.current), recorded: new Set(recorded.current) })
    setPending(false)
    setT((x) => addCard(x, card))
  }

  const undo = () => {
    if (!undoTo) return
    flags.current = undoTo.flags
    used.current = undoTo.used
    recorded.current = undoTo.recorded
    readUntil.current = 0
    setNotes(undoTo.notes)
    setBubble(null)
    setPending(false)
    setQuiz(null)
    setT(undoTo.t)
    setUndoTo(null)
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
    const reading = readUntil.current - Date.now()
    if (reading > 0) {
      const id = setTimeout(() => setTick((n) => n + 1), reading)
      return () => clearTimeout(id)
    }
    if (t.phase === 'done' || (t.phase === 'play' && !mode.play)) return finishDeal()
    // Na je eigen bieding: wat er uit de bieding van de coach nog staat, maakt plaats voor het contract.
    const intro = t.phase === 'play' && mode.bid && !t.tricks.length && !t.trick.length && !flags.current.intro
    if (intro) {
      flags.current.intro = true
      say({ tone: 'info', text: introText() })
    }
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
      if (t.phase === 'play' && !t.tricks.length && !t.trick.length && seat === 'S' && !intro) {
        say({ tone: 'info', text: `Jij komt uit tegen ${declLabel(t.contract!)}. Kies je beste kleur.` })
      }
      return
    }
    const id = setTimeout(() => {
      if (t.phase === 'auction') setT(addCall(t, robotCall(t.hands[seat], t.dealer, t.calls)))
      else setT(addCard(t, robotCard(t, seat)))
    }, t.phase === 'auction' ? 420 : 620)
    return () => clearTimeout(id)
  }, [t, view, pending, quiz, tick])

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
    setUndoTo(null)
    say(null)
    setQuiz(null)
    setT((x) => playOut(x.trick.length === 4 ? collect(x) : x))
  }

  const hint = () => {
    const seat = toAct(t)
    if (!seat) return
    if (t.phase === 'auction') {
      const ca = adviseCall(t.hands.S, t.dealer, t.calls)
      return setBubble({ tone: 'tip', text: `De coach zou ${bidLabel(ca.advice.bid)} bieden. ${ca.advice.why}` })
    }
    const c = robotCard(t, seat)
    const v = checkPlay(t, seat, c, new Set())
    setBubble({ tone: 'tip', text: `De coach zou ${cardLabel(c)} spelen${seat === 'N' ? ' (uit de dummy)' : ''}.${v?.ok && v.text ? ' ' + v.text : ''}` })
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
    const retry = retryReason(mode, t, bench, other, notes, idealContract(setup.deal))
    const { n, prev } = attempt.current
    let xp = 3 + Math.min(3, bidScore.right) + (goodResult ? 2 : 0)
    if (mode.id === 'club' && other && nsScore(t) > nsScore(other)) xp += 2
    // Opnieuw spelen levert alleen nog wat op als het nu wel lukt.
    if (n) xp = retry ? 0 : 2
    // Wat beter kon komt een andere dag terug, zonder dat je de kaarten nog weet.
    if (!n) {
      if (queue) replayDone(queue[board - 1].id, !retry)
      else if (retry) saveReplay(mode.id, setup, retry)
    }
    if (xp) finishLesson(null, xp)
    if (p.sound) sounds.done()
    if (goodResult || (n && !retry)) confetti()
    setResults((r) => [...r, {
      board, contract: c, tricks, ns: mode.play ? nsScore(t) : 0, xp: (prev?.xp ?? 0) + xp, gain: xp, role, made, retry, attempt: n,
      prev: prev ? { contract: prev.contract, tricks: prev.tricks } : undefined,
      other: other ? { contract: other.contract, tricks: declarerTricks(other), ns: nsScore(other) } : undefined,
    }])
    setView('review')
  }

  const nextDeal = () => {
    if (board >= total) return setView('summary')
    attempt.current = { n: 0, prev: null }
    setBoard(board + 1)
    startDeal(setupAt(board + 1))
  }

  /** Hetzelfde spel nog eens; de vorige poging telt niet meer mee in de uitslag. */
  const retryDeal = () => {
    attempt.current = { n: attempt.current.n + 1, prev: results[results.length - 1] }
    setResults((r) => r.slice(0, -1))
    // Een nieuw object, zodat de uitleg aan het begin opnieuw komt.
    startDeal({ ...setup })
  }

  function startDeal(s: Setup) {
    setSetup(s)
    setT(initialTable(s))
    setUndoTo(null)
    setNotes([])
    setBubble(null)
    setPending(false)
    setQuiz(null)
    setTapped(null)
    setShowAuction(false)
    used.current = new Set()
    recorded.current = new Set()
    turnSeen.current = ''
    readUntil.current = 0
    flags.current = { quizDone: false, made: false, finished: false, intro: false }
    setView('table')
  }

  const introText = () => youDeclare
    ? `Contract: ${declLabel(t.contract!)}. ${t.contract!.declarer === 'S'
      ? 'Jij speelt beide handen: zuid én de dummy (noord).'
      : 'Jij speelt beide handen: noord én je eigen kaarten, die nu de dummy zijn.'} ${SEAT_NAME[toAct(t)!]} komt uit.`
    : `Contract: ${declLabel(t.contract!)}. Jij en partner (noord) spelen tegen. ${toAct(t) === 'S' ? 'Jij komt uit.' : 'Partner komt uit.'}`

  // Bij afspelen en tegenspelen: eerst kort het contract.
  useEffect(() => {
    if (t.phase === 'play' && !t.tricks.length && !t.trick.length && !mode.bid && view === 'table') {
      const why = queue ? `Herkansing. Vorige keer: ${queue[board - 1].reason}\n` : ''
      say({ tone: 'info', text: why + introText() })
    }
  }, [setup])

  if (view === 'summary') return <Summary mode={mode} title={title} mixed={!!queue} results={results} bidScore={bidScore} onExit={onExit} />
  if (view === 'review') return <Review mode={mode} title={title} total={total} t={t} setup={setup} result={results[results.length - 1]} notes={notes} last={board >= total} onNext={nextDeal} onRetry={retryDeal} onExit={onExit} />

  const turn = toAct(t)
  const yourTurn = !!turn && you(t).includes(turn) && !pending && !quiz
  const c = t.contract

  return (
    <div className="game">
      <header className="lesson-top game-top">
        <button type="button" className="close" onClick={onExit} aria-label="Stoppen">✕</button>
        <div className="gt-title">
          <span className="gt-kicker">{title} · spel {board} van {total}</span>
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
        {undoTo && t.phase === 'play' && <button type="button" className="chipbtn" onClick={undo}>↶ Terug</button>}
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

/**
 * Schuif met je vinger over de kaarten: de speelbare kaart die het dichtst bij je vinger ligt
 * komt omhoog, en loslaten speelt precies die kaart. Gekozen wordt op de plek van de kaarten,
 * niet op wat er onder de vinger ligt: de opgetilde kaart schuift weg.
 */
function useSlidePick(active: boolean, ok: boolean[], play: (i: number) => void) {
  const box = useRef<HTMLDivElement>(null)
  const [peek, setPeek] = useState<number | null>(null)
  const peeked = useRef<number | null>(null)
  const down = useRef(false)
  const skipClick = useRef(false)
  const lift = (i: number | null) => { peeked.current = i; setPeek(i) }
  const at = (e: ReactPointerEvent): number | null => {
    const el = box.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    const kids = [...el.querySelectorAll<HTMLElement>('.pcard')]
    let best: number | null = null, dist = Infinity
    kids.forEach((k, i) => {
      if (!ok[i]) return
      // Zichtbaar is het stuk tot de volgende kaart in dezelfde rij.
      const next = kids[i + 1]
      const left = k.offsetLeft, top = k.offsetTop
      const right = next && next.parentElement === k.parentElement ? next.offsetLeft : left + k.offsetWidth
      const bottom = top + k.offsetHeight
      const d = (x < left ? left - x : x > right ? x - right : 0) + (y < top ? top - y : y > bottom ? y - bottom : 0)
      if (d < dist) { dist = d; best = i }
    })
    return best
  }
  const handlers = {
    onPointerDown: (e: ReactPointerEvent) => {
      if (!active) return
      down.current = true
      try { box.current?.setPointerCapture(e.pointerId) } catch { /* pointer al weg */ }
      lift(at(e))
    },
    onPointerMove: (e: ReactPointerEvent) => { if (active && (down.current || e.pointerType === 'mouse')) lift(at(e)) },
    onPointerUp: () => {
      if (!down.current) return
      down.current = false
      const i = peeked.current
      lift(null)
      // De klik die na het loslaten komt, niet nog eens spelen.
      skipClick.current = true
      setTimeout(() => { skipClick.current = false }, 400)
      if (i !== null) play(i)
    },
    onPointerCancel: () => { down.current = false; lift(null) },
    onPointerLeave: (e: ReactPointerEvent) => { if (e.pointerType === 'mouse' && !down.current) lift(null) },
  }
  /** Gewone klik (ook met het toetsenbord), behalve vlak na het loslaten. */
  const click = (i: number) => (ok[i] ? () => { if (!skipClick.current) play(i) } : undefined)
  return { box, peek, handlers, click }
}

function MiniFan({ hand, playable, onTap }: { hand: Hand; playable: Card[]; onTap: (c: Card) => void }) {
  const groups = SUITS.map((s) => hand.filter((c) => c.suit === s)).filter((cs) => cs.length)
  const cards = groups.flat()
  const ok = cards.map((c) => playable.some((x) => sameCard(x, c)))
  const pick = useSlidePick(playable.length > 0, ok, (i) => onTap(cards[i]))
  let i = 0
  return (
    <div ref={pick.box} className={`minifan ${playable.length ? 'active' : ''}`} {...pick.handlers}>
      {groups.map((cs) => (
        <div key={cs[0].suit} className="mf-suit">
          {cs.map((c) => {
            const n = i++
            return <PlayingCard key={c.rank} card={c} small peek={pick.peek === n} onClick={pick.click(n)} />
          })}
        </div>
      ))}
    </div>
  )
}

function SouthHand({ t, yourTurn, onCard }: { t: Table; yourTurn: boolean; onCard: (s: Seat, c: Card) => void }) {
  const legal = yourTurn ? legalPlays(t, 'S') : []
  const cards = sortForFan(t.hands.S)
  const ok = cards.map((c) => legal.some((x) => sameCard(x, c)))
  const pick = useSlidePick(yourTurn, ok, (i) => onCard('S', cards[i]))
  const width = useWidth(pick.box)
  const margins = fanMargins(ok, width)
  const d = dummyOf(t)
  const label = d === 'S' ? 'Jij (zuid) · dummy' : t.contract?.declarer === 'S' ? 'Jij (zuid) · leider' : 'Jij (zuid)'
  return (
    <div className={`south ${toAct(t) === 'S' ? 'turn' : ''}`}>
      <div className="pname">{label}{yourTurn && <span className="yourturn"> · jouw beurt</span>}</div>
      <div ref={pick.box} className={`fan playfan ${yourTurn ? 'active' : ''}`} style={{ ['--n' as string]: Math.max(cards.length, 1) }} {...pick.handlers}>
        {cards.map((c, i) => (
          <PlayingCard key={c.suit + c.rank} card={c} peek={pick.peek === i} style={margins && i ? { marginLeft: margins[i] } : undefined} onClick={pick.click(i)} />
        ))}
      </div>
    </div>
  )
}

const FAN: Suit[] = ['S', 'H', 'C', 'D']
const sortForFan = (h: Hand) => [...h].sort((a, b) => FAN.indexOf(a.suit) - FAN.indexOf(b.suit) || b.rank - a.rank)

const CARD_W = 52

/**
 * Hoe ver elke kaart over de vorige schuift. Een kaart is zo breed te zien als
 * de stap van de kaart erna; speelbare kaarten krijgen die ruimte, de rest schuift in.
 */
function fanMargins(ok: boolean[], width: number): number[] | null {
  const n = ok.length
  if (n < 2 || !width) return null
  const room = width - CARD_W
  // Weinig kaarten: naast elkaar met een kiertje, zodat je ze makkelijk raakt.
  const even = Math.min(CARD_W + 4, room / (n - 1))
  const open = ok.slice(0, -1).filter(Boolean).length
  const shut = n - 1 - open
  let wide = even, narrow = even
  if (open && shut) {
    narrow = Math.min(even, 14)
    wide = Math.max(even, Math.min(CARD_W + 4, (room - shut * narrow) / open))
  }
  return ok.map((_, i) => (i ? (ok[i - 1] ? wide : narrow) - CARD_W : 0))
}

function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

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

function Review({ mode, title: modeTitle, total, t, setup, result, notes, last, onNext, onRetry, onExit }: {
  mode: Mode; title: string; total: number; t: Table; setup: Setup; result: DealResult; notes: Note[]; last: boolean; onNext: () => void; onRetry: () => void; onExit: () => void
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
        <div className="gt-kicker">{modeTitle} · spel {result.board} van {total}{result.attempt ? ` · poging ${result.attempt + 1}` : ''}</div></header>
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
        {result.prev && mode.play && <p className="muted small">Vorige poging: {resultLine(result.prev.contract, result.prev.tricks)}</p>}
        {result.retry
          ? <CoachBubble b={{ tone: 'tip', text: `${result.retry}\nWil je het nog eens proberen? Je krijgt dezelfde kaarten.`, actions: [{ label: 'Opnieuw spelen', primary: true, run: onRetry }] }} />
          : result.attempt > 0 && <CoachBubble b={{ tone: 'good', text: 'Nu is het gelukt. Goed dat je het nog eens probeerde!' }} />}
        {result.gain > 0 && <div className="xp-gain">+{result.gain} XP</div>}

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
    if (ideal.pts >= 23) return { tone: 'tip', text: `${c ? 'De tegenpartij kreeg het contract' : 'Iedereen paste'}, maar ${ideal.text}` }
    return { tone: 'good', text: `De tegenpartij speelt. ${ideal.text}` }
  }
  const game = contractScore(c, 13).parts.some((x) => x.startsWith('manche'))
  if (ideal.game && !game) return { tone: 'tip', text: `Jullie bleven in een deelscore. ${ideal.text}` }
  if (!ideal.game && game && c.level <= 5) return { tone: 'tip', text: `Jullie boden een manche met maar ${ideal.pts} punten. ${ideal.text}` }
  if (ideal.game && ideal.strain && ideal.strain !== 'NT' && c.strain !== ideal.strain) return { tone: 'tip', text: `Een manche, goed! ${ideal.text}` }
  return { tone: 'good', text: `Goed contract! ${ideal.text}` }
}

function Summary({ mode, title, mixed, results, bidScore, onExit }: {
  mode: Mode; title: string; mixed: boolean; results: DealResult[]; bidScore: { right: number; wrong: number }; onExit: () => void
}) {
  const club = !mixed && mode.id === 'club'
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
      <h1>{club ? (you > them ? 'Gewonnen!' : you < them ? 'Net niet!' : 'Gelijkspel!') : `${mixed ? 'Herkansingen' : title} klaar!`}</h1>
      {club && <p className="muted">Jullie {you >= 0 ? '+' : ''}{you} tegen de andere tafel {them >= 0 ? '+' : ''}{them}</p>}
      <div className="done-stats">
        <div className="stat xp"><div className="stat-h">XP</div><div className="stat-v">+{xp}</div></div>
        {mixed
          ? <div className="stat acc"><div className="stat-h">Nu goed</div><div className="stat-v">{results.filter((r) => !r.retry).length}/{results.length}</div></div>
          : played > 0 && <div className="stat acc"><div className="stat-h">{mode.id === 'tegenspel' ? 'Down' : 'Gelukt'}</div><div className="stat-v">{good}/{played}</div></div>}
        {bids > 0 && <div className="stat time"><div className="stat-h">Bieden</div><div className="stat-v">{Math.round((bidScore.right / bids) * 100)}%</div></div>}
      </div>
      <button type="button" className="btn big green" onClick={onExit}>Doorgaan</button>
    </div>
  )
}

