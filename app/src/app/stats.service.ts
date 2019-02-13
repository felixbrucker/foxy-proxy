import { Injectable } from '@angular/core';
import {WebsocketService} from './websocket.service';
import {BehaviorSubject} from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class StatsService {

  private stats = new BehaviorSubject<any>([]);
  private statsObservable: any;

  constructor(private websocketService: WebsocketService) {
    this.statsObservable = this.stats.asObservable();
    this.websocketService.subscribe('stats/init', this.onNewStats.bind(this));
    this.websocketService.subscribe('stats/proxy', this.onNewProxyStats.bind(this));
    this.websocketService.subscribe('stats/current-round', this.onNewUpstreamStats.bind(this));
    this.websocketService.subscribe('stats/historical', this.onNewUpstreamStats.bind(this));
  }

  init() {
    this.websocketService.publish('stats/get');
  }

  onNewStats(stats) {
    this.stats.next(stats);
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
}
