import * as bytes from 'bytes';
import * as moment from 'moment';
import {Component, Input, OnInit} from '@angular/core';
import {Observable, Subscription} from 'rxjs';

@Component({
  selector: 'app-proxy-info',
  templateUrl: './proxy-info.component.html',
  styleUrls: ['./proxy-info.component.scss']
})
export class ProxyInfoComponent implements OnInit {

  @Input() name: string;
  @Input() maxScanTime: number;
  @Input() totalCapacity: number;
  @Input() miners: any;
  @Input() currentBlockHeights: any;

  public scanProgress = 100;
  private counter: Observable<any>;
  private subscription: Subscription;

  constructor() { }

  ngOnInit() {
    this.counter = Observable.interval(1000);
    this.subscription = this.counter.subscribe(() => this.scanProgress = this.getScanProgress());
  }

  getMiner() {
    return Object.keys(this.miners).sort().map(minerId => {
      let miner = this.miners[minerId];
      miner.id = minerId;
      miner.progress = this.getProgressForMiner(miner);

      return miner;
    });
  }

  getCapacityString(capacityInBytes) {
    return bytes(capacityInBytes);
  }

  getScanProgress() {
    const miners = Object.keys(this.miners).map(key => this.miners[key]);
    const scanProgress = miners.map(miner => {
      const progress = this.getProgressForMiner(miner);
      if (!miner.capacity) {
        return progress / miners.length;
      }
      const capacityShare = miner.capacity / this.totalCapacity;

      return capacityShare * progress;
    }).reduce((acc, curr) => acc + curr, 0);

    return Math.min(Math.round(scanProgress), 100);
  }

  getProgressForMiner(miner) {
    const maxScanTime = miner.maxScanTime || this.maxScanTime;
    if (!miner.startedAt) {
      return 100;
    }
    const elapsed = moment().diff(miner.startedAt, 'seconds');

    return Math.min(1, elapsed/maxScanTime) * 100;
  }

  getState(miner) {
    const lastActiveDiffMin = moment().diff(miner.lastTimeActive, 'minutes');
    const lastActiveError = this.currentBlockHeights.every(height => Math.abs(miner.lastBlockActive - height) > 7);
    if (lastActiveDiffMin >= 5 && lastActiveError) {
      return 0;
    }
    const lastActiveWarn = this.currentBlockHeights.some(height => {
      const diff = Math.abs(miner.lastBlockActive - height);

      return diff >= 2 && diff < 7;
    });
    if (lastActiveDiffMin >= 5 && lastActiveWarn) {
      return 1;
    }

    return 2;
  }
}
