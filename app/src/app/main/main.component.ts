import {Component, OnInit} from '@angular/core';
import {StatsService} from '../stats.service';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss']
})
export class MainComponent implements OnInit {

  private stats = [];
  private currentProxy: any;

  constructor(private statsService: StatsService) { }

  ngOnInit() {
    this.statsService.getStatsObservable().subscribe((stats => {
      if (this.stats.length === 0 && stats.length !== 0) {
        this.setCurrentProxy(stats[0]);
      }
      this.stats = stats;
    }));
    this.statsService.init();
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
}
