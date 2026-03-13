import React from 'react';
import './GuessLog.css';

export default function GuessLog({ guesses, players }) {
  // Build a quick name lookup
  const nameMap = {};
  players.forEach(p => { nameMap[p.id] = p.name; });

  if (guesses.length === 0) {
    return (
      <div className="guess-log">
        <p className="guess-log-empty">No guesses yet this round</p>
      </div>
    );
  }

  return (
    <div className="guess-log">
      <ul className="guess-log-list">
        {[...guesses].reverse().map((g, i) => (
          <li key={i} className={`guess-log-item ${g.points > 0 ? 'guess-log-item--hit' : 'guess-log-item--miss'}`}>
            <span className="gl-avatar">{g.playerName[0]?.toUpperCase()}</span>
            <div className="gl-body">
              <span className="gl-who">{g.playerName}</span>
              <span className="gl-guessed"> guessed </span>
              <span className="gl-name">{g.guessedName}</span>
              {g.rank && (
                <span className="gl-stat">
                  {' '}— #{g.rank}
                  {g.statValue !== null && ` (${g.statValue})`}
                </span>
              )}
            </div>
            <span className={`gl-points ${g.points > 0 ? 'gl-points--hit' : 'gl-points--miss'}`}>
              {g.points > 0 ? `+${g.points}` : '0'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
