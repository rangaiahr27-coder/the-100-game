import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import HomeScreen from './components/HomeScreen';
import Lobby from './components/Lobby';
import GameScreen from './components/GameScreen';
import RoundSummary from './components/RoundSummary';
import GameOver from './components/GameOver';

const SOCKET_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';

export default function App() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [myId, setMyId] = useState(null);
  const [room, setRoom] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState('');

  // Initialize socket once
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setMyId(socket.id);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    // Room/game events
    socket.on('roomUpdated', (updatedRoom) => {
      setRoom(updatedRoom);
    });

    socket.on('gameLoading', ({ message }) => {
      setLoadingMsg(message);
    });

    socket.on('roundStarted', (updatedRoom) => {
      setLoadingMsg('');
      setRoom(updatedRoom);
    });

    socket.on('guessResult', ({ room: updatedRoom }) => {
      setRoom(updatedRoom);
    });

    socket.on('turnChanged', (updatedRoom) => {
      setRoom(updatedRoom);
    });

    socket.on('roundEnded', (updatedRoom) => {
      setRoom(updatedRoom);
    });

    socket.on('gameError', ({ message }) => {
      setLoadingMsg('');
      alert(`Error: ${message}`);
    });

    return () => socket.disconnect();
  }, []);

  function handleRoomJoined(roomData, socketId, isHost) {
    setRoom(roomData);
  }

  const socket = socketRef.current;

  if (!socket) {
    return <LoadingScreen message="Initializing…" />;
  }

  if (!connected) {
    return <LoadingScreen message="Connecting to server…" />;
  }

  if (!room) {
    return <HomeScreen socket={socket} onRoomJoined={handleRoomJoined} />;
  }

  if (loadingMsg) {
    return <LoadingScreen message={loadingMsg} />;
  }

  if (room.state === 'lobby') {
    return <Lobby room={room} myId={myId} socket={socket} />;
  }

  if (room.state === 'playing') {
    return <GameScreen room={room} myId={myId} socket={socket} />;
  }

  if (room.state === 'roundSummary') {
    return <RoundSummary room={room} myId={myId} socket={socket} />;
  }

  if (room.state === 'gameOver') {
    return <GameOver room={room} myId={myId} />;
  }

  return <LoadingScreen message="Loading…" />;
}

function LoadingScreen({ message }) {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: '16px',
    }}>
      <div style={{ fontSize: 48 }}>⚾</div>
      <p style={{ color: 'var(--text-muted)', fontSize: 16 }}>{message}</p>
      <div className="spinner" />
      <style>{`
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
