# Bridge Leerpad

A Duolingo-style practice app for the Dutch beginner course *Leer bridge met Berry Westra*, deel 1 (4-card majors). It follows the book's chapters and bidding agreements so you can practise between lessons. All explanations and exercises are original text, in Dutch.

## What's in it

- **Leerpad**: 13 units (chapters 1–12, with chapter 5 split into 5a and 5b), 40 lessons. Lessons unlock in order. Each chapter has short explanation cards ("Uitleg").
- **Exercises**: multiple choice, counting points and tricks, a bidding box with the auction, tapping cards, choosing the card to play on a table diagram, and "who wins the trick".
- **New hands every time**: generated exercises are dealt fresh and checked against a rules engine for the deel 1 agreements (`src/bridge/bidding.ts`). Hands without a clear answer under those agreements are skipped.
- **Duolingo mechanics**: XP, a daily goal, a streak, wrong answers repeated at the end of the lesson, a practice tab with endless drills, and a "Fouten herhalen" round that replays your mistakes.
- Works offline as a PWA. Progress is stored only in the browser on that device.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine and content tests
npm run build    # static site in dist/
```

## On your iPhone

Live at **https://bridge.priseko.de** (GitHub Pages). Every push to `main` runs the tests, builds and deploys via `.github/workflows/deploy.yml`. Open the site in Safari and choose **Share → Add to Home Screen**. After that it opens full-screen and works offline.

## Adjusting to your teacher

- Bidding rules: `src/bridge/bidding.ts`. The tests in `bidding.test.ts` use the example hands from the teacher's guide.
- Chapters, explanations and fixed exercises: `src/content/chapters.ts`.
- Generated drills: `src/content/generators.ts`.

Lead rules (`genLead`): the highest card of a sequence that starts with your top card (down to the 10); otherwise, with an honour a low card (H B 10 6 4 → 4 or 6); without an honour a high middle card. Lead exercises accept either of the two fitting cards.
