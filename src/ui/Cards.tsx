import { Fragment, type ReactNode } from 'react'
import {
  type Card, type Hand, type Seat, type Suit, SEAT_NAME, SEAT_SHORT, SUITS, SUIT_SYMBOL,
  cardsIn, fanSort, holdingLabel, isRed, rankLabel, sameCard,
} from '../bridge/cards'
import { type Bid, bidLabel } from '../bridge/bidding'
import type { PlayedCard } from '../bridge/play'
import type { SuitLayout } from '../content/types'

/** Tekst met gekleurde kleursymbolen en **vet**. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|[♠♥♦♣])/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**')) return <strong key={i}><Rich text={p.slice(2, -2)} /></strong>
        if (p === '♥' || p === '♦') return <span key={i} className="red">{p}</span>
        if (p === '♠' || p === '♣') return <span key={i} className="black">{p}</span>
        return <Fragment key={i}>{p}</Fragment>
      })}
    </>
  )
}

export function Sym({ s }: { s: Suit }) {
  return <span className={isRed(s) ? 'red' : 'black'}>{SUIT_SYMBOL[s]}</span>
}

export function PlayingCard({ card, selected, state, onClick, small }: {
  card: Card; selected?: boolean; state?: 'right' | 'wrong' | 'missed'; onClick?: () => void; small?: boolean
}) {
  const cls = ['pcard', isRed(card.suit) ? 'red' : 'black', selected && 'sel', state, onClick && 'tappable', small && 'small'].filter(Boolean).join(' ')
  const label = `${SUIT_SYMBOL[card.suit]}${rankLabel(card.rank)}`
  const body = (
    <>
      <span className="corner">{rankLabel(card.rank)}<br />{SUIT_SYMBOL[card.suit]}</span>
      <span className="pip">{SUIT_SYMBOL[card.suit]}</span>
    </>
  )
  return onClick
    ? <button type="button" className={cls} onClick={onClick} aria-label={label} aria-pressed={selected}>{body}</button>
    : <div className={cls} aria-label={label}>{body}</div>
}

/** Een hand als waaier van kaarten. */
export function HandFan({ hand, selected = [], marks, onTap }: {
  hand: Hand; selected?: Card[]; marks?: (c: Card) => 'right' | 'wrong' | 'missed' | undefined; onTap?: (c: Card) => void
}) {
  const cards = fanSort(hand)
  return (
    <div className="fan" style={{ ['--n' as string]: cards.length }}>
      {cards.map((c) => (
        <PlayingCard key={c.suit + c.rank} card={c} selected={selected.some((s) => sameCard(s, c))}
          state={marks?.(c)} onClick={onTap ? () => onTap(c) : undefined} />
      ))}
    </div>
  )
}

/** Een hand zoals in het boek: één regel per kleur. */
export function HandRows({ hand, title }: { hand: Hand; title?: string }) {
  return (
    <div className="rows">
      {title && <div className="rows-title">{title}</div>}
      {SUITS.map((s) => (
        <div key={s} className="row"><Sym s={s} /> <span>{holdingLabel(cardsIn(hand, s))}</span></div>
      ))}
    </div>
  )
}

/** Beide handen van noord en zuid, voor het speelplan. */
export function TwoHands({ N, S }: { N: Hand; S: Hand }) {
  return (
    <div className="twohands">
      <HandRows hand={N} title="Noord (blinde)" />
      <HandRows hand={S} title="Zuid (jij)" />
    </div>
  )
}

/** Eén kleur verdeeld over de spelers, met eventueel gespeelde kaarten. */
export function SuitDiagram({ layout, played = [] }: { layout?: SuitLayout; played?: PlayedCard[] }) {
  const cell = (seat: Seat) => {
    const v = layout?.[seat]
    const pc = played.find((p) => p.seat === seat)
    return (
      <div className={`dseat d${seat}`}>
        <div className="dname">{SEAT_NAME[seat]}</div>
        {v !== undefined && <div className="dhold">{v === '?' ? <span className="muted">?</span> : <><Sym s={layout!.suit} /> {v}</>}</div>}
        {pc && <div className="dplayed"><PlayingCard card={pc.card} small /></div>}
      </div>
    )
  }
  const used = (s: Seat) => layout?.[s] !== undefined || played.some((p) => p.seat === s)
  if (!used('E') && !used('W')) return <div className="diagram ns">{cell('N')}{cell('S')}</div>
  return (
    <div className="diagram">
      {cell('N')}{cell('W')}<div className="dtable" />{cell('E')}{cell('S')}
    </div>
  )
}

/** Biedverloop in de kolommen W N O Z. */
export function Auction({ dealer, calls, last }: { dealer: Seat; calls: Bid[]; last?: ReactNode }) {
  const order: Seat[] = ['W', 'N', 'E', 'S']
  const start = order.indexOf(dealer)
  const cells: ReactNode[] = Array.from({ length: start }, (_, i) => <div key={`e${i}`} className="acell" />)
  calls.forEach((c, i) => cells.push(<div key={i} className="acell"><Rich text={bidLabel(c)} /></div>))
  cells.push(<div key="q" className="acell ask">{last ?? '?'}</div>)
  return (
    <div className="auction">
      {order.map((s) => <div key={s} className={`ahead ${s === 'S' ? 'you' : ''}`}>{SEAT_SHORT[s]}</div>)}
      {cells}
    </div>
  )
}

/** Een slag op tafel, kaarten op de plek van de speler. */
export function TrickView({ trick, onPick, picked, answer }: {
  trick: PlayedCard[]; onPick?: (s: Seat) => void; picked?: Seat | null; answer?: Seat | null
}) {
  const cell = (seat: Seat) => {
    const pc = trick.find((p) => p.seat === seat)
    const order = trick.findIndex((p) => p.seat === seat) + 1
    const cls = ['tseat', `d${seat}`, picked === seat && 'sel', answer === seat && 'right', answer && picked === seat && picked !== answer && 'wrong'].filter(Boolean).join(' ')
    return (
      <button type="button" className={cls} onClick={onPick ? () => onPick(seat) : undefined} disabled={!onPick}>
        <span className="dname">{SEAT_NAME[seat]} <span className="order">{order}</span></span>
        {pc && <PlayingCard card={pc.card} />}
        {order === 1 && <span className="lead-tag">komt uit</span>}
      </button>
    )
  }
  return <div className="diagram trick">{cell('N')}{cell('W')}<div className="dtable" />{cell('E')}{cell('S')}</div>
}
