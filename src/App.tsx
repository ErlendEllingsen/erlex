import { useEffect, useReducer, useRef, useState } from 'react';
import { Side, pipCount } from './engine';
import {
  reducer, loadInitial, persist, diceDisplay, canEnd,
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
  const cheatRef = useRef(false); // source of truth read by roll()
  const cheatBuf = useRef('');    // rolling buffer for the secret sequence
  const g = st.game;

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
        cheatRef.current = true;
        setCheatArmed(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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
  } else {
    banner = <><span className={`who ${wcls}`}>{st.names[g.turn]}</span> to move</>;
  }

  return (
    <>
      <div className="wrap">
        <header>
          <div className="brand">
            <h1>ERLEX{cheatArmed && !g.rolled && <span className="lucky" title="Loaded dice">🍀</span>}</h1>
            <small>Backgammon · Limited Edition</small>
          </div>
          <div className="score">
            <span className="dot gc" />
            <span>{st.names.g}</span>
            <span className="s">{st.scores.g}</span>
            <span style={{ color: 'var(--dim)' }}>–</span>
            <span className="s">{st.scores.p}</span>
            <span>{st.names.p}</span>
            <span className="dot pc" />
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

      {settingsOpen && (
        <Settings
          key={String(settingsOpen)}
          names={st.names}
          colors={st.colors}
          onSave={(names, colors) => { dispatch({ type: 'SAVE_SETTINGS', names, colors }); setSettingsOpen(false); }}
          onResetScores={() => dispatch({ type: 'RESET_SCORES' })}
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
  names, colors, onSave, onResetScores, onClose,
}: {
  names: Record<Side, string>;
  colors: Record<Side, string>;
  onSave: (names: Record<Side, string>, colors: Record<Side, string>) => void;
  onResetScores: () => void;
  onClose: () => void;
}) {
  const [ng, setNg] = useState(names.g);
  const [np, setNp] = useState(names.p);
  const [cg, setCg] = useState(colors.g);
  const [cp, setCp] = useState(colors.p);

  const save = () =>
    onSave(
      { g: ng.trim() || 'Player 1', p: np.trim() || 'Player 2' },
      { g: cg, p: cp },
    );

  return (
    <div className="overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card">
        <h2>Settings</h2>
        <div className="row"><label>Player 1 name</label><input type="text" value={ng} onChange={(e) => setNg(e.target.value)} /></div>
        <div className="row"><label>Player 1 colour</label><input type="color" value={cg} onChange={(e) => setCg(e.target.value)} /></div>
        <div className="row"><label>Player 2 name</label><input type="text" value={np} onChange={(e) => setNp(e.target.value)} /></div>
        <div className="row"><label>Player 2 colour</label><input type="color" value={cp} onChange={(e) => setCp(e.target.value)} /></div>
        <div className="cardbtns">
          <button className="btn" onClick={onResetScores}>Reset scores</button>
          <button className="btn primary" onClick={save}>Done</button>
        </div>
      </div>
    </div>
  );
}
