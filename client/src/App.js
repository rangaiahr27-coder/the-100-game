import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import HomeScreen from './components/HomeScreen';
import Lobby from './components/Lobby';
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

      // Attempt to restore session on (re)connect
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        try {
          const { roomCode, playerName } = JSON.parse(stored);
          socket.emit('rejoinRoom', { roomCode, playerName }, (res) => {
            if (res.error) {
              localStorage.removeItem(SESSION_KEY);
            } else {
              setRoom(res.room);
            }
          });
        } catch {
          localStorage.removeItem(SESSION_KEY);
        }
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('roomUpdated', setRoom);
    socket.on('gameLoading', ({ message }) => setLoadingMsg(message));
    socket.on('roundStarted', (updatedRoom) => { setLoadingMsg(''); setRoom(updatedRoom); });
    socket.on('guessResult', ({ room: updatedRoom }) => setRoom(updatedRoom));
    socket.on('turnChanged', setRoom);
    socket.on('roundEnded', setRoom);
    socket.on('gameError', ({ message }) => { setLoadingMsg(''); alert(`Error: ${message}`); });

    return () => socket.disconnect();
  }, []);

  function handleRoomJoined(roomData, playerName) {
    setRoom(roomData);
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      roomCode: roomData.roomCode,
      playerName,
    }));
  }

  const socket = socketRef.current;

  if (!socket) return <LoadingScreen message="Initializing…" />;
  if (!connected) return <LoadingScreen message="Connecting to server…" />;
  if (!room) return <HomeScreen socket={socket} onRoomJoined={handleRoomJoined} />;
  if (loadingMsg) return <LoadingScreen message={loadingMsg} />;
  if (room.state === 'lobby') return <Lobby room={room} myId={myId} socket={socket} />;
  if (room.state === 'playing') return <GameScreen room={room} myId={myId} socket={socket} />;
  if (room.state === 'roundSummary') return <RoundSummary room={room} myId={myId} socket={socket} />;
  if (room.state === 'gameOver') return <GameOver room={room} myId={myId} />;

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
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 16px;
          background: var(--bg);
        }
        .loading-logo { font-size: 48px; filter: drop-shadow(0 0 16px rgba(57,255,20,0.5)); }
        .loading-msg { color: var(--text-muted); font-size: 14px; letter-spacing: 0.05em; text-transform: uppercase; }
        .loading-spinner {
          width: 32px; height: 32px;
          border: 2px solid var(--border);
          border-top-color: var(--neon);
          border-radius: 50%;
          box-shadow: 0 0 8px rgba(57,255,20,0.3);
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
