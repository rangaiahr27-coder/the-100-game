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
        <h1 className="lobby-title">The 100 Game</h1>
        <p className="lobby-subtitle">Waiting for players…</p>
      </div>

      <div className="lobby-code-card card">
        <p className="label">Room Code — share this with friends</p>
        <div className="lobby-code">{room.roomCode}</div>
      </div>

      <div className="card lobby-players-card">
        <p className="label">Players ({room.players.length})</p>
        <ul className="lobby-players">
          {room.players.map(p => (
            <li key={p.id} className="lobby-player">
              <span className="player-avatar">{p.name[0].toUpperCase()}</span>
              <span className="player-name">{p.name}</span>
              {p.id === room.hostId && <span className="badge badge-blue">Host</span>}
              {p.id === myId && <span className="badge badge-yellow">You</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="lobby-info card">
        <h3>Game Info</h3>
        <ul>
          <li><strong>5 rounds</strong> — each round has a different stat &amp; timeframe</li>
          <li><strong>1 guess</strong> per player per round — make it count</li>
          <li>Rank #100 = <strong>100 pts</strong> (hardest to get, highest reward)</li>
          <li>Outside top 100 = <strong>0 pts</strong></li>
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
