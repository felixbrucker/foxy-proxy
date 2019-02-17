import { Component, OnInit } from '@angular/core';
import {StatsService} from '../stats.service';
import {Router} from '@angular/router';
import {LocalStorageService} from '../local-storage.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {

  static async getHashForString(algorithm, str) {
    const buffer = await crypto.subtle.digest(algorithm, new TextEncoder().encode(str));
    const view = new DataView(buffer);

    let hexCodes = '';
    for (let i = 0; i < view.byteLength; i += 4) {
      hexCodes += view.getUint32(i).toString(16).padStart(8, '0');
    }

    return hexCodes;
  }

  username: '';
  password: '';
  hide = true;
  invalidAuth = false;

  constructor(
    private statsService: StatsService,
    private localStorageService: LocalStorageService,
    private router: Router
  ) { }

  async ngOnInit() {
    this.statsService.getAuthenticatedObservable().subscribe(async authenticated => {
      if (!authenticated) {
        return;
      }
      await this.router.navigate(['/']);
    });
    this.statsService.init();
  }

  async login() {
    const passHash = await LoginComponent.getHashForString('sha-256', this.password);
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
