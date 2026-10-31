import { useEffect, useRef, useState } from 'react'
import type { Exercise } from '../content/types'
import { finishLesson, recordAnswer, removeMistake, useProgress } from '../state/progress'
import { type Answer, ExerciseView, correctText, isAnswered, isCorrect } from './Exercises'
import { Rich } from './Cards'
import { buzz, confetti, sounds } from './fx'

export interface LessonResult {
  xp: number
  accuracy: number
  seconds: number
  streakUp: boolean
}

interface Props {
  title: string
  exercises: Exercise[]
  lessonId: string | null
  /** Fouten-modus: goed beantwoorde fouten verdwijnen uit de lijst. */
  reviewMode?: boolean
  onClose: () => void
  onDone: (r: LessonResult) => void
}

export function LessonRunner({ title, exercises, lessonId, reviewMode, onClose, onDone }: Props) {
  const progress = useProgress()
  const [queue, setQueue] = useState<Exercise[]>(exercises)
  const [pos, setPos] = useState(0)
  const [value, setValue] = useState<Answer>(null)
  const [checked, setChecked] = useState(false)
  const [right, setRight] = useState(false)
  const [firstTry, setFirstTry] = useState({ right: 0, total: 0 })
  const [combo, setCombo] = useState(0)
  const seen = useRef(new Set<Exercise>())
  const start = useRef(Date.now())
  const total = exercises.length
  const [done, setDone] = useState(0)

  const ex = queue[pos]

  const check = () => {
    if (!ex || !isAnswered(ex, value)) return
    const ok = isCorrect(ex, value)
    setRight(ok)
    setChecked(true)
    recordAnswer(ex, ok)
    if (reviewMode && ok) removeMistake(ex)
    if (!seen.current.has(ex)) {
      seen.current.add(ex)
      setFirstTry((f) => ({ right: f.right + (ok ? 1 : 0), total: f.total + 1 }))
    }
    if (ok) { setDone((d) => d + 1); setCombo((c) => c + 1); if (progress.sound) sounds.right(); buzz(15) }
    else {
      setCombo(0)
      if (progress.sound) sounds.wrong()
      buzz(60)
      // Fout? Dan komt de vraag aan het eind nog een keer.
      setQueue((q) => [...q, ex])
    }
  }

  const next = () => {
    if (pos + 1 >= queue.length) {
      const accuracy = firstTry.total ? firstTry.right / firstTry.total : 1
      const xp = 10 + Math.round(accuracy * 5) + (accuracy === 1 ? 5 : 0)
      const { streakUp } = finishLesson(lessonId, xp)
      if (progress.sound) sounds.done()
      confetti()
      onDone({ xp, accuracy, seconds: Math.round((Date.now() - start.current) / 1000), streakUp })
      return
    }
    setPos(pos + 1)
    setValue(null)
    setChecked(false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      if (checked) next(); else check()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  if (!ex) return null
  const pct = Math.min(100, (done / total) * 100)

  return (
    <div className="lesson">
      <header className="lesson-top">
        <button type="button" className="close" onClick={onClose} aria-label="Stoppen">✕</button>
        <div className="bar" aria-label={`${done} van ${total}`}><div className="fill" style={{ width: `${Math.max(pct, 3)}%` }} /></div>
        {combo >= 3 && <div className="combo" title="Goed op rij">🔥 {combo}</div>}
      </header>
      <div className="lesson-title">{title}</div>
      <main className="lesson-body">
        <ExerciseView key={pos} ex={ex} value={value} onChange={setValue} checked={checked} />
      </main>
      <footer className={`lesson-foot ${checked ? (right ? 'ok' : 'bad') : ''}`}>
        {checked && (
          <div className="feedback">
            <div className="fb-title">{right ? pick(PRAISE) : 'Niet helemaal'}</div>
            {!right && <div className="fb-answer">Juiste antwoord: <strong><Rich text={correctText(ex)} /></strong></div>}
            <div className="fb-explain"><Rich text={ex.explain} /></div>
          </div>
        )}
        {checked
          ? <button type="button" className={`btn big ${right ? 'green' : 'red'}`} onClick={next}>Doorgaan</button>
          : <button type="button" className="btn big green" disabled={!isAnswered(ex, value)} onClick={check}>Controleer</button>}
      </footer>
    </div>
  )
}

const PRAISE = ['Goed zo!', 'Prima!', 'Helemaal goed!', 'Knap!', 'Uitstekend!', 'Netjes!']
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

export function LessonDone({ result, onContinue }: { result: LessonResult; onContinue: () => void }) {
  const m = Math.floor(result.seconds / 60), s = result.seconds % 60
  return (
    <div className="lesson-done">
      <div className="done-hand" aria-hidden="true">
        {(result.accuracy === 1 ? ['A♠', 'A♥', 'A♦', 'A♣'] : ['A♠', 'H♥', 'V♦', 'B♣']).map((c) => (
          <span key={c} className={`dh-card ${c.endsWith('♥') || c.endsWith('♦') ? 'red' : 'black'}`}>
            <span className="mc-rank">{c[0]}</span><span className="mc-suit">{c[1]}</span>
          </span>
        ))}
      </div>
      <h1>Les voltooid!</h1>
      {result.streakUp && <p className="streak-up">🔥 Dagdoel gehaald, je reeks groeit!</p>}
      <div className="done-stats">
        <div className="stat xp"><div className="stat-h">XP</div><div className="stat-v">+{result.xp}</div></div>
        <div className="stat acc"><div className="stat-h">Score</div><div className="stat-v">{Math.round(result.accuracy * 100)}%</div></div>
        <div className="stat time"><div className="stat-h">Tijd</div><div className="stat-v">{m}:{String(s).padStart(2, '0')}</div></div>
      </div>
      <button type="button" className="btn big green" onClick={onContinue}>Doorgaan</button>
    </div>
  )
}
