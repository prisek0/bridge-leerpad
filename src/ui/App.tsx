import { useState } from 'react'
import type { Chapter, Exercise, Lesson } from '../content/types'
import { buildSession } from '../content/session'
import { shuffle } from '../bridge/cards'
import { useProgress } from '../state/progress'
import { type LessonResult, LessonDone, LessonRunner } from './LessonRunner'
import { type Drill, ImportCard, PathScreen, PlayScreen, PracticeScreen, ProfileScreen, TheoryScreen, TopBar } from './Screens'
import { Game } from './Game'
import type { Mode } from '../game/modes'
import { type Replay, type Transfer, readTransfer } from '../state/progress'

type Tab = 'pad' | 'spelen' | 'oefenen' | 'profiel'
type Screen =
  | { kind: 'home' }
  | { kind: 'theory'; chapter: Chapter; then?: Lesson }
  | { kind: 'lesson'; title: string; exercises: Exercise[]; lessonId: string | null; review?: boolean }
  | { kind: 'done'; result: LessonResult }
  | { kind: 'game'; mode: Mode; replays?: Replay[] }
  | { kind: 'import'; data: Transfer }

const seenTheory = () => { try { return new Set<string>(JSON.parse(localStorage.getItem('bridge-theory') ?? '[]')) } catch { return new Set<string>() } }
const markTheory = (id: string) => { try { const s = seenTheory(); s.add(id); localStorage.setItem('bridge-theory', JSON.stringify([...s])) } catch { /* negeren */ } }

export default function App() {
  const p = useProgress()
  const [tab, setTab] = useState<Tab>('pad')
  const [screen, setScreen] = useState<Screen>(() => {
    // Geopend via een link met voortgang van een ander apparaat?
    const data = location.hash ? readTransfer(location.hash) : null
    return data ? { kind: 'import', data } : { kind: 'home' }
  })

  const startLesson = (ch: Chapter, l: Lesson) => {
    // Eerste les van een hoofdstuk: eerst de uitleg.
    if (ch.lessons[0].id === l.id && !seenTheory().has(ch.id)) return setScreen({ kind: 'theory', chapter: ch, then: l })
    setScreen({ kind: 'lesson', title: `${ch.nr}. ${l.title}`, exercises: buildSession(l), lessonId: l.id })
  }
  const startDrill = (d: Drill) => {
    const exercises = Array.from({ length: 10 }, (_, i) => d.gens[i % d.gens.length]())
    setScreen({ kind: 'lesson', title: d.title, exercises: shuffle(exercises), lessonId: null })
  }
  const startMistakes = () => setScreen({ kind: 'lesson', title: 'Fouten herhalen', exercises: p.mistakes.slice(0, 10), lessonId: null, review: true })
  const home = () => setScreen({ kind: 'home' })

  if (screen.kind === 'theory') {
    const { chapter, then } = screen
    return <TheoryScreen chapter={chapter} onClose={() => { markTheory(chapter.id); home() }}
      onStart={then ? () => { markTheory(chapter.id); startLesson(chapter, then) } : undefined} />
  }
  if (screen.kind === 'lesson') {
    return <LessonRunner title={screen.title} exercises={screen.exercises} lessonId={screen.lessonId} reviewMode={screen.review}
      onClose={home} onDone={(result) => setScreen({ kind: 'done', result })} />
  }
  if (screen.kind === 'import') {
    return (
      <div className="app"><main className="content profile">
        <h1>Voortgang overnemen</h1>
        <ImportCard data={screen.data} onDone={(taken) => { history.replaceState(null, '', location.pathname); if (taken) setTab('pad'); home() }} />
        <p className="muted small">Gebruik je Bridge als app op je beginscherm? Die heeft op de iPhone een eigen geheugen. Kopieer dan deze link en plak hem in de app bij Profiel → Voortgang overnemen.</p>
      </main></div>
    )
  }
  if (screen.kind === 'done') return <LessonDone result={screen.result} onContinue={home} />
  if (screen.kind === 'game') return <Game key={screen.mode.id + (screen.replays ? '-r' : '')} mode={screen.mode} replays={screen.replays} p={p} onExit={home} />

  return (
    <div className="app">
      <TopBar p={p} />
      <main className="content">
        {tab === 'pad' && <PathScreen p={p} onStart={startLesson} onTheory={(c) => setScreen({ kind: 'theory', chapter: c })} />}
        {tab === 'spelen' && <PlayScreen p={p} onPlay={(mode, replays) => setScreen({ kind: 'game', mode, replays })} />}
        {tab === 'oefenen' && <PracticeScreen p={p} onDrill={startDrill} onMistakes={startMistakes} />}
        {tab === 'profiel' && <ProfileScreen p={p} />}
      </main>
      <nav className="tabs">
        <button type="button" className={tab === 'pad' ? 'on' : ''} onClick={() => setTab('pad')}><span aria-hidden="true">♠</span>Leerpad</button>
        <button type="button" className={tab === 'spelen' ? 'on' : ''} onClick={() => setTab('spelen')}><span aria-hidden="true">♥</span>Spelen</button>
        <button type="button" className={tab === 'oefenen' ? 'on' : ''} onClick={() => setTab('oefenen')}><span aria-hidden="true">♦</span>Oefenen</button>
        <button type="button" className={tab === 'profiel' ? 'on' : ''} onClick={() => setTab('profiel')}><span aria-hidden="true">♣</span>Profiel</button>
      </nav>
    </div>
  )
}
