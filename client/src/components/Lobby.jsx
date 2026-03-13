import React from 'react';
import './Lobby.css';

export default function Lobby({ room, myId, socket }) {
  const isHost = room.hostId === myId;

  function handleStart() {
    socket.emit('startGame', {}, (res) => {
      if (res?.error) alert(res.error);
    });
  }

  return (
    <div className="lobby">
      <div className="lobby-header">
        <div className="lobby-logo">⚾</div>
        <h1 className="lobby-title">THE 100 GAME</h1>
        <p className="lobby-subtitle">Waiting for players…</p>
      </div>

      <div className="lobby-code-card card">
        <p className="label">Room Code — share with friends</p>
        <div className="lobby-code">{room.roomCode}</div>
        <p className="lobby-code-hint">Players enter this code to join</p>
      </div>

      <div className="card lobby-players-card">
        <p className="label">Players ({room.players.length})</p>
        <ul className="lobby-players">
          {room.players.map(p => (
            <li key={p.id} className="lobby-player">
              <span className="player-avatar">{p.name[0].toUpperCase()}</span>
              <span className="player-name">{p.name}</span>
              {p.id === room.hostId && <span className="badge badge-green">Host</span>}
              {p.id === myId && <span className="badge badge-yellow">You</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="lobby-info card">
        <h3 className="label">Game Rules</h3>
        <ul>
          <li><strong>5 rounds</strong> — same stat &amp; timeframe all game</li>
          <li><strong>1 guess</strong> per player per round</li>
          <li>No duplicate picks — once a player is guessed, they're gone</li>
          <li>Rank #100 = <strong>100 pts</strong> &bull; Outside top 100 = <strong>0 pts</strong></li>
        </ul>
      </div>

      {isHost ? (
        <button
          className="btn btn-green btn-large lobby-start"
          disabled={room.players.length < 1}
          onClick={handleStart}
        >
          Start Game
        </button>
      ) : (
        <p className="lobby-waiting">Waiting for the host to start…</p>
      )}
    </div>
  );
}
