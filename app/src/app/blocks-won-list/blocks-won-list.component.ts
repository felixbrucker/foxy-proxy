import {Component, Input, OnInit} from '@angular/core';
import * as moment from 'moment';

@Component({
  selector: 'app-blocks-won-list',
  templateUrl: './blocks-won-list.component.html',
  styleUrls: ['./blocks-won-list.component.scss']
})
export class BlocksWonListComponent implements OnInit {

  @Input() historicalRounds: any;
  @Input() isBHD: boolean;

  constructor() { }

  ngOnInit() {
  }

  getLastFourBlockWins() {
    return this.historicalRounds
      .filter(round => round.roundWon)
      .slice(0)
      .reverse()
      .slice(0, 4);
  }

  getTimeDiff(date) {
    return moment.duration(moment(date).diff(moment())).humanize(true);
  }
}
