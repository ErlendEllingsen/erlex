import { useEffect, useReducer, useRef, useState } from 'react';
import { Side, GameMode, pipCount } from './engine';
import {
  reducer, loadInitial, persist, diceDisplay, canEnd, Scores,
} from './state';
import Board from './Board';

const DICE_GLYPH = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
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
  const erlex = st.mode === 'erlex';

  // Erlex flourish: when a checker is hit, flash a lion strike across the screen.
  const prevStrike = useRef(st.strike);
  useEffect(() => {
    if (st.strike === prevStrike.current) return;
    prevStrike.current = st.strike;
    setStrikeShow(true);
    const t = setTimeout(() => setStrikeShow(false), 900);
    return () => clearTimeout(t);
  }, [st.strike]);

  // persist on any meaningful change
  useEffect(() => { persist(st); }, [st.game, st.names, st.colors, st.scores]);

  // player colours live as CSS custom properties on :root
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--cg', st.colors.g);
    r.style.setProperty('--cp', st.colors.p);
  }, [st.colors]);

  const roll = () => {
    if (g.rolled || g.winner) return;
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
  }, [g.rolled, g.winner, ended, endArmed, settingsOpen]);
  const newGame = () => dispatch({ type: 'NEW_GAME', first: Math.random() < 0.5 ? 'g' : 'p' });
  const confirmNew = () => {
    if (g.winner || window.confirm('Start a new game? The current game is lost.')) newGame();
  };

  const wcls = g.turn === 'g' ? 'gc' : 'pc';

  let banner;
  if (g.winner) {
    banner = <span className={`who ${g.winner === 'g' ? 'gc' : 'pc'}`}>{st.names[g.winner]} wins! 🏆</span>;
  } else if (!g.rolled) {
    banner = <><span className={`who ${wcls}`}>{st.names[g.turn]}</span> — tap Roll</>;
  } else if (ended && g.remaining.length) {
    banner = <><span className={`who ${wcls}`}>{st.names[g.turn]}</span> — no moves</>;
  } else if (g.bar[g.turn] > 0) {
    // a checker on the bar must re-enter before anything else can move
    banner = <><span className={`who ${wcls}`}>{st.names[g.turn]}</span> — enter from the bar 🚧</>;
  } else {
    banner = <><span className={`who ${wcls}`}>{st.names[g.turn]}</span> to move</>;
  }

  return (
    <>
      <div className="wrap">
        <header>
          <div className="brand">
            <h1 onClick={onBrandTap}>ERLEX{cheatArmed && !g.rolled && <span className="lucky" title="Loaded dice">🍀</span>}</h1>
            <small>Backgammon · {erlex ? 'Erlex version 🦁' : 'Classic'}</small>
          </div>
          <div className="score" title={`${erlex ? 'Erlex version' : 'Classic'} score`}>
            <span className="dot gc" />
            <span>{st.names.g}</span>
            <span className="s">{st.scores[st.mode].g}</span>
            <span style={{ color: 'var(--dim)' }}>–</span>
            <span className="s">{st.scores[st.mode].p}</span>
            <span>{st.names.p}</span>
            <span className="dot pc" />
            <span className="modetag">{erlex ? '🦁' : '♟'}</span>
          </div>
          <button className="gear" title="Settings" onClick={() => setSettingsOpen(true)}>⚙</button>
        </header>

        <div className={`banner turn-${g.turn}`}>
          <div className="btxt">
            {banner}
            <span className="pips"> · pip {pipCount(g, 'g')}/{pipCount(g, 'p')}</span>
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
            ) : !g.rolled ? (
              <button className="btn go" onClick={roll}>🎲 Roll</button>
            ) : ended ? (
              <button className="btn primary" onClick={() => { setEndArmed(false); dispatch({ type: 'END_TURN' }); }}>
                {endArmed ? 'Press space to confirm ›' : 'End turn ›'}
              </button>
            ) : null}
          </div>
        </div>

        <Board st={st} dispatch={dispatch} />

        {erlex && (
          <div className="legend">
            <span className="lgi"><span className="swatch fwd">→</span> Forward</span>
            <span className="lgi"><span className="swatch back">→</span> Backward</span>
            <span className="lgi"><span className="swatch hit">✕</span> Capture</span>
            <span className="lgi note">Arrows point the way each move travels.</span>
          </div>
        )}

        <div className="controls">
          <button className="btn" disabled={!st.history.length} onClick={() => dispatch({ type: 'UNDO' })}>↶ Undo</button>
          {ended && !g.winner && (
            <button className="btn primary" onClick={() => { setEndArmed(false); dispatch({ type: 'END_TURN' }); }}>
              {endArmed ? 'Press space to confirm ›' : 'End turn ›'}
            </button>
          )}
          <button className="btn warn" onClick={confirmNew}>↻ New game</button>
        </div>
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
          onSave={(names, colors, scores, mode) => { dispatch({ type: 'SAVE_SETTINGS', names, colors, scores, mode }); setSettingsOpen(false); }}
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
  names, colors, scores, mode, onSave, onClose,
}: {
  names: Record<Side, string>;
  colors: Record<Side, string>;
  scores: Scores;
  mode: GameMode;
  onSave: (names: Record<Side, string>, colors: Record<Side, string>, scores: Scores, mode: GameMode) => void;
  onClose: () => void;
}) {
  const [ng, setNg] = useState(names.g);
  const [np, setNp] = useState(names.p);
  const [cg, setCg] = useState(colors.g);
  const [cp, setCp] = useState(colors.p);
  const [md, setMd] = useState<GameMode>(mode);
  // keep both modes' scores as editable strings so switching the toggle doesn't lose edits
  const [sc, setSc] = useState<Record<GameMode, { g: string; p: string }>>({
    classic: { g: String(scores.classic.g), p: String(scores.classic.p) },
    erlex: { g: String(scores.erlex.g), p: String(scores.erlex.p) },
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
      },
      md,
    );

  return (
    <div className="overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card">
        <h2>Settings</h2>
        <div className="row">
          <label>Game mode</label>
          <div className="modepick">
            <button
              type="button"
              className={'modebtn' + (md === 'classic' ? ' on' : '')}
              onClick={() => setMd('classic')}
            >Classic</button>
            <button
              type="button"
              className={'modebtn' + (md === 'erlex' ? ' on' : '')}
              onClick={() => setMd('erlex')}
            >Erlex version 🦁</button>
          </div>
        </div>
        <div className="modehint">
          {md === 'erlex'
            ? 'Erlex version: checkers may also move backwards, and hitting a checker unleashes a lion strike.'
            : 'Classic backgammon rules.'}
        </div>
        <div className="row"><label>Player 1 name</label><input type="text" value={ng} onChange={(e) => setNg(e.target.value)} /></div>
        <div className="row"><label>Player 1 colour</label><input type="color" value={cg} onChange={(e) => setCg(e.target.value)} /></div>
        <div className="row"><label>Player 2 name</label><input type="text" value={np} onChange={(e) => setNp(e.target.value)} /></div>
        <div className="row"><label>Player 2 colour</label><input type="color" value={cp} onChange={(e) => setCp(e.target.value)} /></div>
        <div className="row">
          <label>Score <span className="scopetag">{md === 'erlex' ? 'Erlex 🦁' : 'Classic'}</span></label>
          <div className="scoreedit">
            <input type="number" inputMode="numeric" min={0} value={sc[md].g} onChange={(e) => setScore(md, 'g', e.target.value)} aria-label={`${ng} ${md} score`} />
            <span className="sep">–</span>
            <input type="number" inputMode="numeric" min={0} value={sc[md].p} onChange={(e) => setScore(md, 'p', e.target.value)} aria-label={`${np} ${md} score`} />
          </div>
        </div>
        <div className="cardbtns">
          <button className="btn" onClick={() => setSc((p) => ({ ...p, [md]: { g: '0', p: '0' } }))}>Reset {md === 'erlex' ? 'Erlex' : 'Classic'} score</button>
          <button className="btn primary" onClick={save}>Done</button>
        </div>
      </div>
    </div>
  );
}
