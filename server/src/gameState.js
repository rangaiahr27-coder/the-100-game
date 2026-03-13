const GUESSES_PER_TURN = 1;
const ROUNDS_PER_GAME = 5;

function createRoom(roomCode, hostId, hostName) {
  return {
    roomCode,
    hostId,
    hostName,
    players: [{ id: hostId, name: hostName, score: 0, roundScores: [] }],
    state: 'lobby', // lobby | setup | playing | roundSummary | gameOver
    round: 0,
    gameChallenge: null,
    gameLeaderboard: [],
    currentChallenge: null,
    leaderboard: [],
    turnIndex: 0,
    guessesThisRound: [],
    guessCountThisTurn: 0,
    guessedNamesThisRound: new Set(),
    guessedNamesAllRounds: new Set(),
    turnOrder: [],
    allGuessesByRound: [],
  };
}

function getRoom(rooms, roomCode) {
  return rooms[roomCode] ?? null;
}

function addPlayer(room, playerId, playerName) {
  if (room.players.find(p => p.id === playerId)) return false;
  room.players.push({ id: playerId, name: playerName, score: 0, roundScores: [] });
  return true;
}

function removePlayer(room, playerId) {
  room.players = room.players.filter(p => p.id !== playerId);
  if (room.hostId === playerId && room.players.length > 0) {
    room.hostId = room.players[0].id;
  }
}

function updatePlayerSocketId(room, playerName, newSocketId) {
  const player = room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
  if (!player) return false;
  const oldId = player.id;
  player.id = newSocketId;
  room.turnOrder = room.turnOrder.map(id => id === oldId ? newSocketId : id);
  if (room.hostName && room.hostName.toLowerCase() === playerName.toLowerCase()) {
    room.hostId = newSocketId;
  }
  return true;
}

function setGameChallenge(room, challenge, leaderboard) {
  room.gameChallenge = challenge;
  room.gameLeaderboard = leaderboard;
}

function startRound(room) {
  room.round += 1;
  room.state = 'playing';
  room.currentChallenge = room.gameChallenge;
  room.leaderboard = room.gameLeaderboard;
  room.guessesThisRound = [];
  room.guessedNamesThisRound = new Set();
  // guessedNamesAllRounds intentionally not reset
  room.guessCountThisTurn = 0;

  if (room.round === 1) {
    room.turnOrder = room.players.map(p => p.id);
  } else {
    const prev = room.turnOrder;
    room.turnOrder = [...prev.slice(prev.length - 1), ...prev.slice(0, prev.length - 1)];
  }
  room.turnIndex = 0;
}

function currentPlayer(room) {
  return room.players.find(p => p.id === room.turnOrder[room.turnIndex]) ?? null;
}

function recordGuess(room, playerId, guessedName, rankResult) {
  const points = rankResult && rankResult.rank <= 100 ? rankResult.rank : 0;
  const entry = {
    playerId,
    playerName: room.players.find(p => p.id === playerId)?.name ?? 'Unknown',
    guessedName,
    rank: rankResult?.rank ?? null,
    statValue: rankResult?.statValue ?? null,
    points,
  };
  room.guessesThisRound.push(entry);
  room.guessedNamesThisRound.add(guessedName.toLowerCase());
  room.guessedNamesAllRounds.add(guessedName.toLowerCase());
  room.guessCountThisTurn += 1;

  const player = room.players.find(p => p.id === playerId);
  if (player) {
    player.score += points;
    if (!player._currentRoundScore) player._currentRoundScore = 0;
    player._currentRoundScore += points;
  }
  return entry;
}

function advanceTurn(room) {
  room.guessCountThisTurn = 0;
  room.turnIndex += 1;
  if (room.turnIndex >= room.turnOrder.length) return 'roundOver';
  return 'nextPlayer';
}

function endRound(room) {
  room.allGuessesByRound.push([...room.guessesThisRound]);
  room.players.forEach(p => {
    p.roundScores.push(p._currentRoundScore ?? 0);
    p._currentRoundScore = 0;
  });
  room.state = room.round >= ROUNDS_PER_GAME ? 'gameOver' : 'roundSummary';
}

function serializeRoom(room) {
  return {
    roomCode: room.roomCode,
    hostId: room.hostId,
    hostName: room.hostName,
    players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score, roundScores: p.roundScores })),
    state: room.state,
    round: room.round,
    totalRounds: ROUNDS_PER_GAME,
    currentChallenge: room.currentChallenge,
    turnOrder: room.turnOrder,
    turnIndex: room.turnIndex,
    currentPlayerId: currentPlayer(room)?.id ?? null,
    guessCountThisTurn: room.guessCountThisTurn,
    guessesPerTurn: GUESSES_PER_TURN,
    guessesThisRound: room.guessesThisRound,
    allGuessedNames: [...room.guessedNamesAllRounds],
    allGuessesByRound: room.allGuessesByRound,
  };
}

module.exports = {
  GUESSES_PER_TURN, ROUNDS_PER_GAME,
  createRoom, getRoom, addPlayer, removePlayer, updatePlayerSocketId,
  setGameChallenge, startRound, currentPlayer, recordGuess, advanceTurn, endRound, serializeRoom,
};
