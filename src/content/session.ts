import { shuffle } from '../bridge/cards'
import type { Exercise, Lesson } from './types'

/** Stel een les samen: vaste oefeningen plus verse gegenereerde, door elkaar. */
export function buildSession(lesson: Lesson): Exercise[] {
  const out: Exercise[] = [...(lesson.items ?? [])]
  for (const [gen, n] of lesson.gen ?? []) for (let i = 0; i < n; i++) out.push(gen())
  return shuffle(out)
}
