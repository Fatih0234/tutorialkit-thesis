import type { InteractivePocControlsModel } from './useInteractivePoc.js';

export function InteractiveDevIdentityPanel({
  currentUser,
  devUsers,
  authStatus,
  authError,
  onDevLogin,
  onLogout,
}: Pick<
  InteractivePocControlsModel,
  'currentUser' | 'devUsers' | 'authStatus' | 'authError' | 'onDevLogin' | 'onLogout'
>) {
  return (
    <section
      aria-labelledby="interactive-dev-identity-heading"
      style={{
        border: '1px solid var(--tk-elements-panel-borderColor)',
        borderRadius: '0.375rem',
        display: 'grid',
        gap: '0.5rem',
        padding: '0.5rem',
      }}
    >
      <div>
        <h2 id="interactive-dev-identity-heading" style={{ fontSize: '0.95rem', margin: 0 }}>
          Dev identity
        </h2>
        <p style={{ margin: 0 }}>Demo-only sign-in for ownership tests. Not production authentication.</p>
      </div>

      <div aria-live="polite" role="status" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        <span>Auth status: {authStatus}</span>
        <span>Signed-in user: {currentUser ? currentUser.displayName : 'signed out'}</span>
        <span>Signed-in role: {currentUser?.role ?? 'none'}</span>
        <span>Auth error: {authError}</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {devUsers.map((user) => (
          <button key={user.id} type="button" onClick={() => onDevLogin(user.id)}>
            Sign in as {user.displayName}
          </button>
        ))}
        <button type="button" onClick={onLogout} disabled={!currentUser}>
          Sign out
        </button>
      </div>
    </section>
  );
}
