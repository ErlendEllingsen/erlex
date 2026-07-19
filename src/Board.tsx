import React from 'react';
import { Side, Src, BAR, OFF } from './engine';
import { AppState, Action, ClickTarget, movableSources } from './state';

function pos(point: number): { col: number; row: number } {
  if (point >= 13) {
    if (point <= 18) return { col: point - 12, row: 1 };
    return { col: point - 11, row: 1 };
  }
  if (point >= 7) return { col: 13 - point, row: 2 };
  return { col: 14 - point, row: 2 };
}

// grid position of a move source (the bar sits in the centre column)
function srcPos(src: Src): { col: number; row: number } {
  return src === BAR ? { col: 7, row: 1.5 } : pos(src + 1);
}

// The arrow drawn on a landing hint points the way the checker actually travels,
// from its source point to this destination — so it flips with the board's
// horseshoe layout instead of being a fixed glyph.
function travelArrow(from: { col: number; row: number }, destIndex: number): string {
  const to = pos(destIndex + 1);
  const dc = to.col - from.col;
  const dr = to.row - from.row;
  if (Math.abs(dc) >= Math.abs(dr)) return dc < 0 ? '←' : '→';
  return dr < 0 ? '↑' : '↓';
}

function Checkers({ side, count }: { side: Side; count: number }) {
  const show = Math.min(count, 5);
  return (
    <>
      {count > 5 && <div className="cnt">{count}</div>}
      {Array.from({ length: show }).map((_, n) => (
        <div key={n} className={`checker ${side}`} />
      ))}
    </>
  );
}

export default function Board({
  st,
  dispatch,
}: {
  st: AppState;
  dispatch: React.Dispatch<Action>;
}) {
  const g = st.game;
  const mov = movableSources(st);
  const hlSet = new Set(
    st.highlights.filter((h) => h.to !== OFF).map((h) => h.to as number),
  );
  const hitSet = new Set(
    st.highlights.filter((h) => h.hit).map((h) => h.to as number),
  );
  // Erlex backward moves land here — shown in a distinct colour. A point that is
  // only reachable by moving backwards gets the 'back' hint; if it's also a
  // forward destination we keep the (clearer) forward hint.
  const fwdSet = new Set(
    st.highlights.filter((h) => h.to !== OFF && h.dir === 'fwd').map((h) => h.to as number),
  );
  const backSet = new Set(
    st.highlights
      .filter((h) => h.to !== OFF && h.dir === 'back' && !fwdSet.has(h.to as number))
      .map((h) => h.to as number),
  );
  const from = st.selected === null ? null : srcPos(st.selected);
  const offHL = st.highlights.some((h) => h.to === OFF);
  const click = (target: ClickTarget) => dispatch({ type: 'CLICK', target });

  const points = [];
  for (let point = 1; point <= 24; point++) {
    const i = point - 1;
    const p = pos(point);
    const top = point >= 13;
    const shade = (p.col + p.row) % 2 === 0 ? 'a' : 'b';
    const owner: Side | null = g.board[i] > 0 ? 'g' : g.board[i] < 0 ? 'p' : null;
    const count = Math.abs(g.board[i]);
    const cls = ['point', top ? 'top' : 'bottom', shade];
    if (mov.has(i)) cls.push('movable');
    if (st.selected === i) cls.push('sel');
    points.push(
      <div
        key={point}
        className={cls.join(' ')}
        style={{ gridColumn: p.col, gridRow: p.row }}
        onClick={() => click({ kind: 'point', i })}
      >
        {hlSet.has(i) && (
          <div className={`land ${hitSet.has(i) ? 'hit' : ''} ${backSet.has(i) ? 'back' : 'fwd'}`}>
            {from && <span className="dirmark">{travelArrow(from, i)}</span>}
          </div>
        )}
        <div className="stack">{owner && <Checkers side={owner} count={count} />}</div>
      </div>,
    );
  }

  return (
    <div className="board">
      <div className="field" style={{ gridColumn: '1 / 7', gridRow: 1 }} />
      <div className="field" style={{ gridColumn: '8 / 14', gridRow: 1 }} />
      <div className="field" style={{ gridColumn: '1 / 7', gridRow: 2 }} />
      <div className="field" style={{ gridColumn: '8 / 14', gridRow: 2 }} />

      {points}

      <div className="bar">
        <div
          className={
            'barhalf top' +
            (st.selected === 'bar' && g.turn === 'p' ? ' sel' : '') +
            (mov.has('bar') && g.turn === 'p' ? ' movable' : '')
          }
          onClick={() => click({ kind: 'bar', side: 'p' })}
        >
          <span className="barlabel">ERLEX</span>
          <Checkers side="p" count={g.bar.p} />
        </div>
        <div
          className={
            'barhalf bottom' +
            (st.selected === 'bar' && g.turn === 'g' ? ' sel' : '') +
            (mov.has('bar') && g.turn === 'g' ? ' movable' : '')
          }
          onClick={() => click({ kind: 'bar', side: 'g' })}
        >
          <Checkers side="g" count={g.bar.g} />
        </div>
      </div>

      <div className="offtray">
        <div
          className={'offhalf' + (offHL && g.turn === 'p' ? ' hl' : '')}
          onClick={() => click({ kind: 'off', side: 'p' })}
        >
          <div className="offbar p" />
          <div className="num pc">{g.off.p}</div>
          <div className="lab">{st.names.p} off</div>
        </div>
        <div
          className={'offhalf' + (offHL && g.turn === 'g' ? ' hl' : '')}
          onClick={() => click({ kind: 'off', side: 'g' })}
        >
          <div className="lab">{st.names.g} off</div>
          <div className="num gc">{g.off.g}</div>
          <div className="offbar g" />
        </div>
      </div>
    </div>
  );
}
