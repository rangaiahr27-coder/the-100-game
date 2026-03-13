import React from 'react';
import './GameOver.css';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function GameOver({ room, myId }) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const isWinner = winner?.id === myId;
  const totalRounds = room.totalRounds;

  return (
    <div className="game-over">
      <div className="go-hero">
        <div className="go-trophy">{isWinner ? '🏆' : '⚾'}</div>
        <h1 className="go-title">{isWinner ? 'You Won!' : `${winner?.name} Wins!`}</h1>
        <p className="go-subtitle">Game Over — Final Standings</p>
      </div>

      <div className="go-podium">
        {sorted.slice(0, 3).map((p, i) => (
          <div key={p.id} className={`go-podium-entry ${i === 0 ? 'go-podium-entry--first' : ''}`}>
            <span className="go-medal">{MEDALS[i] ?? `#${i + 1}`}</span>
            <span className="go-podium-name">
              {p.name}
              {p.id === myId && <span className="go-you"> (you)</span>}
            </span>
            <span className="go-podium-score">{p.score} pts</span>
          </div>
        ))}
      </div>

      {/* Full breakdown */}
      <div className="go-breakdown">
        <h2 className="go-section-title">Full Game History</h2>
        {sorted.map((p, rank) => (
          <div key={p.id} className={`go-player-card card ${p.id === myId ? 'go-player-card--me' : ''}`}>
            <div className="go-player-header">
              <span className="go-player-rank">{MEDALS[rank] ?? `#${rank + 1}`}</span>
              <span className="go-player-avatar">{p.name[0].toUpperCase()}</span>
              <span className="go-player-name">
                {p.name}
                {p.id === myId && <span className="go-you"> (you)</span>}
              </span>
              <span className="go-total-score">{p.score} pts</span>
            </div>
            <div className="go-rounds">
              {p.roundScores.map((rs, i) => (
                <div key={i} className="go-round-chip">
                  <span className="go-round-label">R{i + 1}</span>
                  <span className="go-round-score">{rs}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="go-thanks">Thanks for playing The 100 Game! Refresh to start a new game.</p>
    </div>
  );
}
