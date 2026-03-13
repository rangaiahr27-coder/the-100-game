// In-memory game state manager

const GUESSES_PER_TURN = 1;
const ROUNDS_PER_GAME = 5;

function createRoom(roomCode, hostId, hostName) {
  return {
    roomCode,
    hostId,
    players: [{ id: hostId, name: hostName, score: 0, roundScores: [] }],
    state: 'lobby', // lobby | playing | roundSummary | gameOver
    round: 0,
    // The challenge (stat + timeframe) is fixed for the entire game session
    gameChallenge: null,
    gameLeaderboard: [],
    currentChallenge: null,
    leaderboard: [], // top-100 for current challenge (same as gameLeaderboard every round)
    turnIndex: 0,    // index into players array for whose turn it is
    guessesThisRound: [], // { playerId, playerName, guessedName, rank, points }
    guessCountThisTurn: 0,
    guessedNamesThisRound: new Set(),
    turnOrder: [],   // player id order for this round
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
  // If host left, reassign
  if (room.hostId === playerId && room.players.length > 0) {
    room.hostId = room.players[0].id;
  }
}

function setGameChallenge(room, challenge, leaderboard) {
  room.gameChallenge = challenge;
  room.gameLeaderboard = leaderboard;
}

function startRound(room) {
  room.round += 1;
  room.state = 'playing';
  // Reuse the single challenge for every round of the game
  room.currentChallenge = room.gameChallenge;
  room.leaderboard = room.gameLeaderboard;
  room.guessesThisRound = [];
  room.guessedNamesThisRound = new Set();
  room.guessCountThisTurn = 0;

  // Determine turn order: rotate each round
  // Round 1: players in join order
  // Round 2+: last player in previous round goes first
  if (room.round === 1) {
    room.turnOrder = room.players.map(p => p.id);
  } else {
    // Shift: last becomes first
    const prev = room.turnOrder;
    room.turnOrder = [...prev.slice(prev.length - 1), ...prev.slice(0, prev.length - 1)];
  }
  room.turnIndex = 0;
}

function currentPlayer(room) {
  return room.players.find(p => p.id === room.turnOrder[room.turnIndex]) ?? null;
}

function recordGuess(room, playerId, guessedName, rankResult) {
  // rankResult: { rank, playerName, statValue } or null (not in top 100)
  const points = rankResult ? rankResult.rank : 0;
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
  room.guessCountThisTurn += 1;

  // Update player score
  const player = room.players.find(p => p.id === playerId);
  if (player) {
    player.score += points;
    // Track round score accumulation
    if (!player._currentRoundScore) player._currentRoundScore = 0;
    player._currentRoundScore += points;
  }

  return entry;
}

function advanceTurn(room) {
  room.guessCountThisTurn = 0;
  room.turnIndex += 1;
  if (room.turnIndex >= room.turnOrder.length) {
    // All players have had their turn — end round
    return 'roundOver';
  }
  return 'nextPlayer';
}

function endRound(room) {
  // Commit round scores
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
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      roundScores: p.roundScores,
    })),
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
  };
}

module.exports = {
  GUESSES_PER_TURN,
  ROUNDS_PER_GAME,
  createRoom,
  getRoom,
  addPlayer,
  removePlayer,
  setGameChallenge,
  startRound,
  currentPlayer,
  recordGuess,
  advanceTurn,
  endRound,
  serializeRoom,
};
