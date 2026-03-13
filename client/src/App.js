import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import HomeScreen from './components/HomeScreen';
import Lobby from './components/Lobby';
import SetupScreen from './components/SetupScreen';
import GameScreen from './components/GameScreen';
import RoundSummary from './components/RoundSummary';
import GameOver from './components/GameOver';

const SOCKET_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';
const SESSION_KEY = 'the100-session';

export default function App() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [myId, setMyId] = useState(null);
  const [room, setRoom] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState('');

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setMyId(socket.id);
      // Attempt session restore on (re)connect
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        try {
          const { roomCode, playerName } = JSON.parse(stored);
          socket.emit('rejoinRoom', { roomCode, playerName }, (res) => {
            if (res.error) localStorage.removeItem(SESSION_KEY);
            else setRoom(res.room);
          });
        } catch { localStorage.removeItem(SESSION_KEY); }
      }
    });

    socket.on('disconnect', () => setConnected(false));
    socket.on('roomUpdated', setRoom);
    socket.on('setupStarted', setRoom);
    socket.on('gameLoading', ({ message }) => setLoadingMsg(message));
    socket.on('roundStarted', (r) => { setLoadingMsg(''); setRoom(r); });
    socket.on('guessResult', ({ room: r }) => setRoom(r));
    socket.on('turnChanged', setRoom);
    socket.on('roundEnded', setRoom);
    socket.on('gameError', ({ message }) => { setLoadingMsg(''); alert(`Error: ${message}`); });

    return () => socket.disconnect();
  }, []);

  function handleRoomJoined(roomData, playerName) {
    setRoom(roomData);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode: roomData.roomCode, playerName }));
  }

  function handleLeave() {
    socket.emit('leaveRoom', {}, () => {});
    localStorage.removeItem(SESSION_KEY);
    setRoom(null);
  }

  const socket = socketRef.current;
  if (!socket) return <LoadingScreen message="Initializing…" />;
  if (!connected) return <LoadingScreen message="Connecting…" />;
  if (!room) return <HomeScreen socket={socket} onRoomJoined={handleRoomJoined} />;
  if (loadingMsg) return <LoadingScreen message={loadingMsg} />;
  if (room.state === 'lobby') return <Lobby room={room} myId={myId} socket={socket} />;
  if (room.state === 'setup') return <SetupScreen room={room} myId={myId} socket={socket} />;
  if (room.state === 'playing') return <GameScreen room={room} myId={myId} socket={socket} />;
  if (room.state === 'roundSummary') return <RoundSummary room={room} myId={myId} socket={socket} />;
  if (room.state === 'gameOver') return <GameOver room={room} myId={myId} onLeave={handleLeave} />;
  return <LoadingScreen message="Loading…" />;
}

function LoadingScreen({ message }) {
  return (
    <div className="loading-screen">
      <div className="loading-logo">⚾</div>
      <p className="loading-msg">{message}</p>
      <div className="loading-spinner" />
      <style>{`
        .loading-screen {
          min-height: 100dvh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 16px; padding: 16px;
          background: var(--bg);
        }
        .loading-logo { font-size: 48px; }
        .loading-msg { color: var(--text-muted); font-size: 15px; font-weight: 600; }
        .loading-spinner {
          width: 32px; height: 32px;
          border: 3px solid var(--border);
          border-top-color: var(--red);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
