// Storefront content the catalog does not get from the engine: the
// designer of record, the copy written for players (the engine's own
// descriptions are written for the agent that runs a physical table), and
// the designer's updates, which show as the devlog on a game page and as
// the feed on the home page. All of it is Zekel Games' own; a designer
// dashboard that edits it is later work (the brief leaves it a place in the
// navigation and nothing more).

export interface Designer {
  slug: string;
  name: string;
  bio: string;
}

export const DESIGNERS: Record<string, Designer> = {
  'zekel-games': {
    slug: 'zekel-games',
    name: 'Zekel Games',
    bio: 'Small games with real decisions: card fights, deduction duels, a solo space season and a candy kingdom to hold. Every rule runs on the open zekel engine, so the table you play here is the printed game, move for move.',
  },
};

export const ZEKEL_GAMES: Record<string, { designer: string; description: string; playTime: string; tags: string[] }> = {
  'fractured-fist': {
    designer: 'zekel-games',
    description: "A two-player card fight. Start with a small, weak deck, buy better techniques as you go, and knock your opponent's stamina from 7 to 0. Ten to twenty rounds.",
    playTime: '10–20 min',
    tags: ['deck-building', 'duel', 'two players'],
  },
  'cybernoir-2127': {
    designer: 'zekel-games',
    description: 'A two-player detective duel in a neon city: the Detective chases leads across nineteen locations while the Hacker hides the truth.',
    playTime: '30–45 min',
    tags: ['deduction', 'duel', 'two players'],
  },
  'warble-way-galaxy': {
    designer: 'zekel-games',
    description: 'A solo space adventure: build a character, gather a crew, travel the galaxy, and chase one of five season endings.',
    playTime: '45–90 min',
    tags: ['solo', 'adventure', 'dice'],
  },
  'neither-guts-nor-gears': {
    designer: 'zekel-games',
    description: 'Wizards and robots for two to six players on a hex map: collect five resources, build, research, fight in secret-card battles, hold treaties, and win by military, culture, economy or technology.',
    playTime: '90–150 min',
    tags: ['strategy', 'area control', 'hex map'],
  },
  'sweetlands-imperium': {
    designer: 'zekel-games',
    description: 'Area control for two to five players on an 80-space candy kingdom: move your leader, knight and ambassador, play Intel, and hold the castle.',
    playTime: '45–75 min',
    tags: ['area control', 'strategy'],
  },
};

/** The designer's posts, oldest first. Ids are stable so a restart never
 *  posts one twice; the text is the project's own record of what shipped. */
export const ZEKEL_UPDATES: Array<{ id: string; gameId: string; title: string; body: string; postedAt: string }> = [
  {
    id: 'ff-2026-09-16-browser',
    gameId: 'fractured-fist',
    title: 'Fractured Fist plays in the browser',
    postedAt: '2026-09-16T12:00:00.000Z',
    body: 'Press Play now on the game page and you are in a full game against the AI, no account needed. Legal moves light up the cards they touch, AI turns play back as a slideshow you can pace and replay, and you can take back your last move while nobody has acted since.',
  },
  {
    id: 'cn-2026-09-16-two-humans',
    gameId: 'cybernoir-2127',
    title: 'Two detectives, two browsers',
    postedAt: '2026-09-16T18:00:00.000Z',
    body: 'Cybernoir 2127 runs live between two signed-in players. Each browser receives only its own seat: the Detective never sees the Hacker\'s hand or hideout, and the Hacker never sees the location hand. Open a table with friends from the game page and share the lobby link.',
  },
  {
    id: 'sl-2026-09-17-board',
    gameId: 'sweetlands-imperium',
    title: 'The Sweetlands board, space for space',
    postedAt: '2026-09-17T09:00:00.000Z',
    body: 'All 80 spaces, the four start tiles and the Candy Castle sit where the printed board puts them, with the faction portraits on each player\'s panel and the treat icons on the cards and the treat spaces. Factions, the foe and the secret objectives are yours to choose at the table; the Intel comes from the Draw button.',
  },
  {
    id: 'ww-2026-09-17-season',
    gameId: 'warble-way-galaxy',
    title: 'A season of Warble Way, solo',
    postedAt: '2026-09-17T10:00:00.000Z',
    body: 'Create your character on the form (name, race, ship, scores or an archetype card), take a mission, and fly. Every travel card and every die waits for your press of Draw or Roll, and the dice tumble on the table when they land.',
  },
];
