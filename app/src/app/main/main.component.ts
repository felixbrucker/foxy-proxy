import {Component, OnInit, ViewEncapsulation} from '@angular/core';
import {StatsService} from '../stats.service';
import {MatSnackBar} from '@angular/material';

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

  constructor(
    private statsService: StatsService,
    private snackBar: MatSnackBar
  ) { }

  async ngOnInit() {
    this.statsService.getStatsObservable().subscribe((stats => {
      if (stats.length > 0) {
        let selectProxy = stats[0];
        if (this.currentProxy) {
          const foundProxy = stats.find(proxy => proxy.name === this.currentProxy.name);
          if (foundProxy) {
            selectProxy = foundProxy;
          }
        }
        this.currentProxy = selectProxy;
      }
      this.stats = stats;
    }));
    this.detectVersionUpdate();
    setInterval(this.detectVersionUpdate.bind(this), 10 * 60 * 1000);
  }

  async detectVersionUpdate() {
    const versionInfo: any = await this.statsService.getVersionInfo();
    if (this.latestVersion === versionInfo.latestVersion) {
      return;
    }
    this.latestVersion = versionInfo.latestVersion;
    if (versionInfo.latestVersion === versionInfo.runningVersion) {
      return;
    }
    this.snackBar.open(`Newer version ${versionInfo.latestVersion} is available!`, 'OK', {
      verticalPosition: 'top',
      horizontalPosition: 'right',
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
}
