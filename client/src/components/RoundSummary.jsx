import React from 'react';
import './RoundSummary.css';

export default function RoundSummary({ room, myId, socket }) {
  const isHost = room.hostId === myId;
  const { category, timeframe } = room.currentChallenge;

  // Group guesses by player
  const byPlayer = {};
  room.players.forEach(p => { byPlayer[p.id] = []; });
  room.guessesThisRound.forEach(g => {
    if (byPlayer[g.playerId]) byPlayer[g.playerId].push(g);
  });

  // Compute round scores (last entry in roundScores array)
  const roundScores = {};
  room.players.forEach(p => {
    roundScores[p.id] = p.roundScores[p.roundScores.length - 1] ?? 0;
  });

  const sorted = [...room.players].sort((a, b) => (roundScores[b.id] ?? 0) - (roundScores[a.id] ?? 0));

  function handleNext() {
    socket.emit('nextRound', {}, (res) => {
      if (res?.error) alert(res.error);
    });
  }

  return (
    <div className="round-summary">
      <div className="rs-header card">
        <div className="rs-round-label">Round {room.round} Complete</div>
        <div className="rs-challenge">
          <span className="rs-stat">{category.label}</span>
          <span className="rs-era">{timeframe.label}</span>
        </div>
      </div>

      <div className="rs-players">
        {sorted.map((p, rank) => (
          <div key={p.id} className={`rs-player-card card ${p.id === myId ? 'rs-player-card--me' : ''}`}>
            <div className="rs-player-header">
              <span className="rs-rank-badge">#{rank + 1}</span>
              <span className="rs-avatar">{p.name[0].toUpperCase()}</span>
              <div className="rs-player-info">
                <span className="rs-player-name">
                  {p.name}
                  {p.id === myId && <span className="rs-you"> (you)</span>}
                </span>
                <span className="rs-player-total">Total: {p.score} pts</span>
              </div>
              <div className="rs-round-score">
                <span className="rs-round-pts">{roundScores[p.id] ?? 0}</span>
                <span className="rs-round-pts-label">this round</span>
              </div>
            </div>

            <ul className="rs-guesses">
              {byPlayer[p.id]?.length === 0 && (
                <li className="rs-guess-empty">No guesses</li>
              )}
              {byPlayer[p.id]?.map((g, i) => (
                <li key={i} className={`rs-guess ${g.points > 0 ? 'rs-guess--hit' : 'rs-guess--miss'}`}>
                  <span className="rs-guess-name">{g.guessedName}</span>
                  {g.rank ? (
                    <span className="rs-guess-rank">#{g.rank}{g.statValue !== null ? ` (${g.statValue})` : ''}</span>
                  ) : (
                    <span className="rs-guess-rank rs-guess-rank--miss">Not in top 100</span>
                  )}
                  <span className={`rs-guess-pts ${g.points > 0 ? 'rs-guess-pts--hit' : ''}`}>
                    {g.points > 0 ? `+${g.points}` : '0'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {isHost ? (
        <button className="btn btn-primary btn-large rs-next-btn" onClick={handleNext}>
          Next Round →
        </button>
      ) : (
        <p className="rs-waiting">Waiting for host to start next round…</p>
      )}
    </div>
  );
}
