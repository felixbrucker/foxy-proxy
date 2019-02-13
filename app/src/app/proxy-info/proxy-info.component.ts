import {Component, Input, OnInit} from '@angular/core';
import * as moment from 'moment';

@Component({
  selector: 'app-proxy-info',
  templateUrl: './proxy-info.component.html',
  styleUrls: ['./proxy-info.component.scss']
})
export class ProxyInfoComponent implements OnInit {

  @Input() name: string;
  @Input() maxScanTime: number;
  @Input() miners: any;

  constructor() { }

  ngOnInit() {
  }

  getScanProgress() {
    const miners = Object.keys(this.miners).map(key => this.miners[key]);
    const scanProgress = miners.map(miner => {
      const maxScanTime = miner.maxScanTime || this.maxScanTime;
      if (!miner.startedAt) {
        return 1;
      }
      const elapsed = moment().diff(miner.startedAt, 'seconds');

      return Math.min(1, elapsed/maxScanTime);
    }).reduce((acc, curr) => acc + curr, 0) / miners.length;

    return Math.round(scanProgress * 100);
  }
}
