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
  const guessedNames = room.guessesThisRound.map(g => g.guessedName.toLowerCase());

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
      const g = res.guess;
      setLastResult(g);
    });
  }

  return (
    <div className="game-screen">
      {/* ── Left column: challenge + guess input + log ── */}
      <div className="game-main">
        {/* Challenge banner */}
        <div className="challenge-card card">
          <div className="challenge-round">Round {room.round} / {room.totalRounds}</div>
          <div className="challenge-stat">{category.label}</div>
          <div className="challenge-era">{timeframe.label}</div>
          <div className="challenge-hint">
            Name a player who ranks in the top 100 for <strong>{category.display}</strong> — <strong>{timeframe.label}</strong>.
            Each player gets one guess. Rank #100 = 100 pts &bull; Rank #1 = 1 pt &bull; Outside top 100 = 0 pts
          </div>
        </div>

        {/* Turn indicator */}
        <div className={`turn-banner ${isMyTurn ? 'turn-banner--mine' : ''}`}>
          {isMyTurn ? (
            <>
              <span className="turn-dot" />
              <span><strong>Your turn!</strong> Make your one guess for this round</span>
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
              disabled={submitting || !isMyTurn}
              guessedNames={guessedNames}
            />
            {submitError && <p className="guess-error">{submitError}</p>}
          </div>
        )}

        {/* Last result flash */}
        {lastResult && (
          <div className={`result-flash ${lastResult.points > 0 ? 'result-flash--hit' : 'result-flash--miss'}`}>
            {lastResult.points > 0 ? (
              <>
                <span className="result-flash-icon">✓</span>
                <span>
                  <strong>{lastResult.guessedName}</strong> is #{lastResult.rank}!{' '}
                  {lastResult.statValue !== null && `(${lastResult.statValue}) `}
                  +{lastResult.points} pts
                </span>
              </>
            ) : (
              <>
                <span className="result-flash-icon">✗</span>
                <span><strong>{lastResult.guessedName}</strong> is not in the top 100 — 0 pts</span>
              </>
            )}
          </div>
        )}

        {/* Guess log */}
        <div className="card guess-log-card">
          <h3 className="label" style={{ marginBottom: 10 }}>Guesses This Round</h3>
          <GuessLog guesses={room.guessesThisRound} players={room.players} />
        </div>
      </div>

      {/* ── Right column: scoreboard ── */}
      <div className="game-sidebar">
        <Scoreboard
          players={room.players}
          currentPlayerId={room.currentPlayerId}
          myId={myId}
        />

        {/* Turn order */}
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
