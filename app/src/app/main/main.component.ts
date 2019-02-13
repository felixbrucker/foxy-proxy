import {Component, OnInit} from '@angular/core';
import {StatsService} from '../stats.service';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss']
})
export class MainComponent implements OnInit {

  private stats = [];

  constructor(private statsService: StatsService) { }

  ngOnInit() {
    this.statsService.getStatsObservable().subscribe((stats => {
      this.stats = stats;
    }));
    this.statsService.init();
  }
}
