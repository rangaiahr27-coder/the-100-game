import React, { useState } from 'react';
import './GameOver.css';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function GameOver({ room, myId }) {
  const [expanded, setExpanded] = useState(null);
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const isWinner = winner?.id === myId;
  const challenge = room.currentChallenge;

  // Build per-player guess history from allGuessesByRound
  const allRounds = room.allGuessesByRound || [];

  return (
    <div className="game-over">
      <div className="go-hero">
        <div className="go-trophy">{isWinner ? '🏆' : '⚾'}</div>
        <h1 className="go-title">GAME OVER</h1>
        <p className="go-winner">{isWinner ? 'You Win!' : `${winner?.name} Wins!`}</p>
        {challenge && (
          <p className="go-challenge-recap">
            {challenge.category.label} · {challenge.timeframe.label}
          </p>
        )}
      </div>

      {/* Podium */}
      <div className="go-podium">
        {sorted.slice(0, 3).map((p, i) => (
          <div key={p.id} className={`go-podium-entry ${i === 0 ? 'go-podium-entry--first' : ''}`}>
            <span className="go-medal">{MEDALS[i] ?? `#${i + 1}`}</span>
            <span className="go-podium-name">
              {p.name}
              {p.id === myId && <span className="go-you"> (you)</span>}
            </span>
            <span className="go-podium-score">{p.score}</span>
          </div>
        ))}
      </div>

      {/* Full breakdown */}
      <div className="go-breakdown">
        <h2 className="go-section-title label">Full Game History</h2>

        {sorted.map((p, rank) => {
          const isOpen = expanded === p.id;
          // Collect all guesses by this player across all rounds
          const guessesByRound = allRounds.map(roundGuesses =>
            roundGuesses.filter(g => g.playerId === p.id)
          );

          return (
            <div key={p.id} className={`go-player-card card ${p.id === myId ? 'go-player-card--me' : ''}`}>
              <div className="go-player-header" onClick={() => setExpanded(isOpen ? null : p.id)}>
                <span className="go-player-rank">{MEDALS[rank] ?? `#${rank + 1}`}</span>
                <span className="go-player-avatar">{p.name[0].toUpperCase()}</span>
                <span className="go-player-name">
                  {p.name}
                  {p.id === myId && <span className="go-you"> (you)</span>}
                </span>
                <span className="go-total-score">{p.score} pts</span>
                <span className="go-expand">{isOpen ? '▲' : '▼'}</span>
              </div>

              {/* Round score chips */}
              <div className="go-rounds">
                {p.roundScores.map((rs, i) => (
                  <div key={i} className="go-round-chip">
                    <span className="go-round-label">R{i + 1}</span>
                    <span className="go-round-score">{rs}</span>
                  </div>
                ))}
              </div>

              {/* Expanded: per-round guess details */}
              {isOpen && (
                <div className="go-guess-history">
                  {guessesByRound.map((guesses, ri) => (
                    <div key={ri} className="go-round-section">
                      <span className="go-round-header">Round {ri + 1}</span>
                      {guesses.length === 0 ? (
                        <span className="go-no-guess">No guess</span>
                      ) : (
                        guesses.map((g, gi) => (
                          <div key={gi} className={`go-guess-row ${g.points > 0 ? 'go-guess-row--hit' : 'go-guess-row--miss'}`}>
                            <span className="go-guess-player">{g.guessedName}</span>
                            {g.rank ? (
                              <span className="go-guess-stat">
                                Rank #{g.rank}
                                {g.statValue !== null && ` · ${g.statValue}${challenge ? ' ' + challenge.category.display : ''}`}
                              </span>
                            ) : (
                              <span className="go-guess-stat go-guess-stat--miss">Not ranked</span>
                            )}
                            <span className={`go-guess-pts ${g.points > 0 ? 'go-guess-pts--hit' : ''}`}>
                              {g.points > 0 ? `+${g.points}` : '0'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="go-thanks">Thanks for playing · Refresh to start a new game</p>
    </div>
  );
}
