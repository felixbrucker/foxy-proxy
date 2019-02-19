import * as bytes from 'bytes';
import {Component, Input, OnInit} from '@angular/core';
import * as moment from 'moment';
import {Observable, Subscription, interval} from 'rxjs';
import {map} from 'rxjs/operators';
import {Duration} from 'moment';

@Component({
  selector: 'app-upstream-info',
  templateUrl: './upstream-info.component.html',
  styleUrls: ['./upstream-info.component.scss']
})
export class UpstreamInfoComponent implements OnInit {

  @Input() name: string;
  @Input() estimatedCapacityInTB: number;
  @Input() historicalRounds: any;
  @Input() currentBlock: number;
  @Input() roundStart: string;
  @Input() netDiff: number;
  @Input() bestDL: string;
  @Input() miners: any;
  @Input() maxScanTime: number;

  private counter: Observable<Duration>;
  private subscription: Subscription;
  private elapsedSinceStart: string = '00:00:00';
  public scanProgress = 100;

  constructor() { }

  ngOnInit() {
    this.counter = interval(1000).pipe(map(() => moment.duration(moment().diff(this.roundStart))));
    this.subscription = this.counter.subscribe((duration) => {
        this.elapsedSinceStart = `${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
        this.scanProgress = this.getScanProgress();
    });
  }

  getStartTime() {
    return moment(this.roundStart).format('HH:mm:ss');
  }

  getBestDLString() {
    if (!this.bestDL) {
      return 'N/A';
    }
    const duration = moment.duration(parseInt(this.bestDL, 10), 'seconds');
    if (duration.months() > 0) {
      return `${duration.months()}m ${duration.days()}d ${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
    } else if (duration.days() > 0) {
      return `${duration.days()}d ${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
    }

    return `${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
  }

  getElapsedSinceStart() {
    return this.elapsedSinceStart;
  }

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

  getScanProgress() {
    const miners = Object.keys(this.miners).map(key => this.miners[key]);
    const greatestMaxScanTime = miners.reduce((acc, curr) => {
      if (!acc) {
        return curr.maxScanTime;
      }

      return acc > curr.maxScanTime ? acc : curr.maxScanTime;
    }, 0);
    const scanningMiners = miners.filter(miner => miner.currentHeightScanning === this.currentBlock);
    const totalCapacity = scanningMiners.reduce((acc, miner) => acc + (miner.capacity || 0), 0);
    const elapsed = moment().diff(this.roundStart, 'seconds');
    if (scanningMiners.length === 0 && elapsed >= greatestMaxScanTime) {
      return 100;
    }
    if (scanningMiners.length === 0 && elapsed < greatestMaxScanTime) {
      return 0;
    }

    const scanProgress = scanningMiners.map(miner => {
      const progress = this.getProgressForMiner(miner);
      if (!miner.capacity) {
        return progress / scanningMiners.length;
      }
      const capacityShare = miner.capacity / totalCapacity;

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
}
