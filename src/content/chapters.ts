// Het leerpad: de hoofdstukken van "Leer bridge met Berry Westra", deel 1.
// De uitleg en oefeningen zijn eigen tekst; de volgorde en de afspraken
// volgen het boek, zodat je tussen de lessen door kunt oefenen.

import { type Card, type Seat, type Suit, parseHand, parseHolding } from '../bridge/cards'
import { responseToNT, responseToSuit, openingBid, type Bid } from '../bridge/bidding'
import type { Chapter, Exercise, SuitLayout } from './types'
import {
  gen2CResponse, gen2NTResponse, genAdvanceDouble, genBalanced, genBidOrder, genFollowSuit, genHcp, genIsGame,
  genLead, genNTRaise, genNTResponse, genOpening, genOvercall, genPlanCount, genResponse, genStaymanAnswer,
  genSureTricks, genTapHonours, genTransferAccept, genTrickNT, genTrickTrump, genTricksNeeded,
} from './generators'

const h = parseHand

// ------------------------------------------------------- korte schrijfwijzen

function mc(prompt: string, options: string[], answer: number, explain: string, extra: Partial<Exercise> = {}): Exercise {
  return { kind: 'mc', prompt, options, answer, explain, ...extra } as Exercise
}
const yes = (prompt: string, explain: string) => mc(prompt, ['Ja', 'Nee'], 0, explain)
const no = (prompt: string, explain: string) => mc(prompt, ['Ja', 'Nee'], 1, explain)

function num(prompt: string, answer: number, explain: string, extra: Partial<Exercise> = {}): Exercise {
  return { kind: 'number', prompt, answer, explain, ...extra } as Exercise
}

function bid(hand: string, dealer: Seat, calls: Bid[], answer: Bid, prompt: string, explain: string): Exercise {
  return { kind: 'bid', hand: h(hand), dealer, calls, answer, prompt, explain, skill: 'bieden' }
}

/** Kaarten uit één kleur om uit te kiezen; `answer` zijn de goede kaarten. */
function pickQ(prompt: string, suit: Suit, holding: string, answer: string, explain: string, layout?: Omit<SuitLayout, 'suit'>, played?: [Seat, string][]): Exercise {
  const cards: Card[] = parseHolding(holding).map((rank) => ({ suit, rank }))
  return {
    kind: 'pick', prompt, explain, cards, skill: 'afspel',
    answer: parseHolding(answer).map((rank) => ({ suit, rank })),
    layout: layout ? { suit, ...layout } : undefined,
    played: played?.map(([seat, c]) => ({ seat, card: { suit, rank: parseHolding(c)[0] } })),
  }
}

// ----------------------------------------------------------- hoofdstukken

export const chapters: Chapter[] = [
  {
    id: 'h1', nr: '1', title: 'De basisregels', subtitle: 'Kaarten, slagen en troef', color: '#58cc02',
    theory: [
      { title: 'Vier spelers, twee partijen', body: `Bridge speel je met vier spelers. Ze zitten op windrichtingen: **Noord**, **Oost**, **Zuid** en **West**.\n\nNoord en Zuid zijn partners, net als Oost en West. Je speelt dus altijd samen met de speler tegenover je.\n\nEr wordt met 52 kaarten gespeeld. Iedereen krijgt er **13**.` },
      { title: 'De rangorde', body: `Er zijn vier kleuren: ♠ schoppen, ♥ harten, ♦ ruiten en ♣ klaveren.\n\nBinnen een kleur is de volgorde van hoog naar laag: **A** (aas), **H** (heer), **V** (vrouw), **B** (boer), 10, 9, 8 … 2.\n\nA, H, V en B heten de **honneurs**.` },
      { title: 'Een slag', body: `Eén speler komt uit: hij legt een kaart op tafel. De anderen leggen met de klok mee een kaart bij. Die vier kaarten samen vormen een **slag**.\n\n- Je moet **kleur bekennen**: heb je de gevraagde kleur, dan moet je die bijspelen.\n- Heb je de kleur niet, dan mag je elke kaart bijspelen.\n- De **hoogste kaart in de gevraagde kleur** wint de slag.\n- Wie de slag wint, komt uit voor de volgende slag.` },
      { title: 'Troef', body: `Vaak is één kleur **troef**. Een troefkaart is sterker dan elke kaart in een andere kleur.\n\nHeb je de gevraagde kleur niet, dan kun je **troeven**: een troefkaart bijspelen. Liggen er meerdere troeven in de slag, dan wint de hoogste troef.\n\nZonder troef heet het spel **sans atout** (SA).` },
    ],
    lessons: [
      { id: 'h1l1', title: 'De kaarten', items: [
        num('Hoeveel kaarten krijgt iedere speler?', 13, 'Er zijn 52 kaarten en vier spelers: ieder krijgt er 13.'),
        mc('Wie is de partner van Zuid?', ['Noord', 'Oost', 'West'], 0, 'Partners zitten tegenover elkaar: Noord en Zuid, Oost en West.'),
        mc('Welke kaart is hoger?', ['V (vrouw)', 'B (boer)'], 0, 'De volgorde is A, H, V, B, 10 … De vrouw is hoger dan de boer.'),
        mc('Welke kaart is hoger?', ['H (heer)', 'V (vrouw)'], 0, 'De heer (H) staat direct onder de aas en boven de vrouw.'),
        mc('Welke kaart is hoger?', ['10', 'B (boer)'], 1, 'De boer is de laagste honneur, maar wel hoger dan de 10.'),
        mc('Welke kaart is GEEN honneur?', ['A', 'B', '10', 'H'], 2, 'De honneurs zijn A, H, V en B.'),
      ], gen: [[genTapHonours, 3]] },
      { id: 'h1l2', title: 'Kleur bekennen', items: [
        mc('West komt uit. Moet je je ♥8 bijspelen?', ['Ja', 'Nee'], 0, 'Ja: je moet kleur bekennen als je die kleur hebt. Je ♥8 is je enige harten.', { hand: h('A72.8.HV93.B864'), played: [{ seat: 'W', card: { suit: 'H', rank: 5 } }] }),
        no('Er wordt ♠ gevraagd en je hebt geen schoppen. Moet je dan passen?', 'Nee, je mag elke kaart bijspelen. Passen bestaat niet tijdens het spelen.'),
        mc('Wie komt uit voor de volgende slag?', ['De winnaar van de slag', 'De speler links van de uitkomer', 'Altijd Zuid'], 0, 'Wie de slag wint, komt uit voor de volgende slag.'),
      ], gen: [[genFollowSuit, 4], [genTrickNT, 2]] },
      { id: 'h1l3', title: 'Wie wint de slag?', gen: [[genTrickNT, 8]] },
      { id: 'h1l4', title: 'Troef', items: [
        mc('Harten is troef. Er wordt ♠A gespeeld en jij hebt geen schoppen. Wat kun je doen om de slag te winnen?', ['Troeven met een harten', 'Een hoge ruiten bijspelen', 'Niets, de aas wint altijd'], 0, 'Met een troefkaart win je van elke kaart in een andere kleur, ook van een aas.'),
        no('Mag je troeven als je de gevraagde kleur nog hebt?', 'Nee, eerst moet je kleur bekennen. Pas als je de kleur niet hebt, mag je troeven.'),
        mc('Wat betekent "SA"?', ['Spelen zonder troef', 'Schoppen is troef', 'Slag afgeven'], 0, 'SA staat voor sans atout: zonder troef.'),
      ], gen: [[genTrickTrump, 6]] },
    ],
  },

  {
    id: 'h2', nr: '2', title: 'Slagen maken', subtitle: 'Incasseren, ontwikkelen en snijden', color: '#1cb0f6',
    theory: [
      { title: 'Vaste slagen', body: `Een **vaste slag** is een slag die je kunt maken zonder de slag eerst af te geven.\n\nMet A H V tegenover kleine kaarten heb je drie vaste slagen: je speelt ze gewoon na elkaar (**incasseren**).\n\nJe kunt nooit meer vaste slagen maken dan er kaarten in de langste hand zitten. Met A H tegenover V heb je maar twee vaste slagen.` },
      { title: 'Slagen ontwikkelen', body: `Met H V B tegenover kleine kaarten heb je nog geen vaste slag: de aas zit bij de tegenpartij. Speel de kleur toch! Na het afgeven van de aas zijn de andere honneurs vrij: twee slagen.\n\nDit heet **ontwikkelen** of **vrijspelen**.` },
      { title: 'Lengteslagen', body: `Ook kleine kaarten kunnen slagen maken. Met A H 7 5 3 tegenover 6 4 2 hebben de tegenstanders vijf kaarten. Zitten die 3-2 verdeeld, dan hebben ze na drie keer de kleur niets meer. Jouw 7 en 5 zijn dan ook slagen: **lengteslagen**.` },
      { title: 'De korte hand eerst', body: `Speel eerst de honneurs van de **korte hand**. Met H 6 tegenover A V 4 2 speel je eerst de heer, daarna de 6 naar de A V. Zo blokkeer je de kleur niet.` },
      { title: 'Snijden', body: `Met A V tegenover kleine kaarten speel je **naar** de A V toe. Speelt West klein, dan leg je de vrouw. Zit de heer bij West, dan wint je vrouw de slag. Dat heet **snijden**.\n\nDe snit lukt als de ontbrekende honneur **vóór** je honneurs zit.` },
    ],
    lessons: [
      { id: 'h2l1', title: 'Vaste slagen', items: [
        num('Hoeveel vaste slagen heb je in deze kleur?', 3, 'A, H en V zijn de drie hoogste kaarten: drie vaste slagen.', { layout: { suit: 'S', N: 'AHV', S: '432' } }),
        num('Hoeveel vaste slagen heb je in deze kleur?', 2, 'Je hebt A, H en V, maar de langste hand heeft maar twee kaarten. Dus twee vaste slagen.', { layout: { suit: 'H', N: 'AH', S: 'V' } }),
        num('Hoeveel vaste slagen heb je in deze kleur?', 0, 'Zonder de aas kan de tegenpartij de eerste slag altijd winnen: nog geen vaste slagen.', { layout: { suit: 'D', N: 'HVB4', S: '752' } }),
      ], gen: [[genSureTricks, 6]] },
      { id: 'h2l2', title: 'Ontwikkelen', items: [
        num('Hoeveel slagen kun je in deze kleur ontwikkelen?', 3, 'Je geeft de aas af. Daarna zijn H, V en B vrij: drie slagen.', { layout: { suit: 'S', N: 'HVB4', S: '752' } }),
        num('Hoeveel slagen kun je in deze kleur ontwikkelen?', 2, 'Je moet de aas én de heer afgeven. Daarna zijn de 10 en de 9 vrij: twee slagen.', { layout: { suit: 'H', N: 'VB109', S: '432' } }),
        num('De kaarten van de tegenpartij zitten 3-2. Hoeveel slagen maak je in deze kleur?', 5, 'Na A, H en nog een ronde heeft de tegenpartij niets meer. Je 7 en 5 worden lengteslagen: samen vijf.', { layout: { suit: 'C', N: 'AH753', S: '642' } }),
        mc('Waarom speel je eerst een kleur waarin je de aas mist?', ['Om slagen te ontwikkelen zolang je nog controle hebt in de andere kleuren', 'Omdat dat verplicht is', 'Om de tegenpartij te laten troeven'], 0, 'Je geeft de aas het liefst vroeg af, terwijl je in de andere kleuren nog de hoge kaarten hebt.'),
      ], gen: [[genSureTricks, 3]] },
      { id: 'h2l3', title: 'De korte hand en snijden', items: [
        pickQ('Je bent zuid en aan slag. Met welke kaart begin je in deze kleur?', 'S', 'H6', 'H', 'Speel eerst de honneur van de korte hand (zuid heeft maar twee kaarten). Daarna de 6 naar noords A V.', { N: 'AV42', S: 'H6' }),
        pickQ('Je bent zuid en aan slag. Met welke kaart begin je?', 'H', 'V2', 'V', 'Zuid is de korte hand. Eerst de vrouw, daarna de 2 naar A H. Zo maak je drie slagen zonder blokkade.', { N: 'AH3', S: 'V2' }),
        pickQ('Je speelt ♦2 vanuit zuid en west legt ♦5. Welke kaart leg je in de blinde (noord)?', 'D', 'AV', 'V', 'Snijden: leg de vrouw. Zit de heer bij west, dan wint je vrouw de slag.', { N: 'AV', S: '32', W: '?' }, [['S', '2'], ['W', '5']]),
        mc('Je snijdt met A V in noord, gespeeld vanuit zuid. Waar moet de heer zitten om de snit te laten lukken?', ['Bij West', 'Bij Oost'], 0, 'West speelt vóór noord. Zit de heer bij west, dan wint je vrouw.'),
      ], gen: [[genSureTricks, 3]] },
    ],
  },

  {
    id: 'h3', nr: '3', title: 'Het tegenspel', subtitle: 'Uitkomen en samenwerken', color: '#ce82ff',
    theory: [
      { title: 'Samenwerken', body: `Als tegenspelers zie je elkaars kaarten niet. Daarom maak je afspraken, zodat partner uit jouw kaarten kan afleiden wat je hebt.` },
      { title: 'Uitkomen van een serie', body: `Je komt uit in je **beste kleur**. Heb je daarin een **serie** (twee of meer aaneengesloten kaarten, van de aas tot en met de 10), kom dan uit met de **hoogste** van de serie.\n\n- H V 9 → heer\n- V B 3 2 → vrouw\n- B 10 8 4 → boer\n\nStart je met een honneur, dan **beloof je de kaart er direct onder**: de heer belooft de vrouw, de vrouw belooft de boer.\n\nDat geldt ook binnen de kleur: met H B 10 6 4 start je met de boer (die belooft de 10), met A V B 2 met de vrouw.` },
      { title: 'Uitkomen zonder serie', body: `Geen serie? Dan zegt de **hoogte van je kaart** iets tegen partner:

- **Met een honneur** in de kleur kom je uit met een **lage kaart**: V 8 7 3 2 → 2 of 3.
- **Zonder honneur** kom je uit met een **hoge kaart**: 8 7 3 2 → 8 of 7.

Ziet partner een lage kaart, dan weet hij dat je iets moois in de kleur hebt. Een hoge kaart onder de 10 zegt: hier heb ik niets.` },
      { title: 'De derde man doet wat hij kan', body: `Komt partner uit met een kleine kaart en ligt er bij de blinde niets hoogs, speel dan als derde hand **zo hoog als nodig**. Je probeert de slag te winnen, of de leider te dwingen een hoge kaart te gebruiken.` },
    ],
    lessons: [
      { id: 'h3l1', title: 'Uitkomen', items: [
        pickQ('Je komt uit in schoppen. Met welke kaart start je?', 'S', 'HV87', 'H', 'H V is een serie: start met de hoogste, de heer. Die belooft de vrouw.'),
        pickQ('Je komt uit in ruiten. Met welke kaart start je?', 'D', 'VB32', 'V', 'Ook van een korte serie start je met de hoogste: de vrouw.'),
        pickQ('Je komt uit in harten. Met welke kaart start je?', 'H', 'HB1064', 'B', 'B 10 is een serie binnen de kleur. De boer belooft de 10.'),
        pickQ('Je komt uit in klaveren. Met welke kaart start je?', 'C', 'AVB2', 'V', 'V B is een serie. Start met de vrouw, die belooft de boer.'),
        pickQ('Je komt uit in schoppen. Met welke kaart start je?', 'S', 'V8732', '32', 'Geen serie, wel een honneur (de vrouw): kom uit met een lage kaart, de 2 of de 3.'),
        pickQ('Je komt uit in harten. Met welke kaart start je?', 'H', '8732', '87', 'Geen honneur in de kleur: kom uit met een hoge kaart, de 8 of de 7. Zo weet partner dat je hier niets hebt.'),
        mc('Partner (noord) komt uit. Wat weet je?', ['Partner heeft een honneur in de kleur', 'Partner heeft geen honneur in de kleur', 'Partner heeft maar één kaart'], 0, 'Met een honneur zonder serie kom je uit met een lage kaart.', { played: [{ seat: 'N', card: { suit: 'S', rank: 2 } }] }),
        mc('Partner (noord) komt uit. Je ziet de 10 nergens. Wat weet je?', ['Partner heeft geen honneur in de kleur', 'Partner heeft een serie', 'Partner heeft de aas'], 0, 'Een hoge kaart onder de 10 zegt: geen honneur in deze kleur.', { played: [{ seat: 'N', card: { suit: 'D', rank: 9 } }] }),
        mc('Partner start met de heer. Wat weet je nu?', ['Partner heeft ook de vrouw', 'Partner heeft de aas', 'Partner heeft geen andere honneurs'], 0, 'Een honneur belooft de kaart direct eronder: de heer belooft de vrouw.'),
      ], gen: [[genLead, 4]] },
      { id: 'h3l2', title: 'Derde hand', items: [
        pickQ('Partner (west) start met ♠2. De blinde legt ♠4. Welke kaart speel jij (oost)?', 'S', 'H103', 'H', 'De derde man doet wat hij kan: speel de heer. Zo win je de slag of dwing je de aas eruit.', { N: '864', E: 'H103', W: '?' }, [['W', '2'], ['N', '4']]),
        pickQ('Partner (west) start met ♥3. De blinde legt ♥6. Welke kaart speel jij (oost)?', 'H', 'V94', 'V', 'Derde hand hoog: speel de vrouw. Met de 9 geef je de leider een goedkope slag.', { N: '762', E: 'V94', W: '?' }, [['W', '3'], ['N', '6']]),
        pickQ('Partner (west) start met de ♦H. De blinde legt ♦4. Welke kaart speel jij?', 'D', '852', '852', 'Partner heeft de heer gestart en belooft de vrouw: die slag is voor jullie. Geen reden om hoog te spelen: leg een kleintje.', { N: '764', E: '852', W: '?' }, [['W', 'H'], ['N', '4']]),
      ], gen: [[genLead, 3]] },
    ],
  },

  {
    id: 'h4', nr: '4', title: 'Het bieden', subtitle: 'Punten, contract en manche', color: '#ff9600',
    theory: [
      { title: 'Punten tellen', body: `Om je hand te beoordelen tel je **punten**:\n\n- Aas = 4\n- Heer = 3\n- Vrouw = 2\n- Boer = 1\n\nIn het hele spel zitten 40 punten. Gemiddeld heeft iedere speler er dus 10.` },
      { title: 'De biedladder', body: `Een bod is een **niveau** (1 t/m 7) plus een **speelsoort**. De volgorde van laag naar hoog is ♣ ♦ ♥ ♠ SA.\n\nIeder volgend bod moet hoger zijn dan het vorige. Je mag ook **passen**. Na drie keer pas achter elkaar is de bieding klaar.\n\nHet niveau plus zes is het aantal slagen dat je moet halen: in 2♥ moet je 8 slagen maken.` },
      { title: 'Manche', body: `Sommige contracten leveren een grote premie op: de **manche**.\n\n- 3SA (9 slagen)\n- 4♥ of 4♠ (10 slagen)\n- 5♣ of 5♦ (11 slagen)\n\nMet **25 punten** samen heb je een goede kans op een manche. Lagere contracten heten een **deelscore**.` },
      { title: 'Leider en blinde', body: `De speler die de speelsoort van het contract **als eerste** noemde, wordt de **leider**. Zijn partner is de **blinde**: die legt zijn kaarten open op tafel.\n\nDe speler **links** van de leider komt uit.` },
      { title: 'De telling', body: `Per gehaalde slag boven de zes krijg je:\n\n- ♣ en ♦: 20 punten\n- ♥ en ♠: 30 punten\n- SA: 40 voor de eerste, daarna 30\n\nKom je samen op 100 of meer, dan is het een manche. Haal je je contract niet, dan ben je **down** en krijgt de tegenpartij punten.` },
    ],
    lessons: [
      { id: 'h4l1', title: 'Punten tellen', items: [
        num('Hoeveel punten zitten er in het hele spel?', 40, 'Per kleur A+H+V+B = 4+3+2+1 = 10, keer vier kleuren = 40.'),
        num('Hoeveel punten heeft deze hand?', 13, 'A = 4, H = 3, V = 2, B = 1: ♠ 7, ♥ 2, ♦ 1, ♣ 3.', { hand: h('AH42.V93.B7.H852') }),
      ], gen: [[genHcp, 6]] },
      { id: 'h4l2', title: 'De biedladder', items: [
        num('Hoeveel slagen moet je halen in 4♠?', 10, 'Niveau + 6 = 4 + 6 = 10.'),
        mc('Partner biedt 1♠. Wat is het laagste bod in harten dat jij nog kunt doen?', ['1♥', '2♥', '3♥'], 1, 'Harten is lager dan schoppen, dus je moet naar het tweeniveau: 2♥.'),
        mc('Wanneer is de bieding afgelopen?', ['Na drie keer pas achter elkaar (na een bod)', 'Na één keer pas', 'Na vier biedingen'], 0, 'Na een bod gevolgd door drie passen is de bieding klaar.'),
      ], gen: [[genBidOrder, 3], [genTricksNeeded, 3]] },
      { id: 'h4l3', title: 'Manche en telling', items: [
        num('Hoeveel punten samen heb je ongeveer nodig voor een manche?', 25, 'Met 25 punten samen is een manche meestal kansrijk.'),
        num('Hoeveel punten levert 2♥ (precies gemaakt) op, zonder premies?', 60, 'Twee slagen boven de zes in harten: 2 × 30 = 60.'),
        num('Hoeveel punten levert 3SA (precies gemaakt) op, zonder premies?', 100, '40 + 30 + 30 = 100: genoeg voor de manche.'),
        mc('Noord opent 1♥, zuid biedt 4♥ en iedereen past. Wie is de leider?', ['Noord', 'Zuid', 'Oost', 'West'], 0, 'Noord noemde harten als eerste, dus noord is de leider.'),
        mc('Noord is leider. Wie komt uit?', ['Oost', 'West', 'Zuid'], 0, 'De speler links van de leider komt uit. Links van noord zit oost.'),
      ], gen: [[genIsGame, 4]] },
    ],
  },

  {
    id: 'h5a', nr: '5a', title: 'De opening', subtitle: 'Wanneer en hoe je opent', color: '#ff4b4b',
    theory: [
      { title: 'Het doel van het bieden', body: `Met het bieden wil je twee dingen ontdekken:\n\n- Is er een **fit**: een kleur waarin je samen minstens acht kaarten hebt?\n- Zit er een **manche** in: hebben jullie samen 25 punten of meer?` },
      { title: 'De afspraken voor het openen', body: `- Open vanaf **13 punten**.\n- Open in je **langste kleur**.\n- Van twee vierkaarten open je de **laagste**.\n- Van twee vijfkaarten open je de **hoogste**.\n- Met **15-17 punten** en een **SA-verdeling** open je **1SA**.` },
      { title: 'SA-verdeling', body: `Een hand met een SA-verdeling heeft geen renonce (kleur zonder kaarten), geen singleton (één kaart) en hoogstens één doubleton (twee kaarten). De verdelingen zijn:\n\n- 4-3-3-3\n- 4-4-3-2\n- 5-3-3-2` },
    ],
    lessons: [
      { id: 'h5al1', title: 'Openen of passen?', items: [
        bid('64.HV82.B9765.AB', 'S', [], 'P', 'Jij bent gever. Wat bied je?', 'Je hebt 11 punten. Openen doe je vanaf 13 punten: pas.'),
        bid('H4.HV82.B9765.AB', 'S', [], '1D', 'Jij bent gever. Wat bied je?', '14 punten: je opent. Je langste kleur is ruiten: 1♦.'),
      ], gen: [[genHcp, 2], [genOpening(['pass', 'one']), 5]] },
      { id: 'h5al2', title: 'Welke kleur?', items: [
        bid('AH42.HV93.B72.82', 'S', [], '1H', 'Jij bent gever. Wat bied je?', 'Twee vierkaarten (♠ en ♥): open de laagste, 1♥.'),
        bid('AH942.HV932.7.A8', 'S', [], '1S', 'Jij bent gever. Wat bied je?', 'Twee vijfkaarten: open de hoogste, 1♠.'),
        bid('A42.H93.AB72.V82', 'S', [], '1D', 'Jij bent gever. Wat bied je?', '14 punten en je langste kleur is ruiten (vierkaart): 1♦. Geen 1SA, want daarvoor heb je 15-17 nodig.'),
      ], gen: [[genOpening(['one']), 5]] },
      { id: 'h5al3', title: 'De 1SA-opening', items: [
        bid('AH4.HV9.B72.A852', 'S', [], '1NT', 'Jij bent gever. Wat bied je?', '16 punten en een SA-verdeling (3-3-3-4): 1SA.'),
      ], gen: [[genBalanced, 4], [genOpening(['nt', 'one', 'nt']), 5]] },
    ],
  },

  {
    id: 'h5b', nr: '5b', title: 'Dialoog of monoloog', subtitle: 'Wie bepaalt het contract?', color: '#2b70c9',
    theory: [
      { title: 'Na 1 in een kleur: een dialoog', body: `Opent partner met 1 in een kleur, dan weet je nog weinig: partner kan 13 tot 19 punten hebben, en de verdeling ligt nog open. Jullie moeten samen verder praten: een **dialoog**.\n\nDaarom antwoord je al **vanaf 6 punten**. Partner kan immers 19 punten hebben, en 19 + 6 = 25: manche!` },
      { title: 'Na 1SA: een monoloog', body: `Opent partner 1SA, dan weet je bijna alles: 15-17 punten en een SA-verdeling. Jij kunt nu uitrekenen wat jullie samen hebben en jij **bepaalt het contract**: een **monoloog**.\n\nNa 1SA mag je dus ook passen met een zwakke hand. Met 10+ punten weet je dat er minstens 25 punten zijn.` },
    ],
    lessons: [
      { id: 'h5bl1', title: 'Wat weet je van partner?', items: [
        mc('Partner opent 1♥. Hoeveel punten heeft partner?', ['13-19', '15-17', '6-9', '20-22'], 0, 'Met 1 in een kleur heeft partner 13 tot 19 punten. Met meer open je op tweeniveau.'),
        mc('Partner opent 1SA. Hoeveel punten heeft partner?', ['15-17', '13-19', '12-14', '20-22'], 0, 'Een 1SA-opening belooft 15-17 punten en een SA-verdeling.'),
        mc('Partner opent 1SA. Wie bepaalt het contract?', ['Jij, de antwoorder', 'De openaar', 'Jullie samen, in een lange dialoog'], 0, 'Na 1SA weet jij genoeg: jij bent de baas van de bieding.'),
        num('Vanaf hoeveel punten antwoord je op een opening van 1 in een kleur?', 6, 'Partner kan 19 hebben. 19 + 6 = 25: genoeg voor een manche. Daarom antwoord je vanaf 6 punten.'),
        num('Partner opent 1SA (15-17). Jij hebt 11 punten. Hoeveel punten hebben jullie samen minimaal?', 26, '15 + 11 = 26: genoeg voor een manche.'),
        no('Partner opent 1♦, jij hebt 7 punten. Mag je passen?', 'Nee: met 6 of meer punten antwoord je op 1 in een kleur. Partner kan sterk genoeg zijn voor een manche.'),
        yes('Partner opent 1SA, jij hebt 5 punten. Mag je passen?', 'Ja. Partner heeft hoogstens 17, samen kom je nooit aan 25.'),
      ] },
      { id: 'h5bl2', title: 'Na 1SA: tel het uit', items: [
        bid('HV8.B43.V82.H543', 'N', ['1NT', 'P'], '3NT', 'Partner opent 1SA. Wat bied je?', '11 punten + 15-17 = minstens 26. Geen vierkaart hoog: 3SA.'),
        bid('V87.B43.982.H543', 'N', ['1NT', 'P'], 'P', 'Partner opent 1SA. Wat bied je?', 'Met 6 punten kom je samen hoogstens op 23. Pas.'),
      ], gen: [[genNTRaise, 5]] },
    ],
  },

  {
    id: 'h6', nr: '6', title: 'Antwoorden op 1 in een kleur', subtitle: 'Steunen, zoekbod en 1SA', color: '#58cc02',
    theory: [
      { title: 'Met fit in een hoge kleur', body: `Opent partner 1♥ of 1♠ en heb jij een **vierkaart** in die kleur, dan heb je een fit. Steun direct:\n\n- 6-9 punten: steun één hoger (1♠ – 2♠)\n- 10-11 punten: spring één (1♠ – 3♠), een uitnodiging\n- 12+ punten: direct de manche (1♠ – 4♠)` },
      { title: 'Met fit in een lage kleur', body: `Met steun voor een **lage kleur** (♣ of ♦) steun je niet meteen. Kijk eerst of je een vierkaart **hoog** kunt bieden op éénniveau: een fit in ♥ of ♠ is meer waard.\n\nHeb je die niet, dan steun je wel: 2♦ met 6-9, 3♦ met 10-11.` },
      { title: 'Zonder fit: een nieuwe kleur', body: `Een nieuwe kleur is een **zoekbod**: je zoekt een fit. Het kan met 6 punten, maar ook met veel meer. Partner mag er daarom **niet op passen**.\n\n- Op éénniveau: vanaf 6 punten\n- Op tweeniveau: vanaf **10 punten**\n- Bied zo goedkoop mogelijk\n- Dezelfde regels als bij openen: langste kleur eerst, van vierkaarten de laagste, van vijfkaarten de hoogste` },
      { title: 'Het 1SA-antwoord', body: `Heb je **6-9 punten**, geen steun en geen vierkaart die je op éénniveau kunt bieden? Antwoord dan **1SA**. Dit bod is naar boven begrensd: hoogstens 9 punten.` },
    ],
    lessons: [
      { id: 'h6l1', title: 'Steunen', items: [
        bid('A982.83.V652.982', 'N', ['1S', 'P'], '2S', 'Partner opent 1♠. Wat antwoord je?', 'Vierkaart steun en 6 punten: 2♠.'),
        bid('A982.83.AV65.982', 'N', ['1S', 'P'], '3S', 'Partner opent 1♠. Wat antwoord je?', 'Vierkaart steun en 10 punten: 3♠, een uitnodiging voor 4♠.'),
        bid('A982.H3.AV65.982', 'N', ['1S', 'P'], '4S', 'Partner opent 1♠. Wat antwoord je?', 'Vierkaart steun en 13 punten: samen minstens 25. Direct 4♠.'),
      ], gen: [[genResponse(['H', 'S']), 6]] },
      { id: 'h6l2', title: 'Lage kleuren', items: [
        bid('A982.83.AV65.982', 'N', ['1D', 'P'], '1S', 'Partner opent 1♦. Wat antwoord je?', 'Met steun in een lage kleur kijk je eerst naar een vierkaart hoog: 1♠.'),
        bid('982.83.V652.A982', 'N', ['1D', 'P'], '2D', 'Partner opent 1♦. Wat antwoord je?', 'Geen vierkaart hoog, wel steun: 2♦ met 6 punten.'),
        bid('982.83.AV65.A982', 'N', ['1D', 'P'], '3D', 'Partner opent 1♦. Wat antwoord je?', 'Geen vierkaart hoog, steun en 10 punten: 3♦.'),
      ], gen: [[genResponse(['C', 'D']), 6]] },
      { id: 'h6l3', title: 'Nieuwe kleur en 1SA', items: [
        bid('8.HB765.AHV3.872', 'N', ['1C', 'P'], '1H', 'Partner opent 1♣. Wat antwoord je?', 'Langste kleur eerst: 1♥. Dat kan met 6 punten, maar ook met 13; partner mag niet passen.'),
        bid('HV76.9843.B107.86', 'N', ['1D', 'P'], '1H', 'Partner opent 1♦. Wat antwoord je?', 'Twee vierkaarten: de laagste eerst, 1♥.'),
        bid('V82.83.HB742.V92', 'N', ['1H', 'P'], '1NT', 'Partner opent 1♥. Wat antwoord je?', 'Te weinig voor 2♦ (daar heb je 10 punten voor nodig) en geen vierkaart die je op éénniveau kunt bieden: 1SA.'),
      ], gen: [[genResponse(), 6]] },
      { id: 'h6l4', title: 'Alles door elkaar', gen: [[genResponse(), 10]] },
    ],
  },

  {
    id: 'h7', nr: '7', title: 'Antwoorden op 1SA', subtitle: 'Stayman en Jacoby', color: '#1cb0f6',
    theory: [
      { title: 'Jij bent de baas', body: `Na 1SA weet je bijna alles van partner. Wil je SA spelen, dan heb je drie keuzes:\n\n- 0-7 punten: **pas**\n- 8-9 punten: **2SA**, een uitnodiging (een **limietbod**)\n- 10-15 punten: **3SA**` },
      { title: 'Stayman (2♣)', body: `Met acht kaarten samen in een hoge kleur speel je liever 4♥/4♠ dan 3SA. Met **2♣** vraag je of partner een vierkaart hoog heeft. Partner antwoordt:\n\n- **2♦**: geen vierkaart hoog\n- **2♥**: vierkaart harten (met twee vierkaarten ook 2♥)\n- **2♠**: vierkaart schoppen\n\nGebruik Stayman met **8+ punten** en **een of twee vierkaarten hoog**.` },
      { title: 'Jacoby (transfers)', body: `Met een **vijfkaart** (of langer) in een hoge kleur bied je de kleur **eronder**:\n\n- **2♦** vraagt partner 2♥ te bieden\n- **2♥** vraagt partner 2♠ te bieden\n\nPartner voert dat altijd uit. Dit kan met **elk aantal punten**, ook met 0. Met een zwakke hand pas je daarna: je speelt in je lange kleur in plaats van in 1SA.` },
    ],
    lessons: [
      { id: 'h7l1', title: 'SA-antwoorden', items: [
        bid('HV8.B43.982.H543', 'N', ['1NT', 'P'], '2NT', 'Partner opent 1SA. Wat bied je?', '9 punten: samen 24-26. 2SA nodigt partner uit voor 3SA als hij geen minimum heeft.'),
      ], gen: [[genNTResponse, 6]] },
      { id: 'h7l2', title: 'Stayman', items: [
        bid('HV87.B43.V82.H43', 'N', ['1NT', 'P'], '2C', 'Partner opent 1SA. Wat bied je?', 'Een vierkaart schoppen en 9 punten: vraag met 2♣ (Stayman) naar een vierkaart hoog.'),
        mc('Je vroeg Stayman en partner antwoordt 2♦. Wat betekent dat?', ['Partner heeft geen vierkaart hoog', 'Partner heeft een vierkaart ruiten', 'Partner wil ruiten spelen'], 0, '2♦ is het afgesproken antwoord zonder vierkaart hoog.'),
        mc('Partner opende 1SA en heeft ♥ en ♠ allebei vier kaarten. Wat antwoordt partner op 2♣?', ['2♥', '2♠', '2♦'], 0, 'Van twee vierkaarten de laagste: 2♥.'),
      ], gen: [[genStaymanAnswer, 4], [genNTResponse, 3]] },
      { id: 'h7l3', title: 'Jacoby', items: [
        bid('765.B98643.765.6', 'N', ['1NT', 'P'], '2D', 'Partner opent 1SA. Wat bied je?', 'Zeskaart harten en maar 1 punt. In SA is je hand waardeloos, in harten maak je troefslagen. Bied 2♦ (transfer) en pas daarna op 2♥.'),
        mc('Je hebt met 2♦ een transfer gedaan en partner biedt 2♥. Je hebt 3 punten. Wat nu?', ['Pas', '2SA', '3♥'], 0, 'Met een zwakke hand pas je: 2♥ is het eindcontract.'),
      ], gen: [[genTransferAccept, 3], [genNTResponse, 4]] },
      { id: 'h7l4', title: 'Alles door elkaar', gen: [[genNTResponse, 8], [genStaymanAnswer, 2]] },
    ],
  },

  {
    id: 'h8', nr: '8', title: 'Het speelplan', subtitle: 'Eerst denken, dan spelen', color: '#ce82ff',
    theory: [
      { title: 'Vier stappen', body: `Voordat je als leider de eerste kaart uit de blinde speelt, maak je een plan:\n\n- **1.** Tel je **vaste slagen**.\n- **2.** Reken uit hoeveel slagen je **tekortkomt**.\n- **3.** Bedenk **hoe** je die extra slagen ontwikkelt (vrijspelen, lengteslagen, snijden).\n- **4.** **Voer** het plan uit (denk aan: de korte hand eerst).` },
      { title: 'Een kleur kiezen', body: `Ontwikkel de kleur die de meeste extra slagen oplevert. Een kleur als H V B 10 levert na het afgeven van de aas drie slagen op. Speel die kleur vroeg, zolang je in de andere kleuren nog controle hebt.` },
    ],
    lessons: [
      { id: 'h8l1', title: 'Tellen', items: [
        mc('Wat is de eerste stap van het speelplan?', ['Tel je vaste slagen', 'Speel je azen', 'Trek de troeven'], 0, 'Eerst tellen: hoeveel slagen heb je al zeker?'),
        num('Je speelt 3SA en telt 6 vaste slagen. Hoeveel slagen kom je tekort?', 3, 'In 3SA heb je 9 slagen nodig: 9 - 6 = 3.'),
        num('Je speelt 1SA en telt 4 vaste slagen. Hoeveel slagen kom je tekort?', 3, 'In 1SA heb je 7 slagen nodig: 7 - 4 = 3.'),
      ], gen: [[genSureTricks, 3], [genPlanCount, 3]] },
      { id: 'h8l2', title: 'Ontwikkelen', items: [
        mc('Je speelt 3SA en komt drie slagen tekort. Welke kleur ontwikkel je?', ['♠ H V B 10 tegenover 5 4 3', '♦ A 5 tegenover 4 3', '♣ 7 6 tegenover 5 4'], 0, 'H V B 10 levert na het afgeven van de aas drie slagen op.'),
        mc('Waarom speel je de ontwikkelkleur vroeg in het spel?', ['Je hebt dan nog controle (azen) in de andere kleuren', 'Omdat het moet', 'Zodat de tegenpartij hun kleur kan vrijspelen'], 0, 'Zolang je in de andere kleuren de hoogste kaarten hebt, kan de tegenpartij weinig doen als ze de aas winnen.'),
      ], gen: [[genPlanCount, 4]] },
    ],
  },

  {
    id: 'h9', nr: '9', title: 'Tips voor af- en tegenspel', subtitle: 'Vuistregels die werken', color: '#ff9600',
    theory: [
      { title: 'Tweede hand laag', body: `Speelt de leider een kleine kaart en jij zit als tweede, speel dan meestal **laag**. Je partner zit nog achter de leider. "Azen zijn er om heren te vangen": bewaar je aas voor een honneur van de tegenpartij.` },
      { title: 'Derde hand hoog', body: `Als partner uitkomt met een kleine kaart, speel jij als derde hand zo hoog als nodig: **de derde man doet wat hij kan**.` },
      { title: 'Honneur op honneur', body: `Speelt de leider een **honneur** voor, leg er dan een honneur op (**dekken**). Zo moet de leider twee honneurs gebruiken om één slag te winnen, en kan een lagere kaart van jullie promoveren.\n\nKun je zien dat er bij jullie niets kan promoveren, dan heeft dekken geen zin.` },
      { title: 'Als leider: troeven trekken', body: `In een troefcontract speel je meestal eerst de troeven van de tegenpartij weg (**troef trekken**). Dan kunnen ze je hoge kaarten niet meer introeven.` },
    ],
    lessons: [
      { id: 'h9l1', title: 'Tweede en derde hand', items: [
        pickQ('De blinde (noord) speelt ♦3. Je bent oost. Welke kaart speel jij?', 'D', 'A852', '852', 'Tweede hand laag. Bewaar je aas voor de heer of vrouw van de leider.', { N: '963', E: 'A852', S: '?' }, [['N', '3']]),
        pickQ('Zuid speelt ♠4 naar de blinde (noord: ♠H72). Je bent west. Welke kaart speel jij?', 'S', 'A95', '95', 'Tweede hand laag: leg je aas niet. Speelt zuid de heer, dan heb je je aas nog voor later. Zo verdient de leider minder slagen.', { N: 'H72', W: 'A95', S: '?' }, [['S', '4']]),
        pickQ('Partner (west) komt uit met ♣5. De blinde legt ♣2. Welke kaart speel jij (oost)?', 'C', 'H96', 'H', 'Derde hand hoog: de heer.', { N: '842', E: 'H96', W: '?' }, [['W', '5'], ['N', '2']]),
        pickQ('Zuid speelt ♥2 naar de blinde (noord: ♥V84). Je bent west. Welke kaart speel jij?', 'H', 'H73', '73', 'Tweede hand laag. Leg je de heer, dan wordt noords vrouw vrij. Bewaar je heer voor de vrouw.', { N: 'V84', W: 'H73', S: '?' }, [['S', '2']]),
        mc('Wat bedoelen we met "tweede hand laag"?', ['Zit je direct na de speler die een kleine kaart voorspeelt, speel dan meestal laag', 'Speel altijd je laagste kaart', 'Partner moet laag spelen'], 0, 'Als tweede speler hoef je de slag meestal niet te winnen: je partner zit nog achter de leider.'),
      ] },
      { id: 'h9l2', title: 'Honneur op honneur', items: [
        pickQ('De blinde (noord) speelt de ♥V. Je bent oost. Welke kaart speel jij?', 'H', 'H62', 'H', 'Honneur op honneur: dek de vrouw met je heer. Dan moet de leider zijn aas gebruiken en kan een kaart van partner promoveren.', { N: 'V73', E: 'H62', S: '?' }, [['N', 'V']]),
        pickQ('De blinde (noord) speelt de ♠V. Je bent oost. Welke kaart speel jij?', 'S', 'H52', '52', 'Noord heeft ook nog B, 10 en 9: na je heer zijn die allemaal vrij. Er kan bij jullie niets promoveren, dus dekken heeft geen zin.', { N: 'VB109', E: 'H52', S: '?' }, [['N', 'V']]),
        pickQ('Zuid speelt de ♣B voor. De blinde (noord) heeft ♣A94. Je bent west. Welke kaart speel jij?', 'C', 'V63', 'V', 'Honneur op honneur: dek de boer met je vrouw. Noord moet dan de aas gebruiken, en partners 10 kan een slag worden.', { N: 'A94', W: 'V63', S: '?' }, [['S', 'B']]),
        mc('Waarom dek je een honneur met een honneur?', ['Zodat een lagere kaart van jullie kan promoveren', 'Omdat je dan altijd de slag wint', 'Omdat het een spelregel is'], 0, 'De leider moet twee honneurs gebruiken voor één slag. Daardoor kan een lagere kaart van jou of partner een slag worden.'),
        mc('Je bent leider in 4♥ en hebt alle hoge troeven. Wat doe je meestal eerst?', ['Troef trekken', 'Je azen in de bijkleuren incasseren', 'Een kleine kaart afgeven'], 0, 'Eerst troef trekken, dan kan de tegenpartij je hoge kaarten niet meer introeven.'),
      ] },
    ],
  },

  {
    id: 'h10', nr: '10', title: 'Tussenbieden', subtitle: 'Volgbod en informatiedoublet', color: '#ff4b4b',
    theory: [
      { title: 'Het volgbod', body: `Heeft de tegenpartij geopend, dan kun je nog meebieden met een **volgbod**. Een volgbod draait vooral om een **goede lange kleur**: minstens een **vijfkaart** met honneurs. Het aantal punten is minder belangrijk.\n\nHoe hoger je moet bieden, hoe beter je kleur moet zijn.` },
      { title: 'Het sprongvolgbod', body: `Spring je één niveau hoger dan nodig, bijvoorbeeld (1♣) – 2♠, dan laat je een **goede zeskaart met openingskracht** zien.` },
      { title: 'Het 1SA-volgbod', body: `Een 1SA-volgbod lijkt op een 1SA-opening: een sterke hand met een SA-verdeling.` },
      { title: 'Het informatiedoublet', body: `Een doublet direct na de opening van de tegenpartij is een **informatiedoublet**. Je zegt: "Partner, kies jij maar een kleur."\n\n- Openingskracht (minstens 13 punten)\n- **Steun voor alle kleuren** die nog niet geboden zijn (kort in de openingskleur)\n\nPartner **mag niet passen**: hij biedt zijn langste kleur, ook met 0 punten.` },
    ],
    lessons: [
      { id: 'h10l1', title: 'Volgbod', items: [
        mc('Waar draait een volgbod vooral om?', ['Een goede lange kleur', 'Minstens 13 punten', 'Een SA-verdeling'], 0, 'Een volgbod doe je op een goede vijfkaart of langer. Punten zijn minder belangrijk.'),
        bid('AHB87.84.V93.852', 'E', ['1C'], '1S', 'Oost opent 1♣. Wat doe jij?', 'Een goede vijfkaart schoppen: volg met 1♠.'),
        bid('98762.84.V93.H52', 'E', ['1C'], 'P', 'Oost opent 1♣. Wat doe jij?', 'De schoppenkleur is te slap voor een volgbod. Pas.'),
      ], gen: [[genOvercall, 5]] },
      { id: 'h10l2', title: 'Informatiedoublet', items: [
        bid('HV87.AB7.H8.AV64', 'E', ['1D'], 'X', 'Oost opent 1♦. Wat doe jij?', 'Openingskracht, kort in ruiten en steun voor ♠, ♥ en ♣: informatiedoublet.'),
        no('Partner geeft een informatiedoublet en jij hebt 2 punten. Mag je passen?', 'Nee! Op een informatiedoublet bied je je langste kleur, ook met weinig punten.'),
      ], gen: [[genAdvanceDouble, 4], [genOvercall, 3]] },
      { id: 'h10l3', title: 'Alles door elkaar', gen: [[genOvercall, 6], [genAdvanceDouble, 3]] },
    ],
  },

  {
    id: 'h11', nr: '11', title: 'De 2-openingen', subtitle: 'Sterke handen', color: '#2b70c9',
    theory: [
      { title: 'Wanneer open je op tweeniveau?', body: `De 2-openingen zijn voor handen waarmee je een manche kunt maken, zelfs als partner minder dan 6 punten heeft. Meestal heb je **20+ punten**.` },
      { title: '2♦, 2♥ en 2♠', body: `Een opening van 2♦, 2♥ of 2♠ belooft een **vijfkaart** in die kleur en een sterke hand. Tel ook je **speelslagen**: met A H V B 7 heb je er vijf. Met veel speelslagen kan het ook met iets minder punten.\n\nAls antwoorder mag je al steunen met een **driekaart**.` },
      { title: '2SA', body: `**2SA** is als 1SA, maar sterker: **20-22 punten** en een SA-verdeling. Antwoorden gaan net als na 1SA: **3♣** is Stayman, **3♦** en **3♥** zijn transfers.` },
      { title: '2♣: de sterkste opening', body: `**2♣** is kunstmatig: het zegt niets over klaveren. Je wilt hoe dan ook de **manche** spelen. Ook met een SA-verdeling en **23+ punten** open je 2♣.\n\nAntwoord **2♦** om de openaar de ruimte te geven. Een ander bod alleen met **8+ punten en een redelijke vijfkaart**.\n\nNa 2♣ mag niemand passen voordat de manche bereikt is.` },
    ],
    lessons: [
      { id: 'h11l1', title: 'Sterk openen', items: [
        mc('Wat belooft een 2♥-opening?', ['Een vijfkaart harten en een sterke hand', 'Een zwakke hand met harten', 'Geen harten'], 0, '2♦/2♥/2♠ beloven een vijfkaart en een sterke hand.'),
        num('Hoeveel speelslagen heeft ♠ A H V B 7?', 5, 'Alle vijf kaarten worden slagen: A, H, V, B en daarna de 7 als lengteslag.'),
        num('Hoeveel punten belooft een 2SA-opening minimaal?', 20, '2SA belooft 20-22 punten met een SA-verdeling.'),
      ], gen: [[genOpening(['two']), 6]] },
      { id: 'h11l2', title: '2SA en 2♣', items: [
        no('Partner opent 2♣ en jij hebt 0 punten. Mag je passen?', 'Nee! Na 2♣ mag je niet passen. Bied 2♦.'),
        mc('Partner opent 2♣. Wat bied je met 4 punten?', ['2♦', 'Pas', '2SA'], 0, '2♦ is het wachtbod: de 2♣-openaar kan nu zijn hand beschrijven.'),
      ], gen: [[gen2CResponse, 4], [gen2NTResponse, 3]] },
    ],
  },

  {
    id: 'h12', nr: '12', title: 'Slotdrive', subtitle: 'Alles van deel 1 herhaald', color: '#58cc02',
    theory: [
      { title: 'Herhaling', body: `In dit laatste hoofdstuk komt alles van deel 1 nog een keer langs: punten tellen, openen, antwoorden, 1SA, tussenbieden en de 2-openingen. Succes!` },
    ],
    lessons: [
      { id: 'h12l1', title: 'Openen en antwoorden', gen: [[genOpening(), 4], [genResponse(), 4], [genNTResponse, 3]] },
      { id: 'h12l2', title: 'Spelen en tellen', gen: [[genTrickTrump, 2], [genSureTricks, 3], [genPlanCount, 2], [genLead, 2]] },
      { id: 'h12l3', title: 'Sterke handen en tussenbieden', gen: [[genOpening(['two', 'nt', 'one']), 3], [genOvercall, 3], [genAdvanceDouble, 2], [gen2CResponse, 2]] },
      { id: 'h12l4', title: 'Biedwedstrijd', gen: [[genOpening(), 3], [genResponse(), 3], [genNTResponse, 3], [genStaymanAnswer, 1], [genOvercall, 2]] },
    ],
  },
]

/** Controle voor de tests: klopt elke vaste biedoefening met de engine? */
export function authoredBidChecks(): { prompt: string; expected: Bid; engine: Bid | undefined }[] {
  const out: { prompt: string; expected: Bid; engine: Bid | undefined }[] = []
  for (const ch of chapters) for (const l of ch.lessons) for (const e of l.items ?? []) {
    if (e.kind !== 'bid') continue
    let engine: Bid | undefined
    if (e.calls.length === 0) engine = openingBid(e.hand)?.bid
    else if (e.calls[0] === '1NT' && e.calls.length === 2) engine = responseToNT(1, e.hand)?.bid
    else if (e.dealer === 'N' && e.calls.length === 2 && /^1[CDHS]$/.test(e.calls[0])) engine = responseToSuit(e.calls[0][1] as Suit, e.hand)?.bid
    else continue
    out.push({ prompt: `${ch.nr} ${l.title}: ${e.prompt}`, expected: e.answer, engine })
  }
  return out
}
