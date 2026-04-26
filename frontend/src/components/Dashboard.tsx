import '../styles/Dashboard.css';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { sessionApi } from '@/api/session';
import '../styles/Dashboard.css';

export const Dashboard: React.FC = () => {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const [sessionName, setSessionName] = useState('');
  const [expirationMinutes, setExpirationMinutes] = useState(60);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await sessionApi.createSession({
        sessionName,
        description,
        expirationMinutes,
      });

      navigate(`/session/${response.data.sessionId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>AI-PRO Dashboard</h1>
        <div className="header-actions">
          <span className="user-info">
            {user?.name} ({user?.roles[0]?.name})
          </span>
          <button onClick={handleLogout} className="btn-logout">
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="welcome-section">
          <h2>Welcome, {user?.name}!</h2>
          <p>Secure communication platform</p>
        </section>

        {hasRole('HOST') && (
          <section className="create-session-section">
            <h3>Create New Session</h3>
            
            {error && <div className="error-message">{error}</div>}
            
            <form onSubmit={handleCreateSession} className="session-form">
              <div className="form-group">
                <label htmlFor="sessionName">Session Name</label>
                <input
                  id="sessionName"
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="Enter session name"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">Description (optional)</label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Session description"
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label htmlFor="expiration">Expiration (minutes)</label>
                <select
                  id="expiration"
                  value={expirationMinutes}
                  onChange={(e) => setExpirationMinutes(Number(e.target.value))}
                >
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                  <option value={480}>8 hours</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
              >
                {loading ? 'Creating...' : 'Create Session'}
              </button>
            </form>
          </section>
        )}

        {!hasRole('HOST') && (
          <section className="join-session-section">
            <h3>Join a Session</h3>
            <p>Ask the session host for the session ID and join link</p>
            <button
              onClick={() => navigate('/join-session')}
              className="btn-primary"
            >
              Join Session
            </button>
          </section>
        )}

        <section className="features-section">
          <h3>Features</h3>
          <ul className="features-list">
            <li>🔒 End-to-end encrypted messaging</li>
            <li>📁 Secure file sharing with compression</li>
            <li>👥 Hierarchical user management</li>
            <li>⏱️ Auto-expiring sessions and files</li>
            <li>🔐 Role-based access control</li>
          </ul>
        </section>
      </main>
    </div>
  );
};
