import { Component, OnInit } from '@angular/core';
import {StatsService} from '../stats.service';
import {Router} from '@angular/router';
import {LocalStorageService} from '../local-storage.service';
import {sha256} from 'hash.js';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {

  username: '';
  password: '';
  hide = true;
  invalidAuth = false;
  private runningVersion: any;

  constructor(
    private statsService: StatsService,
    private localStorageService: LocalStorageService,
    private router: Router
  ) { }

  async ngOnInit() {
    this.updateRunningVersion();
    this.statsService.getAuthenticatedObservable().subscribe(async authenticated => {
      if (!authenticated) {
        return;
      }
      await this.router.navigate(['/']);
    });
  }

  async updateRunningVersion() {
    const versionInfo: any = await this.statsService.getVersionInfo();
    this.runningVersion = versionInfo.runningVersion;
  }

  getTitle() {
    const versionAppend = this.runningVersion ? ` ${this.runningVersion}` : '';
    return `Foxy-Proxy${versionAppend}`;
  }

  async login() {
    const passHash = await sha256().update(this.password).digest('hex');
    const result = await this.statsService.authenticate(this.username, passHash);
    if (!result) {
      this.invalidAuth = true;
      return;
    } else {
      this.localStorageService.setAuthData(this.username, passHash);
    }
    this.statsService.init();
  }

  clearInvalidAuth() {
    this.invalidAuth = false;
  }
}
