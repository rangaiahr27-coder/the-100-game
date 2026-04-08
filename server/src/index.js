const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { generateChallenge, fetchLeaderboard, lookupPlayerRank, searchPlayers, ALL_STATS } = require('./mlbApi');
const {
  GUESSES_PER_TURN, createRoom, getRoom, addPlayer, removePlayer, removePlayerMidGame, updatePlayerSocketId,
  setGameChallenge, startRound, currentPlayer, recordGuess, advanceTurn, endRound, serializeRoom,
} = require('./gameState');

const CORS_ORIGIN = process.env.CLIENT_URL || '*';
const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] } });

const rooms = {};

// Grace-period timers: roomCode → { playerName → timer }
// Players are kept in rooms for 5 minutes after disconnect before being removed
const disconnectTimers = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
  while (rooms[code]);
  return code;
}

function cancelDisconnectTimer(roomCode, playerName) {
  const key = playerName.toLowerCase();
  if (disconnectTimers[roomCode]?.[key]) {
    clearTimeout(disconnectTimers[roomCode][key]);
    delete disconnectTimers[roomCode][key];
  }
}

app.get('/api/players/search', async (req, res) => {
  try { res.json(await searchPlayers(req.query.q)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/health', (_, res) => res.json({ ok: true }));

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ── CREATE ROOM ──────────────────────────────────────────────────────────
  socket.on('createRoom', ({ playerName }, callback) => {
    if (!playerName?.trim()) return callback({ error: 'Name required' });
    const name = playerName.trim();
    const roomCode = generateRoomCode();
    rooms[roomCode] = createRoom(roomCode, socket.id, name);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.playerName = name;
    console.log(`[createRoom] ${roomCode} by ${name}`);
    callback({ roomCode, room: serializeRoom(rooms[roomCode]) });
  });

  // ── JOIN ROOM ────────────────────────────────────────────────────────────
  socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
    const code = roomCode?.toUpperCase().trim();
    const room = getRoom(rooms, code);
    if (!room) return callback({ error: 'Room not found' });
    if (room.state !== 'lobby') return callback({ error: 'Game already in progress' });
    if (!playerName?.trim()) return callback({ error: 'Name required' });
    const name = playerName.trim();
    if (room.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
      return callback({ error: 'Name already taken in this room' });
    }
    addPlayer(room, socket.id, name);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerName = name;
    io.to(code).emit('roomUpdated', serializeRoom(room));
    callback({ room: serializeRoom(room) });
  });

  // ── REJOIN ROOM ──────────────────────────────────────────────────────────
  socket.on('rejoinRoom', ({ roomCode, playerName }, callback) => {
    const code = roomCode?.toUpperCase().trim();
    const room = getRoom(rooms, code);
    if (!room) return callback({ error: 'Room not found or expired' });
    const name = playerName?.trim();
    if (!name) return callback({ error: 'Name required' });

    // Cancel any pending removal timer for this player
    cancelDisconnectTimer(code, name);

    const existing = room.players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      updatePlayerSocketId(room, name, socket.id);
    } else if (room.state === 'lobby' || room.state === 'setup') {
      addPlayer(room, socket.id, name);
    } else {
      return callback({ error: 'Cannot rejoin a game in progress' });
    }

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerName = name;
    console.log(`[rejoinRoom] ${name} rejoined ${code}`);
    io.to(code).emit('roomUpdated', serializeRoom(room));
    callback({ room: serializeRoom(room) });
  });

  // ── START GAME (moves to setup screen) ──────────────────────────────────
  socket.on('startGame', (_, callback) => {
    const { roomCode } = socket.data;
    const room = getRoom(rooms, roomCode);
    if (!room) return callback?.({ error: 'Room not found' });
    if (room.hostId !== socket.id) return callback?.({ error: 'Only the host can start' });
    if (room.state !== 'lobby') return callback?.({ error: 'Not in lobby' });

    room.state = 'setup';
    io.to(roomCode).emit('setupStarted', serializeRoom(room));
    callback?.({ ok: true });
  });

  // ── BEGIN GAME (host confirms mode from setup screen) ───────────────────
  socket.on('beginGame', async ({ mode, statKey, startYear, endYear }, callback) => {
    const { roomCode } = socket.data;
    const room = getRoom(rooms, roomCode);
    if (!room) return callback?.({ error: 'Room not found' });
    if (room.hostId !== socket.id) return callback?.({ error: 'Only the host can begin' });
    if (room.state !== 'setup') return callback?.({ error: 'Not in setup state' });

    try {
      io.to(roomCode).emit('gameLoading', { message: 'Loading MLB stats…' });

      let challenge;
      if (mode === 'random') {
        challenge = generateChallenge();
      } else {
        const category = ALL_STATS.find(s => s.stat === statKey);
        if (!category) return callback?.({ error: 'Invalid stat' });
        const start = parseInt(startYear);
        const end = parseInt(endYear);
        if (isNaN(start) || isNaN(end)) return callback?.({ error: 'Invalid years' });
        if (end - start < 5) return callback?.({ error: 'Timeframe must span at least 5 years' });
        if (start < 1960) return callback?.({ error: 'Start year must be 1960 or later' });
        if (end > 2024) return callback?.({ error: 'End year must be 2024 or earlier' });
        const allTime = start <= 1960 && end >= 2024;
        challenge = {
          category,
          timeframe: { startSeason: start, endSeason: end, label: `${start}–${end}`, allTime },
        };
      }

      const leaderboard = await fetchLeaderboard(challenge.category, challenge.timeframe);
      setGameChallenge(room, challenge, leaderboard);
      startRound(room);

      io.to(roomCode).emit('roundStarted', serializeRoom(room));
      callback?.({ ok: true });
    } catch (err) {
      console.error('[beginGame error]', err);
      callback?.({ error: 'Failed to load MLB data. Try again.' });
      io.to(roomCode).emit('gameError', { message: 'Failed to load MLB data.' });
    }
  });

  // ── SUBMIT GUESS ─────────────────────────────────────────────────────────
  socket.on('submitGuess', ({ guessedName }, callback) => {
    const { roomCode } = socket.data;
    const room = getRoom(rooms, roomCode);
    if (!room) return callback({ error: 'Room not found' });
    if (room.state !== 'playing') return callback({ error: 'Game not in playing state' });

    const cp = currentPlayer(room);
    if (!cp || cp.id !== socket.id) return callback({ error: 'Not your turn' });
    if (room.guessCountThisTurn >= GUESSES_PER_TURN) return callback({ error: 'No guesses remaining' });

    const name = guessedName?.trim();
    if (!name) return callback({ error: 'Player name required' });

    if (room.guessedNamesAllRounds.has(name.toLowerCase())) {
      return callback({ error: 'That player has already been guessed this game' });
    }

    // Guard: leaderboard must be populated before any guess can score
    if (!room.leaderboard || room.leaderboard.length === 0) {
      console.error(`[submitGuess] leaderboard is empty for room ${roomCode} — gameLeaderboard length: ${room.gameLeaderboard?.length ?? 'undefined'}`);
      return callback({ error: 'Game data not ready. Please wait a moment and try again.' });
    }

    const rankResult = lookupPlayerRank(room.leaderboard, name);
    console.log(`[submitGuess] room=${roomCode} player="${name}" leaderboardSize=${room.leaderboard.length} rank=${rankResult?.rank ?? 'not found'} pts=${rankResult && rankResult.rank <= 100 ? rankResult.rank : 0}`);
    const guessEntry = recordGuess(room, socket.id, name, rankResult);

    // Broadcast to ALL players immediately (server is source of truth)
    io.to(roomCode).emit('guessResult', { guess: guessEntry, room: serializeRoom(room) });
    callback({ ok: true, guess: guessEntry });

    if (room.guessCountThisTurn >= GUESSES_PER_TURN) {
      const result = advanceTurn(room);
      if (result === 'roundOver') {
        endRound(room);
        setTimeout(() => io.to(roomCode).emit('roundEnded', serializeRoom(room)), 800);
      } else {
        // Emit updated room state with new currentPlayerId — all clients sync from this
        io.to(roomCode).emit('turnChanged', serializeRoom(room));
      }
    }
  });

  // ── LEAVE ROOM (intentional — bypasses grace period) ────────────────────
  socket.on('leaveRoom', (_, callback) => {
    const { roomCode, playerName } = socket.data ?? {};
    if (!roomCode || !playerName) return callback?.({ ok: true });

    cancelDisconnectTimer(roomCode, playerName);
    const room = getRoom(rooms, roomCode);
    if (!room) return callback?.({ ok: true });

    const player = room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
    const isHost = player && player.id === room.hostId;
    const inGame = room.state === 'playing' || room.state === 'roundSummary';

    // Detach socket from room immediately
    socket.leave(roomCode);
    socket.data.roomCode = null;
    socket.data.playerName = null;

    if (inGame && isHost) {
      // Host explicitly quit during a game — end it for everyone
      console.log(`[leaveRoom] Host ${playerName} left room ${roomCode} mid-game — tearing down`);
      io.to(roomCode).emit('hostAbandoned', { message: `${playerName} (host) left the game.` });
      delete rooms[roomCode];
    } else if (inGame && player) {
      // Non-host left mid-game — remove them and continue
      console.log(`[leaveRoom] ${playerName} left room ${roomCode} mid-game — continuing without them`);
      const result = removePlayerMidGame(room, player.id);

      if (room.players.length === 0) {
        delete rooms[roomCode];
      } else if (result === 'roundOver') {
        endRound(room);
        io.to(roomCode).emit('roundEnded', serializeRoom(room));
      } else if (result === 'turnChanged') {
        room.guessCountThisTurn = 0;
        io.to(roomCode).emit('turnChanged', serializeRoom(room));
      } else {
        io.to(roomCode).emit('roomUpdated', serializeRoom(room));
      }
    } else {
      // Lobby / setup — just remove player
      if (player) removePlayer(room, player.id);
      if (room.players.length === 0) {
        delete rooms[roomCode];
      } else {
        io.to(roomCode).emit('roomUpdated', serializeRoom(room));
      }
    }

    callback?.({ ok: true });
  });

  // ── NEXT ROUND ───────────────────────────────────────────────────────────
  socket.on('nextRound', (_, callback) => {
    const { roomCode } = socket.data;
    const room = getRoom(rooms, roomCode);
    if (!room) return callback?.({ error: 'Room not found' });
    if (room.hostId !== socket.id) return callback?.({ error: 'Only host can advance' });
    if (room.state !== 'roundSummary') return callback?.({ error: 'Not in round summary' });
    startRound(room);
    io.to(roomCode).emit('roundStarted', serializeRoom(room));
    callback?.({ ok: true });
  });

  // ── DISCONNECT (5-minute grace period before removing player) ────────────
  socket.on('disconnect', () => {
    const { roomCode, playerName } = socket.data ?? {};
    if (!roomCode || !playerName) return;
    const room = getRoom(rooms, roomCode);
    if (!room) return;

    console.log(`[disconnect] ${playerName} left ${roomCode} — grace period starts`);

    if (!disconnectTimers[roomCode]) disconnectTimers[roomCode] = {};

    disconnectTimers[roomCode][playerName.toLowerCase()] = setTimeout(() => {
      const r = getRoom(rooms, roomCode);
      if (!r) return;
      const player = r.players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
      if (player) removePlayer(r, player.id);
      delete disconnectTimers[roomCode]?.[playerName.toLowerCase()];
      console.log(`[grace expired] ${playerName} removed from ${roomCode}`);
      if (r.players.length === 0) {
        delete rooms[roomCode];
        console.log(`[cleanup] Room ${roomCode} deleted`);
      } else {
        io.to(roomCode).emit('roomUpdated', serializeRoom(r));
      }
    }, 5 * 60 * 1000); // 5-minute grace period

    // Notify other players of disconnection (player stays in room during grace period)
    io.to(roomCode).emit('roomUpdated', serializeRoom(room));
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`The 100 Game server running on port ${PORT}`));
