import React from 'react';
import './Scoreboard.css';

export default function Scoreboard({ players, currentPlayerId, myId }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="scoreboard">
      <h3 className="scoreboard-title">Scoreboard</h3>
      <ul className="scoreboard-list">
        {sorted.map((p, i) => (
          <li
            key={p.id}
            className={[
              'scoreboard-row',
              p.id === currentPlayerId ? 'scoreboard-row--active' : '',
              p.id === myId ? 'scoreboard-row--me' : '',
            ].join(' ')}
          >
            <span className="sb-rank">#{i + 1}</span>
            <span className="sb-avatar">{p.name[0].toUpperCase()}</span>
            <span className="sb-name">
              {p.name}
              {p.id === myId && <span className="sb-you"> (you)</span>}
            </span>
            {p.id === currentPlayerId && <span className="sb-turn-dot" title="Currently guessing" />}
            <span className="sb-score">{p.score}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
