import {
  GameState, GameMode, Side, Src, Dest, Move, BAR, OFF,
  newGameState, opp, legalMovesFrom, hasAnyLegal, sources, applyMove,
} from './engine';

export interface Snapshot {
  board: number[];
  bar: Record<Side, number>;
  off: Record<Side, number>;
  remaining: number[];
}

// Scores are tracked independently per game mode.
export type Scores = Record<GameMode, Record<Side, number>>;

const zeroScores = (): Scores => ({
  classic: { g: 0, p: 0 },
  erlex: { g: 0, p: 0 },
  erlex2: { g: 0, p: 0 },
});

export interface AppState {
  game: GameState;
  history: Snapshot[];
  selected: Src | null;
  highlights: Move[];
  names: Record<Side, string>;
  colors: Record<Side, string>;
  scores: Scores; // per-mode: scores[mode][side]
  mode: GameMode;
  strike: number; // bumps on every hit — drives the Erlex lion strike animation
  bot: Side | null; // side played by the computer, or null for two-player hot-seat
}

export type ClickTarget =
  | { kind: 'point'; i: number }
  | { kind: 'bar'; side: Side }
  | { kind: 'off'; side: Side };

export type Action =
  | { type: 'ROLL'; d1: number; d2: number }
  | { type: 'CLICK'; target: ClickTarget }
  | { type: 'UNDO' }
  | { type: 'END_TURN' }
  | { type: 'NEW_GAME'; first: Side }
  | { type: 'SAVE_SETTINGS'; names: Record<Side, string>; colors: Record<Side, string>; scores: Scores; mode: GameMode; bot: Side | null }
  | { type: 'RESET_SCORES' }
  | { type: 'DOUBLE' }  // current player offers to double the stake
  | { type: 'TAKE' }    // opponent accepts the double
  | { type: 'DROP' };   // opponent declines — offerer wins the current stake

const DEFAULT_NAMES: Record<Side, string> = { g: 'Erlend', p: 'Alex' };
const DEFAULT_COLORS: Record<Side, string> = { g: '#39ff14', p: '#ff4da6' };

// After a roll/move, auto-grab the bar checker if it must (and can) re-enter.
function selectionFor(game: GameState): { selected: Src | null; highlights: Move[] } {
  if (game.winner || !game.rolled) return { selected: null, highlights: [] };
  if (game.bar[game.turn] > 0) {
    const hs = legalMovesFrom(game, BAR, game.turn);
    if (hs.length) return { selected: BAR, highlights: hs };
  }
  return { selected: null, highlights: [] };
}

function clickToDest(t: ClickTarget, turn: Side): Dest | null {
  if (t.kind === 'point') return t.i;
  if (t.kind === 'off' && t.side === turn) return OFF;
  return null;
}
function clickToSrc(g: GameState, t: ClickTarget): Src | null {
  if (t.kind === 'bar' && t.side === g.turn && g.bar[g.turn] > 0) return BAR;
  if (t.kind === 'point') {
    const i = t.i;
    if (g.turn === 'g' ? g.board[i] > 0 : g.board[i] < 0) return i;
  }
  return null;
}

function applyClickMove(st: AppState, to: Dest): AppState {
  if (st.selected === null) return st;
  const g = st.game;
  const matches = st.highlights.filter((h) => h.to === to);
  if (!matches.length) return st;
  const e: Move =
    to === OFF
      ? matches.find((m) => m.exact) ?? [...matches].sort((a, b) => a.die - b.die)[0]
      : matches[0];
  const snap: Snapshot = {
    board: g.board.slice(),
    bar: { ...g.bar },
    off: { ...g.off },
    remaining: g.remaining.slice(),
  };
  const game = applyMove(g, st.selected, to, e.die, e.hit);
  let scores = st.scores;
  if (game.winner && !g.winner) {
    const m = st.mode;
    // a completed game is worth the current doubling-cube value
    scores = { ...scores, [m]: { ...scores[m], [game.turn]: scores[m][game.turn] + game.cube } };
  }
  const base: AppState = {
    ...st,
    game,
    history: [...st.history, snap],
    scores,
    strike: e.hit ? st.strike + 1 : st.strike,
    selected: null,
    highlights: [],
  };
  return game.winner ? base : { ...base, ...selectionFor(game) };
}

function handleClick(st: AppState, t: ClickTarget): AppState {
  const g = st.game;
  if (g.winner || !g.rolled) return st;
  if (st.selected !== null) {
    const dest = clickToDest(t, g.turn);
    if (dest !== null && st.highlights.some((h) => h.to === dest)) {
      return applyClickMove(st, dest);
    }
  }
  const src = clickToSrc(g, t);
  if (src !== null) {
    const hs = legalMovesFrom(g, src, g.turn);
    if (hs.length) return { ...st, selected: src, highlights: hs };
  }
  return { ...st, selected: null, highlights: [] };
}

export function reducer(st: AppState, a: Action): AppState {
  switch (a.type) {
    case 'ROLL': {
      if (st.game.rolled || st.game.winner || st.game.pendingDouble) return st;
      const dice = [a.d1, a.d2];
      const remaining =
        a.d1 === a.d2 ? [a.d1, a.d1, a.d1, a.d1] : [a.d1, a.d2];
      const game: GameState = { ...st.game, dice, remaining, rolled: true };
      return { ...st, game, history: [], ...selectionFor(game) };
    }
    case 'CLICK':
      return handleClick(st, a.target);
    case 'UNDO': {
      if (!st.history.length) return st;
      const history = st.history.slice();
      const snap = history.pop()!;
      const game: GameState = {
        ...st.game,
        board: snap.board,
        bar: snap.bar,
        off: snap.off,
        remaining: snap.remaining,
      };
      return { ...st, game, history, ...selectionFor(game) };
    }
    case 'END_TURN': {
      const game: GameState = {
        ...st.game,
        turn: opp(st.game.turn),
        rolled: false,
        dice: [],
        remaining: [],
      };
      return { ...st, game, history: [], selected: null, highlights: [] };
    }
    case 'NEW_GAME':
      return {
        ...st,
        game: newGameState(a.first, st.mode),
        history: [],
        selected: null,
        highlights: [],
      };
    case 'SAVE_SETTINGS':
      return {
        ...st,
        names: a.names,
        colors: a.colors,
        scores: a.scores,
        mode: a.mode,
        bot: a.bot,
        // apply the chosen mode to the game in progress so it takes effect at once
        game: { ...st.game, mode: a.mode },
      };
    case 'RESET_SCORES':
      return { ...st, scores: zeroScores() };
    case 'DOUBLE': {
      const g = st.game;
      if (g.rolled || g.winner || g.pendingDouble) return st;
      // only the cube owner (or either side when centred) may offer
      if (!(g.cubeOwner === null || g.cubeOwner === g.turn)) return st;
      return { ...st, game: { ...g, pendingDouble: g.turn } };
    }
    case 'TAKE': {
      const g = st.game;
      if (!g.pendingDouble) return st;
      const taker = opp(g.pendingDouble); // the cube passes to whoever accepted
      return { ...st, game: { ...g, cube: g.cube * 2, cubeOwner: taker, pendingDouble: null } };
    }
    case 'DROP': {
      const g = st.game;
      if (!g.pendingDouble) return st;
      const winner = g.pendingDouble; // decliner concedes the pre-double stake
      const m = st.mode;
      const scores = { ...st.scores, [m]: { ...st.scores[m], [winner]: st.scores[m][winner] + g.cube } };
      return { ...st, game: { ...g, winner, pendingDouble: null }, scores, selected: null, highlights: [] };
    }
    default:
      return st;
  }
}

// ---- selectors ----

export function diceDisplay(g: GameState): { v: number; used: boolean }[] {
  if (!g.dice.length) return [];
  const exp =
    g.dice[0] === g.dice[1]
      ? [g.dice[0], g.dice[0], g.dice[0], g.dice[0]]
      : [...g.dice];
  const rem = g.remaining.slice();
  const out: { v: number; used: boolean }[] = [];
  for (const v of exp) {
    const k = rem.indexOf(v);
    if (k >= 0) { rem.splice(k, 1); out.push({ v, used: false }); }
    else out.push({ v, used: true });
  }
  return out;
}

export function canEnd(g: GameState): boolean {
  return g.rolled && !g.winner && (g.remaining.length === 0 || !hasAnyLegal(g, g.turn));
}

export function movableSources(st: AppState): Set<Src> {
  const set = new Set<Src>();
  const g = st.game;
  if (g.winner || !g.rolled || st.selected !== null) return set;
  for (const s of sources(g, g.turn)) if (legalMovesFrom(g, s, g.turn).length) set.add(s);
  return set;
}

// ---- persistence ----

const KEY = 'erlex_react_v1';

// Read persisted scores in either shape: the new per-mode object, or the old
// flat { g, p } (which predates game modes — those wins are credited to classic).
function migrateScores(raw: unknown): Scores {
  const out = zeroScores();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  const asPair = (v: unknown): Record<Side, number> | null => {
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    return { g: Number(o.g) || 0, p: Number(o.p) || 0 };
  };
  if ('classic' in r || 'erlex' in r || 'erlex2' in r) {
    out.classic = asPair(r.classic) ?? out.classic;
    out.erlex = asPair(r.erlex) ?? out.erlex;
    out.erlex2 = asPair(r.erlex2) ?? out.erlex2;
  } else if ('g' in r || 'p' in r) {
    out.classic = asPair(r) ?? out.classic; // legacy flat scores → classic
  }
  return out;
}

export function loadInitial(): AppState {
  const base: AppState = {
    game: newGameState(Math.random() < 0.5 ? 'g' : 'p', 'erlex'),
    history: [],
    selected: null,
    highlights: [],
    names: { ...DEFAULT_NAMES },
    colors: { ...DEFAULT_COLORS },
    scores: zeroScores(),
    mode: 'erlex',
    strike: 0,
    bot: null,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.game && Array.isArray(s.game.board) && s.game.board.length === 24) {
        const asMode = (v: unknown): GameMode | null =>
          v === 'erlex' || v === 'erlex2' || v === 'classic' ? v : null;
        const mode: GameMode = asMode(s.mode) ?? asMode(s.game.mode) ?? 'erlex';
        const asSide = (v: unknown): Side | null => (v === 'g' || v === 'p' ? v : null);
        const merged: AppState = {
          ...base,
          // normalise the doubling cube for games saved before it existed
          game: {
            ...s.game,
            mode,
            cube: Number(s.game.cube) || 1,
            cubeOwner: asSide(s.game.cubeOwner),
            pendingDouble: null, // never resume a mid-offer double
          },
          names: s.names ?? base.names,
          colors: s.colors ?? base.colors,
          scores: migrateScores(s.scores),
          mode,
          bot: asSide(s.bot),
        };
        return { ...merged, ...selectionFor(merged.game) };
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return base;
}

export function persist(st: AppState): void {
  const { game, names, colors, scores, mode, bot } = st;
  try {
    localStorage.setItem(KEY, JSON.stringify({ game, names, colors, scores, mode, bot }));
  } catch {
    /* storage may be unavailable (private mode) — non-fatal */
  }
}
