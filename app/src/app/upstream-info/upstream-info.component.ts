import * as bytes from 'bytes';
import {Component, Input, OnInit} from '@angular/core';
import * as moment from 'moment';

@Component({
  selector: 'app-upstream-info',
  templateUrl: './upstream-info.component.html',
  styleUrls: ['./upstream-info.component.scss']
})
export class UpstreamInfoComponent implements OnInit {

  @Input() name: string;
  @Input() estimatedCapacityInTB: number;
  @Input() historicalRounds: any;

  static getDLString(deadline) {
    if (deadline === null) {
      return 'N/A';
    }
    const duration = moment.duration(parseInt(deadline, 10), 'seconds');
    if (duration.months() > 0) {
      return `${duration.months()}m ${duration.days()}d ${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
    } else if (duration.days() > 0) {
      return `${duration.days()}d ${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
    }

    return `${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
  }

  constructor() { }

  ngOnInit() {
  }

  getEstimatedCapacity() {
    return bytes(this.estimatedCapacityInTB * Math.pow(1024, 4));
  }

  getBestDL() {
    const bestDL = this.historicalRounds
      .map(round => round.bestDL)
      .filter(bestDL => bestDL !== null)
      .map(bestDL => parseInt(bestDL, 10))
      .reduce((acc, curr) => {
        if (acc === null) {
          return curr;
        }
        return acc < curr ? acc : curr;
      }, null);

    return UpstreamInfoComponent.getDLString(bestDL);
  }

  getAvgDL() {
    const rounds = this.historicalRounds
      .map(round => round.bestDL)
      .filter(bestDL => bestDL !== null)
      .map(bestDL => parseInt(bestDL, 10));
    if (rounds.length === 0) {
      return UpstreamInfoComponent.getDLString(null);
    }
    const avgDL = rounds.reduce((acc, curr) => acc + curr, 0) / rounds.length;

    return UpstreamInfoComponent.getDLString(avgDL);
  }
}
