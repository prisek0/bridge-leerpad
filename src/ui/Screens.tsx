import { useLayoutEffect, useState } from 'react'
import { chapters } from '../content/chapters'
import type { Chapter, Generator, Lesson } from '../content/types'
import * as G from '../content/generators'
import { type Progress, currentStreak, resetProgress, setSetting, todayXp } from '../state/progress'
import { MODES, type Mode, chapterName, learnedChapters } from '../game/modes'
import { Rich } from './Cards'

// ------------------------------------------------------------ bovenbalk

export function TopBar({ p }: { p: Progress }) {
  const streak = currentStreak(p)
  const t = todayXp(p)
  const pct = Math.min(100, (t / p.dailyGoal) * 100)
  return (
    <header className="topbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true"><span className="black">♠</span><span className="red">♥</span></span>Bridge</div>
      <div className={`chip streak ${streak ? 'on' : ''}`} title="Dagen op rij"><span className="chip-ico">🔥</span>{streak}</div>
      <div className="chip goal" title={`Dagdoel: ${t} van ${p.dailyGoal} XP`}>
        <span className="ring" style={{ ['--pct' as string]: `${pct}%` }} />
        {t}/{p.dailyGoal}
      </div>
      <div className="chip xp" title="Totaal XP">{p.xp}<small>XP</small></div>
    </header>
  )
}

// ---------------------------------------------------------------- leerpad

export const allLessons = chapters.flatMap((c) => c.lessons.map((l) => ({ chapter: c, lesson: l })))

/** De eerste les die nog niet af is; alles daarvoor is open. */
export function frontier(p: Progress): number {
  const i = allLessons.findIndex(({ lesson }) => !p.completed[lesson.id])
  return i === -1 ? allLessons.length : i
}

// Elke les is een kaart uit de hand van het hoofdstuk: hoofdstuk bepaalt de kleur, de les de hoogte.
const PATH_SUITS = ['♠', '♥', '♦', '♣']
const PATH_RANKS = ['A', 'H', 'V', 'B', '10', '9', '8', '7']

// Waar je op het leerpad was: de laatst gekozen les of uitleg.
let lastFocus: string | null = null

export function PathScreen({ p, onStart, onTheory }: {
  p: Progress; onStart: (c: Chapter, l: Lesson) => void; onTheory: (c: Chapter) => void
}) {
  const front = frontier(p)
  // Terug op het leerpad: scroll naar waar je was, anders naar de les die aan de beurt is.
  useLayoutEffect(() => {
    const id = lastFocus ?? chapters.flatMap((c) => c.lessons)[front]?.id
    if (id) document.getElementById(`focus-${id}`)?.scrollIntoView({ block: 'center' })
  }, [])
  let idx = 0
  return (
    <div className="path">
      {chapters.map((ch, ci) => {
        const startIdx = idx
        const doneCount = ch.lessons.filter((l) => p.completed[l.id]).length
        const unitDone = doneCount === ch.lessons.length
        const suit = PATH_SUITS[ci % PATH_SUITS.length]
        const red = suit === '♥' || suit === '♦'
        return (
          <section key={ch.id} className={`unit ${unitDone ? 'unit-done' : ''}`}>
            <div className="unit-head" id={`focus-${ch.id}`}>
              <div className="unit-nr" aria-hidden="true">{ch.nr}</div>
              <div className="unit-text">
                <div className="unit-kicker">Hoofdstuk {ch.nr} · {unitDone ? 'klaar ✓' : `${doneCount}/${ch.lessons.length}`}</div>
                <div className="unit-title">{ch.title}</div>
                <div className="unit-sub">{ch.subtitle}</div>
              </div>
              <button type="button" className="unit-book" onClick={() => { lastFocus = ch.id; onTheory(ch) }} aria-label={`Uitleg bij hoofdstuk ${ch.nr}`}>Uitleg</button>
            </div>
            <div className="deal">
              {ch.lessons.map((l, i) => {
                const n = startIdx + i
                idx++
                const isDone = !!p.completed[l.id]
                const isCurrent = n === front
                const locked = n > front
                const times = p.completed[l.id] ?? 0
                const cls = ['lesson-row', isDone && 'played', isCurrent && 'current', locked && 'locked'].filter(Boolean).join(' ')
                return (
                  <button key={l.id} id={`focus-${l.id}`} type="button" className={cls} disabled={locked}
                    onClick={() => { lastFocus = l.id; onStart(ch, l) }} aria-label={`${l.title}${isDone ? ' (voltooid)' : locked ? ' (op slot)' : ''}`}>
                    <span className={`mini-card ${red ? 'red' : 'black'}`} aria-hidden="true">
                      {!locked && <><span className="mc-rank">{PATH_RANKS[i % PATH_RANKS.length]}</span><span className="mc-suit">{suit}</span></>}
                    </span>
                    <span className="lr-text">
                      <span className="lr-title">{l.title}</span>
                      <span className="lr-meta">
                        {isCurrent ? (n === 0 && !p.xp ? 'Begin hier' : 'Speel nu')
                          : isDone ? `Gespeeld${times > 1 ? ` ×${times}` : ''}`
                          : 'Nog dicht'}
                      </span>
                    </span>
                    {isCurrent && <span className="lr-go" aria-hidden="true" />}
                    {isDone && !isCurrent && <span className="lr-check" aria-hidden="true">✓</span>}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
      <p className="path-end">Einde van deel 1. Knap gedaan als je hier bent!</p>
    </div>
  )
}

// ---------------------------------------------------------------- uitleg

export function TheoryScreen({ chapter, onClose, onStart }: { chapter: Chapter; onClose: () => void; onStart?: () => void }) {
  const [i, setI] = useState(0)
  const page = chapter.theory[i]
  const last = i === chapter.theory.length - 1
  return (
    <div className="theory">
      <header className="lesson-top">
        <button type="button" className="close" onClick={onClose} aria-label="Sluiten">✕</button>
        <div className="dots">{chapter.theory.map((_, j) => <span key={j} className={j <= i ? 'on' : ''} />)}</div>
      </header>
      <div className="theory-head">Hoofdstuk {chapter.nr} · {chapter.title}</div>
      <article className="theory-card">
        <h2>{page.title}</h2>
        <Body text={page.body} />
      </article>
      <footer className="theory-foot">
        {i > 0 && <button type="button" className="btn ghost" onClick={() => setI(i - 1)}>Terug</button>}
        {!last && <button type="button" className="btn green" onClick={() => setI(i + 1)}>Volgende</button>}
        {last && (onStart
          ? <button type="button" className="btn green" onClick={onStart}>Start de les</button>
          : <button type="button" className="btn green" onClick={onClose}>Klaar</button>)}
      </footer>
    </div>
  )
}

function Body({ text }: { text: string }) {
  return (
    <>
      {text.split('\n\n').map((block, i) => {
        const lines = block.split('\n')
        if (lines.every((l) => l.startsWith('- '))) return <ul key={i}>{lines.map((l, j) => <li key={j}><Rich text={l.slice(2)} /></li>)}</ul>
        return <p key={i}><Rich text={block} /></p>
      })}
    </>
  )
}

// --------------------------------------------------------------- oefenen

export interface Drill { id: string; title: string; chapter: string; icon: string; gens: Generator[] }

export const drills: Drill[] = [
  { id: 'punten', title: 'Punten tellen', chapter: '4', icon: '🔢', gens: [G.genHcp] },
  { id: 'slag', title: 'Wie wint de slag?', chapter: '1', icon: '🃏', gens: [G.genTrickNT, G.genTrickTrump] },
  { id: 'vast', title: 'Vaste slagen tellen', chapter: '2', icon: '✋', gens: [G.genSureTricks] },
  { id: 'uitkomen', title: 'Uitkomen', chapter: '3', icon: '🎯', gens: [G.genLead] },
  { id: 'sa', title: 'SA-verdeling herkennen', chapter: '5a', icon: '⚖️', gens: [G.genBalanced] },
  { id: 'openen', title: 'Openen', chapter: '5a', icon: '📣', gens: [G.genOpening()] },
  { id: 'antw', title: 'Antwoorden op 1 in een kleur', chapter: '6', icon: '💬', gens: [G.genResponse()] },
  { id: 'antw1sa', title: 'Antwoorden op 1SA', chapter: '7', icon: '🧭', gens: [G.genNTResponse, G.genNTResponse, G.genStaymanAnswer, G.genTransferAccept] },
  { id: 'plan', title: 'Speelplan: slagen tellen', chapter: '8', icon: '🗺️', gens: [G.genPlanCount] },
  { id: 'tussen', title: 'Volgbod of doublet', chapter: '10', icon: '⚔️', gens: [G.genOvercall, G.genOvercall, G.genAdvanceDouble] },
  { id: 'sterk', title: 'De 2-openingen', chapter: '11', icon: '💪', gens: [G.genOpening(['two']), G.gen2CResponse, G.gen2NTResponse] },
]

export function PracticeScreen({ p, onDrill, onMistakes }: { p: Progress; onDrill: (d: Drill) => void; onMistakes: () => void }) {
  return (
    <div className="practice">
      <h1>Oefenen</h1>
      <p className="muted">Elke ronde krijg je nieuwe handen. Ideaal om tussen de lessen door te trainen.</p>
      <button type="button" className="drill mistakes" disabled={!p.mistakes.length} onClick={onMistakes}>
        <span className="drill-icon">🔁</span>
        <span><strong>Fouten herhalen</strong><br /><span className="muted">{p.mistakes.length ? `${p.mistakes.length} oefening${p.mistakes.length === 1 ? '' : 'en'} om nog eens te doen` : 'Nog geen fouten. Goed bezig!'}</span></span>
      </button>
      <div className="drills">
        {drills.map((d) => {
          const s = statFor(p, d)
          return (
            <button key={d.id} type="button" className="drill" onClick={() => onDrill(d)}>
              <span className="drill-icon">{d.icon}</span>
              <span><strong>{d.title}</strong><br /><span className="muted">Hoofdstuk {d.chapter}{s !== null ? ` · ${s}% goed` : ''}</span></span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const DRILL_SKILLS: Record<string, string[]> = {
  punten: ['punten tellen'], slag: ['slag winnen', 'troef'], vast: ['vaste slagen'], uitkomen: ['uitkomen'],
  sa: ['SA-verdeling'], openen: ['openen'], antw: ['antwoorden'], antw1sa: ['1SA antwoorden', 'Stayman', 'Jacoby'],
  plan: ['speelplan'], tussen: ['tussenbieden', 'informatiedoublet'], sterk: ['2♣', '2SA antwoorden'],
}

function statFor(p: Progress, d: Drill): number | null {
  let r = 0, w = 0
  for (const k of DRILL_SKILLS[d.id] ?? []) { r += p.stats[k]?.right ?? 0; w += p.stats[k]?.wrong ?? 0 }
  return r + w ? Math.round((r / (r + w)) * 100) : null
}

// ---------------------------------------------------------------- spelen

export function PlayScreen({ p, onPlay }: { p: Progress; onPlay: (m: Mode) => void }) {
  const learned = learnedChapters(p)
  return (
    <div className="practice">
      <h1>Spelen</h1>
      <p className="muted">Echte spellen aan tafel met drie robots. De coach kijkt mee en helpt met de afspraken die je al gehad hebt.</p>
      <div className="drills">
        {MODES.map((m) => {
          const open = learned.has(m.unlock)
          return (
            <button key={m.id} type="button" className="drill mode" disabled={!open} onClick={() => onPlay(m)}>
              <span className="drill-icon">{m.icon}</span>
              <span><strong>{m.title}</strong><br /><span className="muted">{open ? m.sub : `Open na de eerste les van ${chapterName(m.unlock)}`}</span></span>
            </button>
          )
        })}
      </div>
      <label className="setting"><span>Coach geeft tips tijdens het spel</span><input type="checkbox" checked={p.coach} onChange={(e) => setSetting('coach', e.target.checked)} /></label>
      <label className="setting"><span>Ook stof die ik nog niet gehad heb</span><input type="checkbox" checked={p.playAll} onChange={(e) => setSetting('playAll', e.target.checked)} /></label>
      <p className="muted small">Staat dit uit, dan biedt de coach voor je als een bod uit een hoofdstuk komt dat je nog niet gehad hebt, en geeft hij alleen tips over stof die je kent. Alle spellen zijn niet kwetsbaar.</p>
    </div>
  )
}

// ---------------------------------------------------------------- profiel

export function ProfileScreen({ p }: { p: Progress }) {
  const lessonsDone = allLessons.filter(({ lesson }) => p.completed[lesson.id]).length
  const chaptersDone = chapters.filter((c) => c.lessons.every((l) => p.completed[l.id])).length
  const skills = Object.entries(p.stats).sort((a, b) => (b[1].right + b[1].wrong) - (a[1].right + a[1].wrong))
  return (
    <div className="profile">
      <h1>Jouw voortgang</h1>
      <div className="pstats">
        <div className="pstat"><span>🔥</span><strong>{currentStreak(p)}</strong><small>dagen op rij</small></div>
        <div className="pstat"><span>⚡</span><strong>{p.xp}</strong><small>XP totaal</small></div>
        <div className="pstat"><span>⭐</span><strong>{lessonsDone}/{allLessons.length}</strong><small>lessen</small></div>
        <div className="pstat"><span>📘</span><strong>{chaptersDone}/{chapters.length}</strong><small>hoofdstukken</small></div>
      </div>
      {skills.length > 0 && (
        <>
          <h2>Per onderwerp</h2>
          <div className="skills">
            {skills.map(([k, v]) => {
              const pct = Math.round((v.right / (v.right + v.wrong)) * 100)
              return (
                <div key={k} className="skill">
                  <div className="skill-h"><Rich text={k} /><span className="muted">{pct}% · {v.right + v.wrong}×</span></div>
                  <div className="bar small"><div className="fill" style={{ width: `${pct}%` }} /></div>
                </div>
              )
            })}
          </div>
        </>
      )}
      <h2>Instellingen</h2>
      <label className="setting"><span>Geluid</span><input type="checkbox" checked={p.sound} onChange={(e) => setSetting('sound', e.target.checked)} /></label>
      <label className="setting"><span>Dagdoel</span>
        <select value={p.dailyGoal} onChange={(e) => setSetting('dailyGoal', Number(e.target.value))}>
          <option value={15}>Rustig (15 XP)</option>
          <option value={30}>Normaal (30 XP)</option>
          <option value={50}>Serieus (50 XP)</option>
          <option value={80}>Fanatiek (80 XP)</option>
        </select>
      </label>
      <button type="button" className="btn ghost danger" onClick={() => { if (confirm('Alle voortgang wissen? Dit kan niet ongedaan worden.')) resetProgress() }}>Voortgang wissen</button>
      <p className="muted small">De oefenstof volgt de hoofdstukken en afspraken van <em>Leer bridge met Berry Westra</em>, deel 1. Uitleg en oefeningen zijn eigen tekst. Je voortgang wordt alleen op dit apparaat bewaard.</p>
    </div>
  )
}
