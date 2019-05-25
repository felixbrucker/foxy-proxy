import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {StatsService} from '../stats.service';
import {LocalStorageService} from '../local-storage.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {

  private proxies: any[];
  private runningVersion: any;

  constructor(
    private statsService: StatsService,
    private localStorageService: LocalStorageService
  ) { }

  ngOnInit() {
    this.updateRunningVersion();
    this.statsService.getStatsObservable().subscribe((proxies => {
      this.proxies = proxies;
    }));
  }

  async updateRunningVersion() {
    const versionInfo: any = await this.statsService.getVersionInfo();
    this.runningVersion = versionInfo.runningVersion;
  }

  getProxies() {
    return this.proxies;
  }

  async logout() {
    this.localStorageService.clearAuthData();
    await this.statsService.reconnect();
  }

  resetLocalConfig() {
    this.localStorageService.clearHideItems();
  }

  getRunningVersion() {
    return this.runningVersion;
  }

  getTitle() {
    const versionAppend = this.runningVersion ? ` ${this.runningVersion}` : '';
    return `BHD-Burst-Proxy${versionAppend}`;
  }

  showProxy(proxy) {
    return this.localStorageService.showProxy(proxy.name);
  }

  setShowProxy(proxy, show) {
    this.localStorageService.setProxyHidden(proxy.name, !show);
  }

  get hiddenCards() {
    return this.localStorageService.getHiddenCards();
  }

  clearHiddenCard(card) {
    this.localStorageService.removeItem(card);
  }

  get layouts() {
    return [
      'Default',
      'Condensed',
    ];
  }

  get selectedLayout() {
    return this.localStorageService.getItem('layout') || 'Default';
  }

  set selectedLayout(layout) {
    this.localStorageService.setItem('layout', layout);
  }
}
