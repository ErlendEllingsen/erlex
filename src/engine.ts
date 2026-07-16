// Backgammon rules engine — pure & immutable (validated with 5000 random games in Node).
// board: number[24]. index 0 = point 1 ... index 23 = point 24.
//   positive = side 'g' count, negative = side 'p' count.
// 'g' moves index high->low (bears off below 0). 'p' moves low->high (bears off above 23).

export type Side = 'g' | 'p';
export const OFF = 'off';
export const BAR = 'bar';
export type Src = number | typeof BAR;
export type Dest = number | typeof OFF;

export interface GameState {
  board: number[];
  bar: Record<Side, number>;
  off: Record<Side, number>;
  turn: Side;
  dice: number[];
  remaining: number[];
  winner: Side | null;
  rolled: boolean;
}

export interface Move {
  to: Dest;
  die: number;
  hit: boolean;
  exact: boolean;
}

export const sign = (pl: Side): number => (pl === 'g' ? 1 : -1);
export const opp = (pl: Side): Side => (pl === 'g' ? 'p' : 'g');

export function newGameState(first: Side): GameState {
  const board = new Array(24).fill(0);
  board[23] = 2; board[12] = 5; board[7] = 3; board[5] = 5;         // g
  board[0] = -2; board[11] = -5; board[16] = -3; board[18] = -5;    // p
  return {
    board,
    bar: { g: 0, p: 0 },
    off: { g: 0, p: 0 },
    turn: first,
    dice: [],
    remaining: [],
    winner: null,
    rolled: false,
  };
}

function canLand(g: GameState, idx: number, pl: Side): boolean {
  if (idx < 0 || idx > 23) return false;
  const c = g.board[idx];
  return pl === 'g' ? c >= -1 : c <= 1;
}
function isHit(g: GameState, idx: number, pl: Side): boolean {
  const c = g.board[idx];
  return pl === 'g' ? c === -1 : c === 1;
}
function allInHome(g: GameState, pl: Side): boolean {
  if (pl === 'g') {
    if (g.bar.g > 0) return false;
    for (let i = 6; i < 24; i++) if (g.board[i] > 0) return false;
    return true;
  }
  if (g.bar.p > 0) return false;
  for (let i = 0; i < 18; i++) if (g.board[i] < 0) return false;
  return true;
}
// index of the checker furthest from bearing off, within the home board
function furthestHome(g: GameState, pl: Side): number {
  if (pl === 'g') {
    for (let i = 5; i >= 0; i--) if (g.board[i] > 0) return i;
    return -1;
  }
  for (let i = 18; i <= 23; i++) if (g.board[i] < 0) return i;
  return -1;
}

export function legalDest(g: GameState, src: Src, d: number, pl: Side): Move | null {
  const s = sign(pl);
  if (g.bar[pl] > 0 && src !== BAR) return null; // must enter from the bar first
  if (src === BAR) {
    if (g.bar[pl] <= 0) return null;
    const e = pl === 'g' ? 24 - d : d - 1;
    if (canLand(g, e, pl)) return { to: e, die: d, hit: isHit(g, e, pl), exact: false };
    return null;
  }
  const i = src;
  if (pl === 'g' ? g.board[i] <= 0 : g.board[i] >= 0) return null; // no own checker here
  const t = i - s * d; // g: i-d, p: i+d
  const bearing = pl === 'g' ? t < 0 : t > 23;
  if (!bearing) {
    if (canLand(g, t, pl)) return { to: t, die: d, hit: isHit(g, t, pl), exact: false };
    return null;
  }
  if (!allInHome(g, pl)) return null;
  const pip = pl === 'g' ? i + 1 : 24 - i;
  if (d === pip) return { to: OFF, die: d, hit: false, exact: true };
  if (d > pip && i === furthestHome(g, pl)) return { to: OFF, die: d, hit: false, exact: false };
  return null;
}

export function sources(g: GameState, pl: Side): Src[] {
  if (g.bar[pl] > 0) return [BAR];
  const out: Src[] = [];
  for (let i = 0; i < 24; i++) if (pl === 'g' ? g.board[i] > 0 : g.board[i] < 0) out.push(i);
  return out;
}

export function hasAnyLegal(g: GameState, pl: Side): boolean {
  const dice = [...new Set(g.remaining)];
  for (const src of sources(g, pl)) for (const d of dice) if (legalDest(g, src, d, pl)) return true;
  return false;
}

export function legalMovesFrom(g: GameState, src: Src, pl: Side): Move[] {
  const res: Move[] = [];
  for (const d of new Set(g.remaining)) {
    const dest = legalDest(g, src, d, pl);
    if (dest) res.push(dest);
  }
  return res;
}

// Returns a NEW state (immutable) so React can diff it.
export function applyMove(g: GameState, src: Src, to: Dest, die: number, hit: boolean): GameState {
  const pl = g.turn;
  const s = sign(pl);
  const board = g.board.slice();
  const bar = { ...g.bar };
  const off = { ...g.off };
  if (src === BAR) bar[pl]--; else board[src] -= s;
  if (to === OFF) off[pl]++;
  else if (hit) { bar[opp(pl)]++; board[to] = s; }
  else board[to] += s;
  const remaining = g.remaining.slice();
  const k = remaining.indexOf(die);
  if (k >= 0) remaining.splice(k, 1);
  const winner = off[pl] === 15 ? pl : g.winner;
  return { ...g, board, bar, off, remaining, winner };
}

export function pipCount(g: GameState, pl: Side): number {
  let total = g.bar[pl] * 25;
  for (let i = 0; i < 24; i++) {
    if (pl === 'g' && g.board[i] > 0) total += g.board[i] * (i + 1);
    if (pl === 'p' && g.board[i] < 0) total += (-g.board[i]) * (24 - i);
  }
  return total;
}
