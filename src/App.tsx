import { useEffect, useReducer, useRef, useState } from 'react';
import {
  Side, GameMode, pipCount, opp, BAR, OFF,
  botBestPlay, botShouldDouble, botTakesDouble,
} from './engine';
import {
  reducer, loadInitial, persist, diceDisplay, canEnd, Scores,
} from './state';
import Board from './Board';

// The bot always plays Player 2 ('p').
const BOT_SIDE: Side = 'p';

const DICE_GLYPH = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// Per-mode display strings, shared by the header, score badge and settings.
const MODE_LABEL: Record<GameMode, string> = {
  classic: 'Classic',
  erlex: 'Erlex version 🦁',
  erlex2: 'Erlex² 🦁²',
};
const MODE_SHORT: Record<GameMode, string> = { classic: 'Classic', erlex: 'Erlex 🦁', erlex2: 'Erlex² 🦁²' };
const MODE_TAG: Record<GameMode, string> = { classic: '♟', erlex: '🦁', erlex2: '🦁²' };

const rng = () => 1 + Math.floor(Math.random() * 6);

// a die heavily weighted toward high faces
const luckyDie = () => {
  const r = Math.random();
  if (r < 0.5) return 6;
  if (r < 0.8) return 5;
  if (r < 0.92) return 4;
  return rng();
};
// a "loaded" throw: high faces, with a good shot at doubles
const luckyRoll = () => {
  const d1 = luckyDie();
  const d2 = Math.random() < 0.45 ? d1 : luckyDie();
  return { d1, d2 };
};

export default function App() {
  const [st, dispatch] = useReducer(reducer, undefined, loadInitial);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [endArmed, setEndArmed] = useState(false);
  const [cheatArmed, setCheatArmed] = useState(false);
  const [strikeShow, setStrikeShow] = useState(false);
  const cheatRef = useRef(false); // source of truth read by roll()
  const cheatBuf = useRef('');    // rolling buffer for the secret sequence
  const g = st.game;
  const erlex = st.mode === 'erlex';         // safe-zone version only
  const erlexFamily = st.mode !== 'classic'; // Erlex or Erlex² (backward moves + lion)

  // ---- turn ownership (bot vs human) & doubling-cube flags ----
  const botSide = st.bot;                                   // Side the computer plays, or null
  const isBotTurn = botSide !== null && g.turn === botSide && !g.winner;
  const humanTurn = !isBotTurn && !g.winner;
  const responder = g.pendingDouble ? opp(g.pendingDouble) : null; // side that must take/drop
  const humanMustRespond = g.pendingDouble !== null && responder !== botSide && !g.winner;
  const waitingForBot = g.pendingDouble !== null && responder === botSide && !g.winner;
  const canOfferDouble =
    humanTurn && !g.rolled && !g.pendingDouble && !g.winner &&
    (g.cubeOwner === null || g.cubeOwner === g.turn);

  // Erlex flourish: when a checker is hit, flash a lion strike across the screen.
  const prevStrike = useRef(st.strike);
  useEffect(() => {
    if (st.strike === prevStrike.current) return;
    prevStrike.current = st.strike;
    setStrikeShow(true);
    const t = setTimeout(() => setStrikeShow(false), 900);
    return () => clearTimeout(t);
  }, [st.strike]);

  // ---- bot driver: reacts to every game change and schedules the next move ----
  const botTimer = useRef<number | null>(null);
  useEffect(() => {
    if (botTimer.current) { clearTimeout(botTimer.current); botTimer.current = null; }
    if (botSide === null || g.winner) return;
    const after = (ms: number, fn: () => void) => { botTimer.current = window.setTimeout(fn, ms); };

    // 1) A double was offered to the bot → take or drop.
    if (g.pendingDouble && opp(g.pendingDouble) === botSide) {
      after(750, () => dispatch(botTakesDouble(g, botSide) ? { type: 'TAKE' } : { type: 'DROP' }));
      return;
    }
    if (g.turn !== botSide) return;        // not the bot's turn otherwise
    if (g.pendingDouble === botSide) return; // bot offered; waiting on the human

    // 2) Pre-roll: maybe double, else roll.
    if (!g.rolled) {
      after(650, () =>
        botShouldDouble(g, botSide)
          ? dispatch({ type: 'DOUBLE' })
          : dispatch({ type: 'ROLL', d1: rng(), d2: rng() }));
      return;
    }

    // 3) Rolled: play the best next move, or end the turn when none remain.
    const play = botBestPlay(g, botSide);
    if (play.length) {
      const mv = play[0];
      after(600, () => {
        dispatch({ type: 'CLICK', target: mv.from === BAR ? { kind: 'bar', side: botSide } : { kind: 'point', i: mv.from } });
        dispatch({ type: 'CLICK', target: mv.to === OFF ? { kind: 'off', side: botSide } : { kind: 'point', i: mv.to } });
      });
    } else {
      after(700, () => dispatch({ type: 'END_TURN' }));
    }
    return () => { if (botTimer.current) clearTimeout(botTimer.current); };
  }, [g, botSide]);

  // persist on any meaningful change
  useEffect(() => { persist(st); }, [st.game, st.names, st.colors, st.scores, st.bot]);

  // player colours live as CSS custom properties on :root
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--cg', st.colors.g);
    r.style.setProperty('--cp', st.colors.p);
  }, [st.colors]);

  const roll = () => {
    if (g.rolled || g.winner || g.pendingDouble || isBotTurn) return;
    const { d1, d2 } = cheatRef.current ? luckyRoll() : { d1: rng(), d2: rng() };
    cheatRef.current = false;
    setCheatArmed(false);
    dispatch({ type: 'ROLL', d1, d2 });
  };

  const armCheat = () => {
    cheatRef.current = true;
    setCheatArmed(true);
  };

  // secret cheat code: type "ajed" to load the next throw
  useEffect(() => {
    const CODE = 'ajed';
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      if (e.key.length !== 1) return;
      cheatBuf.current = (cheatBuf.current + e.key.toLowerCase()).slice(-CODE.length);
      if (cheatBuf.current === CODE) {
        cheatBuf.current = '';
        armCheat();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // same cheat, touch-friendly (iPhone has no keyboard):
  // tap the ERLEX logo 4× in quick succession — one tap per letter of the code.
  const tapCount = useRef(0);
  const tapAt = useRef(0);
  const onBrandTap = () => {
    const now = Date.now();
    tapCount.current = now - tapAt.current < 800 ? tapCount.current + 1 : 1;
    tapAt.current = now;
    if (tapCount.current >= 4) {
      tapCount.current = 0;
      armCheat();
    }
  };
  const ended = canEnd(g);

  // reset the "press space again to confirm" arming when it's no longer end-turn time
  useEffect(() => {
    if (!ended) setEndArmed(false);
  }, [ended, g.turn]);

  // space bar: roll, or end the turn (press twice — the 2nd press confirms).
  // ignored while typing or in a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (settingsOpen) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      e.preventDefault();
      if (isBotTurn || g.pendingDouble) return; // bot is acting / a double is on the table
      if (!g.rolled) {
        roll();
      } else if (ended) {
        if (endArmed) {
          setEndArmed(false);
          dispatch({ type: 'END_TURN' });
        } else {
          setEndArmed(true);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [g.rolled, g.winner, ended, endArmed, settingsOpen, isBotTurn, g.pendingDouble]);
  const newGame = () => dispatch({ type: 'NEW_GAME', first: Math.random() < 0.5 ? 'g' : 'p' });
  const confirmNew = () => {
    if (g.winner || window.confirm('Start a new game? The current game is lost.')) newGame();
  };

  const wcls = g.turn === 'g' ? 'gc' : 'pc';

  let banner;
  if (g.winner) {
    banner = <span className={`who ${g.winner === 'g' ? 'gc' : 'pc'}`}>{st.names[g.winner]} wins! 🏆</span>;
  } else if (humanMustRespond) {
    const off = g.pendingDouble!;
    banner = <><span className={`who ${off === 'g' ? 'gc' : 'pc'}`}>{st.names[off]}</span> doubles to {g.cube * 2} — take or drop?</>;
  } else if (waitingForBot) {
    banner = <><span className={`who ${wcls}`}>{st.names[g.turn]}</span> doubled — 🤖 deciding…</>;
  } else if (isBotTurn) {
    banner = <><span className={`who ${wcls}`}>🤖 {st.names[g.turn]}</span> {g.rolled ? 'is moving…' : 'is thinking…'}</>;
  } else if (!g.rolled) {
    banner = <><span className={`who ${wcls}`}>{st.names[g.turn]}</span> — tap Roll</>;
  } else if (ended && g.remaining.length) {
    banner = <><span className={`who ${wcls}`}>{st.names[g.turn]}</span> — no moves</>;
  } else {
    banner = <><span className={`who ${wcls}`}>{st.names[g.turn]}</span> to move</>;
  }
  const cubeActive = g.cube > 1 || g.cubeOwner !== null || g.pendingDouble !== null;
  const cubeTitle =
    `Worth ${g.cube} point${g.cube > 1 ? 's' : ''} · ` +
    (g.cubeOwner ? `${st.names[g.cubeOwner]} holds the cube` : 'cube is centred');

  return (
    <>
      <div className="wrap">
        <header>
          <div className="brand">
            <h1 onClick={onBrandTap}>ERLEX{cheatArmed && !g.rolled && <span className="lucky" title="Loaded dice">🍀</span>}</h1>
            <small>Backgammon · {MODE_LABEL[st.mode]}</small>
          </div>
          <div className="score" title={`${MODE_SHORT[st.mode]} score`}>
            <span className="dot gc" />
            <span>{st.names.g}</span>
            <span className="s">{st.scores[st.mode].g}</span>
            <span style={{ color: 'var(--dim)' }}>–</span>
            <span className="s">{st.scores[st.mode].p}</span>
            <span>{st.names.p}</span>
            <span className="dot pc" />
            <span className="modetag">{MODE_TAG[st.mode]}</span>
          </div>
          <button className="gear" title="Settings" onClick={() => setSettingsOpen(true)}>⚙</button>
        </header>

        <div className={`banner turn-${g.turn}`}>
          <div className="btxt">
            {banner}
            <span className="pips"> · pip {pipCount(g, 'g')}/{pipCount(g, 'p')}</span>
            {cubeActive && (
              <span className={'cubechip' + (g.pendingDouble ? ' pend' : '')} title={cubeTitle}>⧉ ×{g.cube}</span>
            )}
          </div>
          <div className="dice">
            {diceDisplay(g).map((d, n) => (
              <div key={n} className={`die ${g.turn === 'g' ? 'gv' : 'pv'} ${d.used ? 'used' : ''}`}>
                {DICE_GLYPH[d.v]}
              </div>
            ))}
          </div>
          <div className="bbtn">
            {g.winner ? (
              <button className="btn primary" onClick={newGame}>New game</button>
            ) : humanMustRespond ? (
              <div className="cubebtns">
                <button className="btn go" onClick={() => dispatch({ type: 'TAKE' })}>Take ×2 ({g.cube * 2})</button>
                <button className="btn warn" onClick={() => dispatch({ type: 'DROP' })}>Drop</button>
              </div>
            ) : isBotTurn || waitingForBot ? (
              <span className="thinking">🤖 thinking…</span>
            ) : !g.rolled ? (
              <div className="cubebtns">
                <button className="btn go" onClick={roll}>🎲 Roll</button>
                {canOfferDouble && (
                  <button className="btn dbl" onClick={() => dispatch({ type: 'DOUBLE' })} title={`Double the stake to ${g.cube * 2}`}>
                    Double ›
                  </button>
                )}
              </div>
            ) : ended ? (
              <button className="btn primary" onClick={() => { setEndArmed(false); dispatch({ type: 'END_TURN' }); }}>
                {endArmed ? 'Press space to confirm ›' : 'End turn ›'}
              </button>
            ) : null}
          </div>
        </div>

        <div className={'boardwrap' + (isBotTurn || g.pendingDouble ? ' locked' : '')}>
          <Board st={st} dispatch={dispatch} />
        </div>

        <div className="controls">
          <button className="btn" disabled={!st.history.length || isBotTurn || !!g.pendingDouble} onClick={() => dispatch({ type: 'UNDO' })}>↶ Undo</button>
          {ended && !g.winner && !isBotTurn && (
            <button className="btn primary" onClick={() => { setEndArmed(false); dispatch({ type: 'END_TURN' }); }}>
              {endArmed ? 'Press space to confirm ›' : 'End turn ›'}
            </button>
          )}
          <button className="btn warn" onClick={confirmNew}>↻ New game</button>
        </div>

        {erlexFamily && (
          <div className="legend">
            <span className="lgi"><span className="swatch fwd">→</span> Forward</span>
            <span className="lgi"><span className="swatch back">→</span> Backward</span>
            <span className="lgi"><span className="swatch hit">✕</span> Capture</span>
            {erlex && <span className="lgi"><span className="swatch safe">🛡</span> Safe zone — no backward entry</span>}
            <span className="lgi note">Arrows point the way each move travels.</span>
          </div>
        )}
        <div className="rotate">↻ Tip: rotate to landscape for a bigger board.</div>
      </div>

      {strikeShow && (
        <div className="strike" key={st.strike} aria-hidden="true">
          <div className="claw claw1" />
          <div className="claw claw2" />
          <div className="claw claw3" />
          <div className="roar">🦁</div>
        </div>
      )}

      {settingsOpen && (
        <Settings
          key={String(settingsOpen)}
          names={st.names}
          colors={st.colors}
          scores={st.scores}
          mode={st.mode}
          bot={st.bot}
          onSave={(names, colors, scores, mode, bot) => { dispatch({ type: 'SAVE_SETTINGS', names, colors, scores, mode, bot }); setSettingsOpen(false); }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {g.winner && (
        <div className="overlay show" onClick={(e) => { if (e.target === e.currentTarget) newGame(); }}>
          <div className="card">
            <div className="win-emoji">🏆</div>
            <h2 style={{ textAlign: 'center' }}>
              <span className={g.winner === 'g' ? 'gc' : 'pc'}>{st.names[g.winner]}</span> wins!
            </h2>
            <div className="cardbtns">
              <button className="btn primary" onClick={newGame}>New game</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Settings({
  names, colors, scores, mode, bot, onSave, onClose,
}: {
  names: Record<Side, string>;
  colors: Record<Side, string>;
  scores: Scores;
  mode: GameMode;
  bot: Side | null;
  onSave: (names: Record<Side, string>, colors: Record<Side, string>, scores: Scores, mode: GameMode, bot: Side | null) => void;
  onClose: () => void;
}) {
  const [ng, setNg] = useState(names.g);
  const [np, setNp] = useState(names.p);
  const [cg, setCg] = useState(colors.g);
  const [cp, setCp] = useState(colors.p);
  const [md, setMd] = useState<GameMode>(mode);
  const [bt, setBt] = useState<Side | null>(bot);
  // keep every mode's scores as editable strings so switching the toggle doesn't lose edits
  const [sc, setSc] = useState<Record<GameMode, { g: string; p: string }>>({
    classic: { g: String(scores.classic.g), p: String(scores.classic.p) },
    erlex: { g: String(scores.erlex.g), p: String(scores.erlex.p) },
    erlex2: { g: String(scores.erlex2.g), p: String(scores.erlex2.p) },
  });

  // parse a score input to a non-negative integer (blank / junk → 0)
  const num = (s: string) => Math.max(0, Math.floor(Number(s) || 0));
  const setScore = (m: GameMode, side: Side, v: string) =>
    setSc((prev) => ({ ...prev, [m]: { ...prev[m], [side]: v } }));

  const save = () =>
    onSave(
      { g: ng.trim() || 'Player 1', p: np.trim() || 'Player 2' },
      { g: cg, p: cp },
      {
        classic: { g: num(sc.classic.g), p: num(sc.classic.p) },
        erlex: { g: num(sc.erlex.g), p: num(sc.erlex.p) },
        erlex2: { g: num(sc.erlex2.g), p: num(sc.erlex2.p) },
      },
      md,
      bt,
    );

  return (
    <div className="overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card">
        <h2>Settings</h2>
        <div className="row">
          <label>Game mode</label>
          <div className="modepick">
            {(['classic', 'erlex', 'erlex2'] as GameMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={'modebtn' + (md === m ? ' on' : '')}
                onClick={() => setMd(m)}
              >{MODE_SHORT[m]}</button>
            ))}
          </div>
        </div>
        <div className="modehint">
          {md === 'erlex'
            ? 'Erlex version: checkers may also move backwards, each player’s home board is a safe zone the opponent can’t move backward into, and hitting a checker unleashes a lion strike.'
            : md === 'erlex2'
            ? 'Erlex² (Erlend to the power of two): like Erlex — backward moves and the lion strike — but with NO safe zone, so backward moves may enter anywhere.'
            : 'Classic backgammon rules.'}
        </div>
        <div className="row">
          <label>Opponent</label>
          <div className="modepick">
            <button type="button" className={'modebtn' + (bt === null ? ' on' : '')} onClick={() => setBt(null)}>🧑 2 players</button>
            <button type="button" className={'modebtn' + (bt !== null ? ' on' : '')} onClick={() => setBt(BOT_SIDE)}>🤖 vs Bot</button>
          </div>
        </div>
        <div className="modehint">
          {bt !== null
            ? `Solo play: the computer controls ${np.trim() || 'Player 2'} 🤖. It rolls, moves and handles the doubling cube on its own.`
            : 'Two players share this device (hot-seat).'}
        </div>
        <div className="row"><label>Player 1 name</label><input type="text" value={ng} onChange={(e) => setNg(e.target.value)} /></div>
        <div className="row"><label>Player 1 colour</label><input type="color" value={cg} onChange={(e) => setCg(e.target.value)} /></div>
        <div className="row"><label>Player 2 name</label><input type="text" value={np} onChange={(e) => setNp(e.target.value)} /></div>
        <div className="row"><label>Player 2 colour</label><input type="color" value={cp} onChange={(e) => setCp(e.target.value)} /></div>
        <div className="row">
          <label>Score <span className="scopetag">{MODE_SHORT[md]}</span></label>
          <div className="scoreedit">
            <input type="number" inputMode="numeric" min={0} value={sc[md].g} onChange={(e) => setScore(md, 'g', e.target.value)} aria-label={`${ng} ${md} score`} />
            <span className="sep">–</span>
            <input type="number" inputMode="numeric" min={0} value={sc[md].p} onChange={(e) => setScore(md, 'p', e.target.value)} aria-label={`${np} ${md} score`} />
          </div>
        </div>
        <div className="cardbtns">
          <button className="btn" onClick={() => setSc((p) => ({ ...p, [md]: { g: '0', p: '0' } }))}>Reset {MODE_SHORT[md]} score</button>
          <button className="btn primary" onClick={save}>Done</button>
        </div>
      </div>
    </div>
  );
}
