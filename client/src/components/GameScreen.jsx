import React, { useState } from 'react';
import Scoreboard from './Scoreboard';
import GuessInput from './GuessInput';
import GuessLog from './GuessLog';
import './GameScreen.css';

export default function GameScreen({ room, myId, socket }) {
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const isMyTurn = room.currentPlayerId === myId;
  const currentPlayerName = room.players.find(p => p.id === room.currentPlayerId)?.name ?? '…';
  const { category, timeframe } = room.currentChallenge;
  // Filter across ALL rounds — prevents picking already-guessed players
  const allGuessedNames = room.allGuessedNames || [];

  function handleSubmit(name) {
    if (submitting) return;
    setSubmitError('');
    setLastResult(null);
    setSubmitting(true);
    socket.emit('submitGuess', { guessedName: name }, (res) => {
      setSubmitting(false);
      if (res.error) {
        setSubmitError(res.error);
        return;
      }
      setLastResult(res.guess);
    });
  }

  return (
    <div className="game-screen">
      {/* ── Left column ── */}
      <div className="game-main">
        {/* Challenge card */}
        <div className="challenge-card card">
          <div className="challenge-round">Round {room.round} / {room.totalRounds}</div>
          <div className="challenge-stat">{category.label}</div>
          <div className="challenge-era">{timeframe.label}</div>
          <div className="challenge-hint">
            Weighted {category.display} · {timeframe.label} · Top 100 earns points
          </div>
        </div>

        {/* Turn indicator */}
        <div className={`turn-banner ${isMyTurn ? 'turn-banner--mine' : ''}`}>
          {isMyTurn ? (
            <>
              <span className="turn-dot" />
              <span><strong>Your turn</strong> — one guess this round</span>
            </>
          ) : (
            <>
              <span className="turn-dot turn-dot--other" />
              <span><strong>{currentPlayerName}</strong> is guessing…</span>
            </>
          )}
        </div>

        {/* Guess input */}
        {isMyTurn && (
          <div className="guess-section">
            <GuessInput
              onSubmit={handleSubmit}
              disabled={submitting}
              allGuessedNames={allGuessedNames}
            />
            {submitError && <p className="guess-error">{submitError}</p>}
          </div>
        )}

        {/* Last result flash */}
        {lastResult && (
          <div className={`result-flash ${lastResult.points > 0 ? 'result-flash--hit' : 'result-flash--miss'}`}>
            {lastResult.points > 0 ? (
              <>
                <span className="result-icon">✓</span>
                <span>
                  <strong>{lastResult.guessedName}</strong>
                  {' — '}Rank #{lastResult.rank}
                  {lastResult.statValue !== null && ` — ${lastResult.statValue} ${category.display}`}
                  {' — '}+{lastResult.points} pts
                </span>
              </>
            ) : lastResult.rank ? (
              <>
                <span className="result-icon">✗</span>
                <span>
                  <strong>{lastResult.guessedName}</strong>
                  {' — '}Rank #{lastResult.rank}
                  {lastResult.statValue !== null && ` — ${lastResult.statValue} ${category.display}`}
                  {' — '}0 pts
                </span>
              </>
            ) : (
              <>
                <span className="result-icon">✗</span>
                <span><strong>{lastResult.guessedName}</strong> — Not ranked — 0 pts</span>
              </>
            )}
          </div>
        )}

        {/* Guess log */}
        <div className="card guess-log-card">
          <h3 className="label" style={{ marginBottom: 10 }}>Guesses This Round</h3>
          <GuessLog guesses={room.guessesThisRound} players={room.players} category={category} />
        </div>
      </div>

      {/* ── Right column: scoreboard ── */}
      <div className="game-sidebar">
        <Scoreboard
          players={room.players}
          currentPlayerId={room.currentPlayerId}
          myId={myId}
        />

        <div className="card turn-order-card">
          <h3 className="label" style={{ marginBottom: 10 }}>Turn Order</h3>
          <ol className="turn-order-list">
            {room.turnOrder.map((pid, i) => {
              const p = room.players.find(pl => pl.id === pid);
              const isCurrent = i === room.turnIndex;
              return (
                <li key={pid} className={`turn-order-item ${isCurrent ? 'turn-order-item--active' : ''}`}>
                  <span className="to-num">{i + 1}</span>
                  <span className="to-name">{p?.name ?? '?'}</span>
                  {isCurrent && <span className="to-arrow">◀</span>}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
