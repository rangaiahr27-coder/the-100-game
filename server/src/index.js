const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const {
  generateChallenge,
  fetchLeaderboard,
  lookupPlayerRank,
  searchPlayers,
} = require('./mlbApi');
const {
  GUESSES_PER_TURN,
  createRoom,
  getRoom,
  addPlayer,
  removePlayer,
  updatePlayerSocketId,
  setGameChallenge,
  startRound,
  currentPlayer,
  recordGuess,
  advanceTurn,
  endRound,
  serializeRoom,
} = require('./gameState');

const CORS_ORIGIN = process.env.CLIENT_URL || '*';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] },
});

const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms[code]);
  return code;
}

app.get('/api/players/search', async (req, res) => {
  const { q } = req.query;
  try {
    const results = await searchPlayers(q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (_, res) => res.json({ ok: true }));

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ── CREATE ROOM ──────────────────────────────────────────────────────────
  socket.on('createRoom', ({ playerName }, callback) => {
    if (!playerName?.trim()) return callback({ error: 'Name required' });
    const roomCode = generateRoomCode();
    const name = playerName.trim();
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
    console.log(`[joinRoom] ${name} joined ${code}`);
    callback({ room: serializeRoom(room) });
  });

  // ── REJOIN ROOM (reconnection / tab restore) ─────────────────────────────
  socket.on('rejoinRoom', ({ roomCode, playerName }, callback) => {
    const code = roomCode?.toUpperCase().trim();
    const room = getRoom(rooms, code);
    if (!room) return callback({ error: 'Room not found or expired' });
    const name = playerName?.trim();
    if (!name) return callback({ error: 'Name required' });

    const existingPlayer = room.players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existingPlayer) {
      // Reclaim existing seat — update socket ID
      updatePlayerSocketId(room, name, socket.id);
    } else if (room.state === 'lobby') {
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

  // ── START GAME ───────────────────────────────────────────────────────────
  socket.on('startGame', async (_, callback) => {
    const { roomCode } = socket.data;
    const room = getRoom(rooms, roomCode);
    if (!room) return callback?.({ error: 'Room not found' });
    if (room.hostId !== socket.id) return callback?.({ error: 'Only the host can start' });
    if (room.players.length < 1) return callback?.({ error: 'Need at least 1 player' });

    try {
      io.to(roomCode).emit('gameLoading', { message: 'Loading MLB stats…' });
      const challenge = generateChallenge();
      const leaderboard = await fetchLeaderboard(challenge.category, challenge.timeframe);
      setGameChallenge(room, challenge, leaderboard);
      startRound(room);

      io.to(roomCode).emit('roundStarted', serializeRoom(room));
      callback?.({ ok: true });
    } catch (err) {
      console.error('[startGame error]', err);
      callback?.({ error: 'Failed to load MLB data. Try again.' });
      io.to(roomCode).emit('gameError', { message: 'Failed to load MLB data.' });
    }
  });

  // ── SUBMIT GUESS ─────────────────────────────────────────────────────────
  socket.on('submitGuess', async ({ guessedName }, callback) => {
    const { roomCode } = socket.data;
    const room = getRoom(rooms, roomCode);
    if (!room) return callback({ error: 'Room not found' });
    if (room.state !== 'playing') return callback({ error: 'Game not in playing state' });

    const cp = currentPlayer(room);
    if (!cp || cp.id !== socket.id) return callback({ error: 'Not your turn' });
    if (room.guessCountThisTurn >= GUESSES_PER_TURN) return callback({ error: 'No guesses remaining' });

    const name = guessedName?.trim();
    if (!name) return callback({ error: 'Player name required' });

    // Check duplicate across ALL rounds of this game
    if (room.guessedNamesAllRounds.has(name.toLowerCase())) {
      return callback({ error: 'That player has already been guessed this game' });
    }

    const rankResult = lookupPlayerRank(room.leaderboard, name);
    const guessEntry = recordGuess(room, socket.id, name, rankResult);

    io.to(roomCode).emit('guessResult', {
      guess: guessEntry,
      room: serializeRoom(room),
    });

    callback({ ok: true, guess: guessEntry });

    if (room.guessCountThisTurn >= GUESSES_PER_TURN) {
      const result = advanceTurn(room);
      if (result === 'roundOver') {
        endRound(room);
        setTimeout(() => {
          io.to(roomCode).emit('roundEnded', serializeRoom(room));
        }, 800);
      } else {
        io.to(roomCode).emit('turnChanged', serializeRoom(room));
      }
    }
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

  // ── DISCONNECT ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const { roomCode } = socket.data ?? {};
    if (!roomCode) return;
    const room = getRoom(rooms, roomCode);
    if (!room) return;
    removePlayer(room, socket.id);
    console.log(`[disconnect] ${socket.id} left ${roomCode}`);
    if (room.players.length === 0) {
      delete rooms[roomCode];
      console.log(`[cleanup] Room ${roomCode} deleted`);
    } else {
      io.to(roomCode).emit('roomUpdated', serializeRoom(room));
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`The 100 Game server running on port ${PORT}`);
});
