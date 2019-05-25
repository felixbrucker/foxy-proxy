import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LocalStorageService {

  constructor() {}

  hideItem(identifier, upstreamFullName = null) {
    this.setHideItem(identifier, upstreamFullName, true);
  }

  showItem(identifier, upstreamFullName = null) {
    this.setHideItem(identifier, upstreamFullName, false);
  }

  setHideItem(identifier, upstreamFullName = null, hide) {
    let str = 'hide';
    if (upstreamFullName) {
      str += `/${upstreamFullName}`;
    }
    localStorage.setItem(`${str}/${identifier}`, hide.toString());
  }

  setProxyHidden(name, hide) {
    this.setItem(`proxy/${name}/hide`, hide.toString());
  }

  showProxy(name) {
    return this.getItem(`proxy/${name}/hide`) !== 'true';
  }

  shouldShowItem(identifier, upstreamFullName = null) {
    if (upstreamFullName) {
      return localStorage.getItem(`hide/${identifier}`) !== 'true' && localStorage.getItem(`hide/${upstreamFullName}/${identifier}`) !== 'true';
    }
    return localStorage.getItem(`hide/${identifier}`) !== 'true';
  }

  getItem(key) {
    return localStorage.getItem(key);
  }

  setItem(key, value) {
    localStorage.setItem(key, value);
  }

  removeItem(key) {
    localStorage.removeItem(key);
  }

  clearHideItems() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('hide')) {
        keysToRemove.push(key);
      }
      if (key.startsWith('layout')) {
        keysToRemove.push(key);
      }
      if (key.startsWith('proxy')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  getHiddenCards() {
    const hiddenCards = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('hide')) {
        hiddenCards.push(key);
      }
    }
    return hiddenCards;
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
