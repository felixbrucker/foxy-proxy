import {Component, OnInit, ViewEncapsulation} from '@angular/core';
import {StatsService} from '../stats.service';
import {LocalStorageService} from '../local-storage.service';
import {MatSnackBar} from '@angular/material';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class MainComponent implements OnInit {

  private stats = [];
  private currentProxy: any;
  private latestVersion = null;

  constructor(
    private statsService: StatsService,
    private localStorageService: LocalStorageService,
    private snackBar: MatSnackBar
  ) { }

  async ngOnInit() {
    this.statsService.getStatsObservable().subscribe((stats => {
      if (stats.length > 0) {
        this.setCurrentProxy(stats[0]);
      }
      this.stats = stats;
    }));
    this.statsService.init();
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

  getCurrentProxy() {
    return this.currentProxy;
  }

  setCurrentProxy(currentProxy) {
    this.currentProxy = currentProxy;
  }

  resetLocalConfig() {
    this.localStorageService.clearHideItems();
  }
}
