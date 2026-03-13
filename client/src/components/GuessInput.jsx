import React, { useState, useRef, useEffect, useCallback } from 'react';
import './GuessInput.css';

export default function GuessInput({ onSubmit, disabled, guessedNames }) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  const API_BASE = process.env.REACT_APP_SERVER_URL || '';

  const fetchSuggestions = useCallback(async (q) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/players/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSuggestions(data.filter(p => !guessedNames.includes(p.name.toLowerCase())));
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [guessedNames]);

  function handleChange(e) {
    const v = e.target.value;
    setValue(v);
    setSelectedIndex(-1);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 250);
  }

  function handleKeyDown(e) {
    if (suggestions.length === 0) {
      if (e.key === 'Enter') submitGuess(value);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        selectSuggestion(suggestions[selectedIndex].name);
      } else {
        submitGuess(value);
      }
    } else if (e.key === 'Escape') {
      setSuggestions([]);
    }
  }

  function selectSuggestion(name) {
    setValue(name);
    setSuggestions([]);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  }

  function submitGuess(name) {
    const trimmed = name.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
    setSuggestions([]);
  }

  // Close suggestions on outside click
  useEffect(() => {
    function onClick(e) {
      if (!e.target.closest('.guess-input-wrapper')) setSuggestions([]);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="guess-input-wrapper">
      <div className="guess-input-row">
        <div className="guess-input-field-wrap">
          <input
            ref={inputRef}
            className="input guess-input-field"
            placeholder="Type a player name…"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="go"
            autoFocus
          />
          {loading && <span className="guess-loading-dot" />}
          {suggestions.length > 0 && (
            <ul className="suggestions-list">
              {suggestions.map((s, i) => (
                <li
                  key={s.id}
                  className={`suggestion-item ${i === selectedIndex ? 'suggestion-item--selected' : ''}`}
                  onMouseDown={() => selectSuggestion(s.name)}
                >
                  {s.name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          className="btn btn-primary guess-submit-btn"
          disabled={disabled || !value.trim()}
          onClick={() => submitGuess(value)}
        >
          Guess
        </button>
      </div>
    </div>
  );
}
