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
  @Input() coin: string;

  constructor(private localStorageService: LocalStorageService) { }

  ngOnInit() {
    if (this.coin === undefined) {
      this.coin = this.isBHD ? 'BHD' : 'BURST';
    }
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

  getBlockExplorerLink(height) {
    const coin = this.coin && this.coin.toUpperCase();
    switch (coin) {
      case 'BHD':
        return `https://www.btchd.org/explorer/block/${height}`;
      case 'BURST':
        return `https://explorer.burstcoin.network/?action=block_inspect&height=${height}`;
      case 'BOOM':
        return `https://explorer.boomcoin.org/block/${height}`;
      case 'LHD':
        return `https://ltchd.io/explorer/block/${height}`;
      case 'HDD':
        return `https://www.hdd.cash/block.html?height=${height}`;
      case 'XHD':
        return `https://explorer.xrphd.org/block/${height}`;
      case 'LAVA':
        return `http://explorer.lavatech.org/block-height/${height}`;
      default:
        return null;
    }
  }
}
