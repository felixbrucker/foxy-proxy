import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LocalStorageService {

  constructor() {}

  hideItem(identifier, upstreamFullName = null) {
    let str = 'hide';
    if (upstreamFullName) {
      str += `/${upstreamFullName}`;
    }
    localStorage.setItem(`${str}/${identifier}`, 'true');
  }

  showItem(identifier, upstreamFullName = null) {
    let str = 'hide';
    if (upstreamFullName) {
      str += `/${upstreamFullName}`;
    }
    localStorage.setItem(`${str}/${identifier}`, 'false');
  }

  shouldShowItem(identifier, upstreamFullName = null) {
    if (upstreamFullName) {
      return localStorage.getItem(`hide/${identifier}`) !== 'true' && localStorage.getItem(`hide/${upstreamFullName}/${identifier}`) !== 'true';
    }
    return localStorage.getItem(`hide/${identifier}`) !== 'true';
  }

  clearHideItems() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('hide')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  getAuthData() {
    const auth = localStorage.getItem('auth');
    if (!auth) {
      return null;
    }

    return JSON.parse(auth);
  }

  setAuthData(username, passHash) {
    localStorage.setItem('auth', JSON.stringify({
      username,
      passHash,
    }));
  }

  clearAuthData() {
    localStorage.removeItem('auth');
  }
}
