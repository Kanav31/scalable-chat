import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [error, setError]       = useState('');
  const navigate  = useNavigate();

  // ── Redirect-after-login flow ─────────────────────────────────────────────
  // Scenario: Bob receives a room link like /rooms/gaming and opens it.
  // The Rooms component detects he's not logged in and sends him here,
  // storing the intended destination in sessionStorage before redirecting.
  //
  // After he types his username we send him to the intended destination
  // instead of the default /mainpanel — so the link works end-to-end.
  //
  // Why sessionStorage and not localStorage?
  // This is a temporary "where were you going" value — it should be cleared
  // when the browser tab closes, not persist across sessions.

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) {
      setError('Please enter a username.');
      return;
    }
    if (trimmed.length > 32) {
      setError('Username must be 32 characters or less.');
      return;
    }

    localStorage.setItem('username', trimmed);

    // Check if we were sent here from a room link
    const intendedPath = sessionStorage.getItem('intended_path');
    if (intendedPath) {
      sessionStorage.removeItem('intended_path');
      navigate(intendedPath);
    } else {
      navigate('/mainpanel');
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">T</div>
          <span className="login-logo-text">Threads</span>
        </div>

        <h1 className="login-heading">Welcome</h1>
        <p className="login-subheading">Pick a username to start chatting.</p>

        <form onSubmit={handleSubmit}>
          <label className="login-label" htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            className="login-input"
            placeholder="e.g. john_doe"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(''); }}
            autoFocus
            autoComplete="off"
            maxLength={32}
          />
          <button type="submit" className="login-btn">Continue →</button>
          {error && <p className="login-error">{error}</p>}
        </form>
      </div>
    </div>
  );
};

export default Login;
