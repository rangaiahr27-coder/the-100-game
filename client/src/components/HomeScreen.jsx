import React, { useState } from 'react';
import './HomeScreen.css';

export default function HomeScreen({ socket, onRoomJoined }) {
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleCreate(e) {
    e.preventDefault();
    if (!playerName.trim()) return setError('Enter your name');
    setLoading(true);
    setError('');
    socket.emit('createRoom', { playerName: playerName.trim() }, (res) => {
      setLoading(false);
      if (res.error) return setError(res.error);
      onRoomJoined(res.room, socket.id, true);
    });
  }

  function handleJoin(e) {
    e.preventDefault();
    if (!playerName.trim()) return setError('Enter your name');
    if (!roomCode.trim()) return setError('Enter a room code');
    setLoading(true);
    setError('');
    socket.emit('joinRoom', { roomCode: roomCode.trim().toUpperCase(), playerName: playerName.trim() }, (res) => {
      setLoading(false);
      if (res.error) return setError(res.error);
      onRoomJoined(res.room, socket.id, false);
    });
  }

  return (
    <div className="home-screen">
      <div className="home-hero">
        <div className="home-logo">⚾</div>
        <h1 className="home-title">The 100 Game</h1>
        <p className="home-subtitle">
          Inspired by <em>Talkin' Baseball</em> — guess players who rank in the top 100 for a stat &amp; era
        </p>
      </div>

      {!mode && (
        <div className="home-actions">
          <button className="btn btn-primary btn-large" onClick={() => setMode('create')}>
            Create Session
          </button>
          <button className="btn btn-secondary btn-large" onClick={() => setMode('join')}>
            Join Session
          </button>
        </div>
      )}

      {mode && (
        <form className="home-form card" onSubmit={mode === 'create' ? handleCreate : handleJoin}>
          <h2 className="form-title">{mode === 'create' ? 'Create a Room' : 'Join a Room'}</h2>

          <div className="form-group">
            <label className="label" htmlFor="player-name-input">Your Name</label>
            <input
              id="player-name-input"
              className="input"
              placeholder="e.g. Derek Jeter"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              maxLength={24}
              autoComplete="nickname"
              autoCapitalize="words"
              enterKeyHint={mode === 'create' ? 'done' : 'next'}
              autoFocus
            />
          </div>

          {mode === 'join' && (
            <div className="form-group">
              <label className="label" htmlFor="room-code-input">Room Code</label>
              <input
                id="room-code-input"
                className="input input-code"
                placeholder="e.g. AB3K"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                maxLength={4}
                autoComplete="off"
                autoCapitalize="characters"
                inputMode="text"
                enterKeyHint="go"
              />
            </div>
          )}

          {error && <p className="form-error">{error}</p>}

          <div className="form-buttons">
            <button type="button" className="btn btn-secondary" onClick={() => { setMode(null); setError(''); }}>
              Back
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Connecting…' : mode === 'create' ? 'Create Room' : 'Join Room'}
            </button>
          </div>
        </form>
      )}

      <div className="home-rules card">
        <h3>How to Play</h3>
        <ul>
          <li>A random MLB stat category &amp; multi-year timeframe is revealed</li>
          <li>Each player gets <strong>one guess</strong> per round — choose wisely</li>
          <li>Your rank = your points (rank #73 → 73 pts, rank #1 → 1 pt)</li>
          <li>Outside top 100 = <strong>0 points</strong></li>
          <li>After everyone guesses, a new stat &amp; timeframe is revealed</li>
          <li>Highest cumulative score after <strong>5 rounds</strong> wins</li>
        </ul>
      </div>
    </div>
  );
}
