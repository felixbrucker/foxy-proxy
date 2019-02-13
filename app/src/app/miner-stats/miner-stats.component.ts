import {Component, Input, OnInit} from '@angular/core';
import * as bytes from 'bytes';

@Component({
  selector: 'app-miner-stats',
  templateUrl: './miner-stats.component.html',
  styleUrls: ['./miner-stats.component.scss']
})
export class MinerStatsComponent implements OnInit {

  @Input() miner;
  @Input() totalCapacity: number;

  constructor() { }

  ngOnInit() {
  }

  getMiner() {
    return Object.keys(this.miner).sort().map(minerId => {
      let miner = this.miner[minerId];
      miner.id = minerId;

      return miner;
    });
  }

  getCapacityString(capacityInBytes) {
    return bytes(capacityInBytes);
  }
}
