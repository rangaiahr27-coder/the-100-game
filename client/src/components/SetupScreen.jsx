import React, { useState } from 'react';
import './SetupScreen.css';

const STAT_OPTIONS = [
  { label: 'Home Runs',             stat: 'homeRuns',   display: 'HR'   },
  { label: 'RBI',                   stat: 'rbi',        display: 'RBI'  },
  { label: 'Stolen Bases',          stat: 'stolenBases',display: 'SB'   },
  { label: 'Hits',                  stat: 'hits',       display: 'H'    },
  { label: 'Runs',                  stat: 'runs',       display: 'R'    },
  { label: 'Strikeouts (Pitching)', stat: 'strikeOuts', display: 'K'    },
  { label: 'Wins',                  stat: 'wins',       display: 'W'    },
  { label: 'Saves',                 stat: 'saves',      display: 'SV'   },
  { label: 'ERA',                   stat: 'era',        display: 'ERA'  },
  { label: 'Batting Average',       stat: 'avg',        display: 'AVG'  },
  { label: 'WHIP',                  stat: 'whip',       display: 'WHIP' },
  { label: 'OPS',                   stat: 'ops',        display: 'OPS'  },
];

export default function SetupScreen({ room, myId, socket }) {
  const isHost = room.hostId === myId;
  const [mode, setMode] = useState('random');
  const [statKey, setStatKey] = useState('homeRuns');
  const [startYear, setStartYear] = useState('2010');
  const [endYear, setEndYear] = useState('2024');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function validate() {
    if (mode === 'choose') {
      const s = parseInt(startYear), e = parseInt(endYear);
      if (isNaN(s) || isNaN(e)) return 'Enter valid years';
      if (s < 1960) return 'Start year must be 1960 or later';
      if (e > 2024) return 'End year must be 2024 or earlier';
      if (e - s < 5) return 'Timeframe must span at least 5 years';
    }
    return null;
  }

  function handleBegin() {
    const err = validate();
    if (err) return setError(err);
    setError('');
    setLoading(true);
    const payload = mode === 'random'
      ? { mode: 'random' }
      : { mode: 'choose', statKey, startYear: parseInt(startYear), endYear: parseInt(endYear) };
    socket.emit('beginGame', payload, (res) => {
      setLoading(false);
      if (res?.error) setError(res.error);
    });
  }

  const selectedStat = STAT_OPTIONS.find(s => s.stat === statKey);

  if (!isHost) {
    return (
      <div className="setup-screen">
        <div className="setup-waiting-card card">
          <div className="setup-ball">⚾</div>
          <h2 className="setup-waiting-title">Setting Up…</h2>
          <p className="setup-waiting-msg">
            Waiting for <strong>{room.hostName || 'the host'}</strong> to choose the game mode
          </p>
          <div className="setup-players">
            {room.players.map(p => (
              <span key={p.id} className="setup-player-chip">
                {p.name}{p.id === myId ? ' (you)' : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <div className="setup-ball">⚾</div>
        <h1 className="setup-title">Choose Game Mode</h1>
        <p className="setup-subtitle">Room <strong>{room.roomCode}</strong> · {room.players.length} player{room.players.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="setup-modes">
        <button
          className={`setup-mode-btn ${mode === 'random' ? 'setup-mode-btn--active' : ''}`}
          onClick={() => setMode('random')}
        >
          <span className="setup-mode-icon">🎲</span>
          <span className="setup-mode-label">Random</span>
          <span className="setup-mode-desc">App picks a random stat and timeframe</span>
        </button>
        <button
          className={`setup-mode-btn ${mode === 'choose' ? 'setup-mode-btn--active' : ''}`}
          onClick={() => setMode('choose')}
        >
          <span className="setup-mode-icon">🎯</span>
          <span className="setup-mode-label">Choose</span>
          <span className="setup-mode-desc">Pick a specific stat and year range</span>
        </button>
      </div>

      {mode === 'choose' && (
        <div className="setup-choose card">
          <div className="form-group">
            <label className="label" htmlFor="stat-select">Stat Category</label>
            <select
              id="stat-select"
              className="input setup-select"
              value={statKey}
              onChange={e => setStatKey(e.target.value)}
            >
              {STAT_OPTIONS.map(s => (
                <option key={s.stat} value={s.stat}>{s.label} ({s.display})</option>
              ))}
            </select>
          </div>

          <div className="setup-years">
            <div className="form-group">
              <label className="label" htmlFor="start-year">Start Year</label>
              <input
                id="start-year"
                className="input"
                type="number"
                min="1960" max="2019"
                value={startYear}
                onChange={e => setStartYear(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="setup-years-dash">–</div>
            <div className="form-group">
              <label className="label" htmlFor="end-year">End Year</label>
              <input
                id="end-year"
                className="input"
                type="number"
                min="1965" max="2024"
                value={endYear}
                onChange={e => setEndYear(e.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>

          {selectedStat && startYear && endYear && (
            <div className="setup-preview">
              <strong>{selectedStat.label}</strong> · {startYear}–{endYear}
              {parseInt(endYear) - parseInt(startYear) >= 5 && (
                <span className="setup-preview-span"> ({parseInt(endYear) - parseInt(startYear) + 1} seasons)</span>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="setup-error">{error}</p>}

      <button
        className="btn btn-primary btn-large setup-begin-btn"
        disabled={loading}
        onClick={handleBegin}
      >
        {loading ? 'Loading stats…' : mode === 'random' ? '🎲 Start Random Game' : '🎯 Start Custom Game'}
      </button>

      <p className="setup-hint">Other players are waiting for you to begin</p>
    </div>
  );
}
