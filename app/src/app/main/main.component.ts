import {Component, OnInit, ViewEncapsulation} from '@angular/core';
import {StatsService} from '../stats.service';
import {MatSnackBar} from '@angular/material';
import {NewVersionSnackbarComponent} from '../new-version-snackbar/new-version-snackbar.component';
import {LocalStorageService} from '../local-storage.service';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class MainComponent implements OnInit {

  private stats = [];
  private _currentProxy: any;
  private latestVersion = null;
  private runningVersion = null;

  constructor(
    private statsService: StatsService,
    private localStorageService: LocalStorageService,
    private snackBar: MatSnackBar
  ) { }

  async ngOnInit() {
    this.statsService.getStatsObservable().subscribe((stats => {
      const proxies = stats.filter(proxy => this.showProxy(proxy));
      if (proxies.length > 0) {
        let selectProxy = proxies[0];
        if (this.currentProxy) {
          const foundProxy = proxies.find(proxy => proxy.name === this.currentProxy.name);
          if (foundProxy) {
            selectProxy = foundProxy;
          }
        }
        this.currentProxy = selectProxy;
      }
      this.stats = proxies;
    }));
    this.detectVersionUpdate();
    setInterval(this.detectVersionUpdate.bind(this), 10 * 60 * 1000);
  }

  async detectVersionUpdate() {
    const versionInfo: any = await this.statsService.getVersionInfo();
    this.runningVersion = versionInfo.runningVersion;
    if (this.latestVersion === versionInfo.latestVersion) {
      return;
    }
    this.latestVersion = versionInfo.latestVersion;
    if (versionInfo.latestVersion === versionInfo.runningVersion) {
      return;
    }
    const snackBarRef = this.snackBar.openFromComponent(NewVersionSnackbarComponent, {
      verticalPosition: 'top',
      horizontalPosition: 'right',
      data: versionInfo,
      panelClass: 'mat-simple-snackbar',
    });
    snackBarRef.onAction().subscribe(() => {
      this.statsService.updateProxy();
      this.snackBar.open('Updating the proxy ..', '', {
        verticalPosition: 'top',
        horizontalPosition: 'right',
      });
    });
  }

  getStats() {
    return this.stats;
  }

  get currentProxy() {
    return this._currentProxy;
  }

  set currentProxy(proxy: any) {
    this._currentProxy = proxy;
  }

  showProxy(proxy) {
    return this.localStorageService.showProxy(proxy.name);
  }

  get layout() {
    return this.localStorageService.getItem('layout') || 'Default';
  }

  getRunningVersion() {
    return this.runningVersion;
  }
}
