import { Injectable } from '@angular/core';
import {WebsocketService} from './websocket.service';
import {BehaviorSubject, Observable} from 'rxjs';
import {Router} from '@angular/router';
import {LocalStorageService} from './local-storage.service';
import {MatSnackBar} from '@angular/material';

@Injectable({
  providedIn: 'root'
})
export class StatsService {

  private stats = new BehaviorSubject<any>([]);
  private statsObservable: any;
  private authenticated = new BehaviorSubject<boolean>(false);
  private authenticatedObservable: Observable<boolean>;
  private reconnecting = false;

  constructor(
    private websocketService: WebsocketService,
    private localStorageService: LocalStorageService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.statsObservable = this.stats.asObservable();
    this.authenticatedObservable = this.authenticated.asObservable();
    this.websocketService.subscribe('connect', this.onConnected.bind(this));
    this.websocketService.subscribe('disconnect', this.onDisconnected.bind(this));
    this.websocketService.subscribe('reconnect', this.onReconnected.bind(this));
    this.websocketService.subscribe('unauthorized', this.onUnauthorized.bind(this));
    this.websocketService.subscribe('stats/proxy', this.onNewProxyStats.bind(this));
    this.websocketService.subscribe('stats/current-round', this.onNewUpstreamStats.bind(this));
    this.websocketService.subscribe('stats/connection-stats', this.onNewUpstreamStats.bind(this));
    this.websocketService.subscribe('stats/historical', this.onNewUpstreamStats.bind(this));
  }

  init() {
    this.websocketService.publish('stats/init', (stats) => {
      this.stats.next(stats);
    });
  }

  onConnected() {
    this.authenticated.next(false);
    const authData = this.localStorageService.getAuthData();
    if (authData) {
      this.authenticate(authData.username, authData.passHash);
    }
    this.init();
  }

  onDisconnected() {
    if (this.reconnecting) {
      return;
    }
    this.snackBar.open('Lost the connection to the proxy, reconnecting..', null, {
      duration: 2 * 1000,
      verticalPosition: 'top',
      horizontalPosition: 'right',
    });
  }

  onReconnected() {
    if (this.reconnecting) {
      return;
    }
    this.snackBar.open('Re-established the connection to the proxy', null, {
      duration: 2 * 1000,
      verticalPosition: 'top',
      horizontalPosition: 'right',
    });
  }

  getVersionInfo() {
    return new Promise(resolve => this.websocketService.publish('version/info', (result) => resolve(result)));
  }

  authenticate(username, passHash) {
    return new Promise(resolve => {
      this.websocketService.publish('authenticate', {
        username,
        passHash,
      }, (result) => {
        if (result) {
          this.authenticated.next(true);
        }
        resolve(result);
      });
    });
  }

  async onUnauthorized() {
    await this.router.navigate(['/login']);
  }

  onNewProxyStats(proxyName, proxyStats) {
    const stats = this.stats.getValue();
    if (!stats) {
      return;
    }
    const proxy = stats.find(proxy => proxy.name === proxyName);
    if (!proxy) {
      return;
    }
    Object.keys(proxyStats).forEach(key => {
      proxy[key] = proxyStats[key];
    });
  }

  onNewUpstreamStats(fullUpstreamName, upstreamStats) {
    const stats = this.stats.getValue();
    if (!stats) {
      return;
    }
    const upstream = stats
      .map(proxy => proxy.upstreamStats)
      .reduce((acc, curr) => acc.concat(curr), [])
      .find(upstream => upstream.fullName === fullUpstreamName);
    if (!upstream) {
      return;
    }
    Object.keys(upstreamStats).forEach(key => {
      upstream[key] = upstreamStats[key];
    });
  }

  getStatsObservable() {
    return this.statsObservable;
  }

  getAuthenticatedObservable() {
    return this.authenticatedObservable;
  }

  async reconnect() {
    this.reconnecting = true;
    this.websocketService.reconnect();
    await new Promise(resolve => setTimeout(resolve, 5000));
    this.reconnecting = false;
  }
}
