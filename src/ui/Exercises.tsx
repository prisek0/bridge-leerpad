import { type Card, type Seat, SEAT_NAME, cardLabel, sameCard } from '../bridge/cards'
import { type Bid, bidLabel } from '../bridge/bidding'
import { legalCalls } from '../bridge/auction'
import type { Exercise } from '../content/types'
import { Auction, BidBox, HandFan, HandRows, PlayingCard, Rich, SuitDiagram, TrickView, TwoHands } from './Cards'

export type Answer = number | Bid | Seat | Card | Card[] | null

export function isCorrect(ex: Exercise, a: Answer): boolean {
  switch (ex.kind) {
    case 'mc': case 'number': case 'bid': case 'trick': return a === ex.answer
    case 'pick': return !!a && ex.answer.some((c) => sameCard(c, a as Card))
    case 'tap': {
      const sel = (a as Card[]) ?? []
      return sel.length === ex.correct.length && sel.every((c) => ex.correct.some((d) => sameCard(c, d)))
    }
  }
}

export function correctText(ex: Exercise): string {
  switch (ex.kind) {
    case 'mc': return ex.options[ex.answer]
    case 'number': return String(ex.answer)
    case 'bid': return bidLabel(ex.answer)
    case 'trick': return SEAT_NAME[ex.answer]
    case 'pick': return ex.answer.map(cardLabel).join(' of ')
    case 'tap': return ex.correct.map(cardLabel).join(' ')
  }
}

/** Is er genoeg ingevuld om te controleren? */
export function isAnswered(ex: Exercise, a: Answer): boolean {
  if (ex.kind === 'tap') return Array.isArray(a) && a.length > 0
  return a !== null && a !== undefined && a !== ''
}

interface Props {
  ex: Exercise
  value: Answer
  onChange: (a: Answer) => void
  checked: boolean
}

export function ExerciseView({ ex, value, onChange, checked }: Props) {
  return (
    <div className="exercise">
      <h2 className="prompt"><Rich text={ex.prompt} /></h2>
      {ex.kind === 'mc' && <MC ex={ex} value={value as number | null} onChange={onChange} checked={checked} />}
      {ex.kind === 'number' && <NumberQ ex={ex} value={value as number | null} onChange={onChange} checked={checked} />}
      {ex.kind === 'bid' && <BidQ ex={ex} value={value as Bid | null} onChange={onChange} checked={checked} />}
      {ex.kind === 'trick' && <TrickView trick={ex.trick} picked={value as Seat | null} answer={checked ? ex.answer : null} onPick={checked ? undefined : (s) => onChange(s)} />}
      {ex.kind === 'tap' && <TapQ ex={ex} value={(value as Card[]) ?? []} onChange={onChange} checked={checked} />}
      {ex.kind === 'pick' && <PickQ ex={ex} value={value as Card | null} onChange={onChange} checked={checked} />}
    </div>
  )
}

function Context({ ex }: { ex: Exercise }) {
  if ('hands' in ex && ex.hands) return <TwoHands N={ex.hands.N} S={ex.hands.S} />
  const layout = 'layout' in ex ? ex.layout : undefined
  const hand = 'hand' in ex ? ex.hand : undefined
  return (
    <>
      {(layout || ex.played) && <SuitDiagram layout={layout} played={ex.played} />}
      {hand && <><HandFan hand={hand} />{!ex.played && <HandRows hand={hand} />}</>}
    </>
  )
}

type Sub<K extends Exercise['kind']> = { ex: Extract<Exercise, { kind: K }>; checked: boolean; onChange: (a: Answer) => void }

function MC({ ex, value, onChange, checked }: Sub<'mc'> & { value: number | null }) {
  return (
    <>
      <Context ex={ex} />
      <div className={`options ${ex.options.length === 2 ? 'two' : ''}`}>
        {ex.options.map((o, i) => {
          const cls = ['option', value === i && 'sel', checked && i === ex.answer && 'right', checked && value === i && i !== ex.answer && 'wrong'].filter(Boolean).join(' ')
          return <button key={i} type="button" className={cls} disabled={checked} onClick={() => onChange(i)}><Rich text={o} /></button>
        })}
      </div>
    </>
  )
}

function NumberQ({ ex, value, onChange, checked }: Sub<'number'> & { value: number | null }) {
  const press = (d: number | 'del') => {
    if (checked) return
    const cur = value === null ? '' : String(value)
    // Hooguit 3 cijfers (antwoorden gaan tot 100); een extra cijfer wordt genegeerd in plaats van het getal te veranderen.
    if (d !== 'del' && cur.length >= 3) return
    const next = d === 'del' ? cur.slice(0, -1) : cur + d
    onChange(next === '' ? null : Number(next))
  }
  return (
    <>
      <Context ex={ex} />
      <div className={`numdisplay ${checked ? (value === ex.answer ? 'right' : 'wrong') : ''}`}>{value ?? <span className="muted">…</span>}</div>
      {!checked && (
        <div className="numpad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => <button key={d} type="button" onClick={() => press(d)}>{d}</button>)}
          <button type="button" onClick={() => press('del')} aria-label="Wissen">⌫</button>
        </div>
      )}
    </>
  )
}

function BidQ({ ex, value, onChange, checked }: Sub<'bid'> & { value: Bid | null }) {
  const legal = legalCalls(ex.dealer, ex.calls).filter((b) => b !== 'XX')
  return (
    <>
      <Auction dealer={ex.dealer} calls={ex.calls} last={value ? <Rich text={bidLabel(value)} /> : '?'} />
      <HandFan hand={ex.hand} />
      <HandRows hand={ex.hand} />
      <BidBox legal={legal} value={value} disabled={checked} onPick={(b) => { if (!checked) onChange(b) }} />
    </>
  )
}

function TapQ({ ex, value, onChange, checked }: Sub<'tap'> & { value: Card[] }) {
  const toggle = (c: Card) => {
    if (checked) return
    onChange(value.some((v) => sameCard(v, c)) ? value.filter((v) => !sameCard(v, c)) : [...value, c])
  }
  const marks = checked ? (c: Card) => {
    const should = ex.correct.some((d) => sameCard(d, c))
    const did = value.some((v) => sameCard(v, c))
    if (should && did) return 'right' as const
    if (did) return 'wrong' as const
    if (should) return 'missed' as const
    return undefined
  } : undefined
  return (
    <>
      {ex.played && <SuitDiagram played={ex.played} />}
      <HandFan hand={ex.hand} selected={value} onTap={toggle} marks={marks} />
      <p className="hint">Tik op een kaart om hem te kiezen, nog een keer om hem weer los te laten.</p>
    </>
  )
}

function PickQ({ ex, value, onChange, checked }: Sub<'pick'> & { value: Card | null }) {
  return (
    <>
      {ex.layout && <SuitDiagram layout={ex.layout} played={ex.played} />}
      <div className="pickrow">
        {ex.cards.map((c) => {
          const isAns = ex.answer.some((a) => sameCard(a, c))
          const sel = !!value && sameCard(value, c)
          const state = checked ? (isAns ? 'right' : sel ? 'wrong' : undefined) : undefined
          return <PlayingCard key={c.rank} card={c} selected={sel} state={state} onClick={checked ? undefined : () => onChange(c)} />
        })}
      </div>
    </>
  )
}
