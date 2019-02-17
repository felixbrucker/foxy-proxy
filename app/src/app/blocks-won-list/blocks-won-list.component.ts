import {Component, Input, OnInit} from '@angular/core';
import * as moment from 'moment';
import {LocalStorageService} from '../local-storage.service';

@Component({
  selector: 'app-blocks-won-list',
  templateUrl: './blocks-won-list.component.html',
  styleUrls: ['./blocks-won-list.component.scss']
})
export class BlocksWonListComponent implements OnInit {

  @Input() historicalRounds: any;
  @Input() isBHD: boolean;
  @Input() upstreamFullName: string;

  constructor(private localStorageService: LocalStorageService) { }

  ngOnInit() {
  }

  getLastFourBlockWins() {
    return this.historicalRounds
      .filter(round => round.roundWon)
      .reverse()
      .slice(0, 4);
  }

  getTimeDiff(date) {
    return moment.duration(moment(date).diff(moment())).humanize(true);
  }

  hideCard() {
    this.localStorageService.hideItem('blocks-won-list', this.upstreamFullName);
  }
}
