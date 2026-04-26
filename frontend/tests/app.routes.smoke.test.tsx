import { act, render, screen } from '@testing-library/react';
import App from '@/App';
import { useAuthStore } from '@/store/authStore';

vi.mock('@/pages/SessionPage', () => ({
  SessionPage: () => <div>Session Page Mock</div>,
}));

function setRoute(path: string): void {
  window.history.pushState({}, '', path);
}

function setUnauthenticatedState(): void {
  act(() => {
    useAuthStore.setState({
      user: null,
      token: null,
      hydrated: true,
    });
  });
}

function setAuthenticatedState(): void {
  act(() => {
    useAuthStore.setState({
      user: {
        id: 'user-1',
        name: 'Smoke User',
        email: 'smoke@example.com',
        roles: [{ id: 'role-1', name: 'HOST' }],
      },
      token: 'smoke-token',
      hydrated: true,
    });
  });
}

describe('App route smoke tests', () => {
  beforeEach(() => {
    localStorage.clear();
    setUnauthenticatedState();
  });

  it('renders landing page on root route', () => {
    setRoute('/');

    render(<App />);

    expect(screen.getByText(/privacy-first communication/i)).toBeInTheDocument();
  });

  it('redirects unauthenticated users from dashboard to login', async () => {
    setRoute('/dashboard');

    render(<App />);

    expect(await screen.findByRole('heading', { name: /access the secure workspace/i })).toBeInTheDocument();
  });

  it('shows dashboard for authenticated users', async () => {
    setAuthenticatedState();
    setRoute('/dashboard');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders 404 page for unknown route', () => {
    setRoute('/does-not-exist');

    render(<App />);

    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });
});
