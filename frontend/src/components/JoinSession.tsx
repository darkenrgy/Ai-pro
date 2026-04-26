import '../styles/Auth.css';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionApi, JoinSessionRequest } from '@/api/session';

export const JoinSession: React.FC = () => {
  const [sessionId, setSessionId] = useState('');
  const [parentNodeId, setParentNodeId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const request: JoinSessionRequest = {
        sessionId,
        parentNodeId: parentNodeId || sessionId, // Default to session ID if no parent
      };

      await sessionApi.joinSession(request);
      navigate(`/session/${sessionId}`);
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError('Your role is not allowed to join this session. Ask a host for participant access.');
      } else {
        setError(err.response?.data?.error || 'Failed to join session');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Join Session</h2>
        <p className="subtitle">Enter session details to join</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleJoin}>
          <div className="form-group">
            <label htmlFor="sessionId">Session ID</label>
            <input
              id="sessionId"
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="Paste session ID here"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="parentId">Parent Node ID (optional)</label>
            <input
              id="parentId"
              type="text"
              value={parentNodeId}
              onChange={(e) => setParentNodeId(e.target.value)}
              placeholder="Leave empty to join as root"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Joining...' : 'Join Session'}
          </button>
        </form>

        <button
          onClick={() => navigate('/dashboard')}
          className="btn-secondary"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};
