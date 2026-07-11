import {
  InteractiveButton,
  InteractiveStatusBadge,
  interactiveSelectClassName,
} from './InteractivePocUi.js';
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
      aria-labelledby="interactive-demo-identity-heading"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-tk-border-primary bg-tk-background-secondary px-3 py-2"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="i-ph-user-circle-duotone shrink-0 text-xl text-tk-text-accent" />
        <div className="min-w-0">
          <h2 id="interactive-demo-identity-heading" className="sr-only">
            Account
          </h2>
          <div aria-live="polite" role="status" className="flex flex-wrap items-center gap-1.5">
            <strong className="truncate text-sm text-tk-text-primary">
              {currentUser ? currentUser.displayName : 'Choose an account'}
            </strong>
            <InteractiveStatusBadge tone={currentUser ? 'positive' : 'neutral'}>
              {currentUser?.role ?? 'signed out'}
            </InteractiveStatusBadge>
            <span className="sr-only">Auth status: {authStatus}</span>
            <span className="sr-only">Auth error: {authError}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-500 text-tk-text-secondary">
          Account
          <select
            aria-label="Choose Account"
            className={`${interactiveSelectClassName} w-auto min-w-44 py-1`}
            value={currentUser?.id ?? ''}
            onChange={(event) => {
              if (event.currentTarget.value) {
                onDevLogin(event.currentTarget.value);
              }
            }}
          >
            <option value="" disabled>
              Choose an account…
            </option>
            {devUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName}
              </option>
            ))}
          </select>
        </label>
        <InteractiveButton icon="i-ph-sign-out" variant="ghost" onClick={onLogout} disabled={!currentUser}>
          Sign out
        </InteractiveButton>
      </div>

      <p className="sr-only">Demo sign-in for Teacher Studio and Learner Lesson ownership. Not production authentication.</p>
    </section>
  );
}
