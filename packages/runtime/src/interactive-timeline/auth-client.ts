import type { InteractiveUser } from './identity.js';
import { RemoteInteractiveTimelineStorage } from './remote-storage-adapter.js';

const authStorage = new RemoteInteractiveTimelineStorage();

export function loadCurrentUser(): Promise<InteractiveUser | null> {
  return authStorage.loadCurrentUser();
}

export function devLogin(userId: string): Promise<InteractiveUser | null> {
  return authStorage.devLogin(userId);
}

export function logout(): Promise<void> {
  return authStorage.logout();
}

export function listDevUsers(): Promise<InteractiveUser[]> {
  return authStorage.listDevUsers();
}
