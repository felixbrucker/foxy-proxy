import * as moment from 'moment';
import {Component, Input, OnInit} from '@angular/core';
import {Duration} from 'moment';
import {Observable, Subscription} from 'rxjs/Rx';

@Component({
  selector: 'app-current-round-info',
  templateUrl: './current-round-info.component.html',
  styleUrls: ['./current-round-info.component.scss']
})
export class CurrentRoundInfoComponent implements OnInit {

  @Input() currentBlock: number;
  @Input() roundStart: string;
  @Input() netDiff: number;
  @Input() bestDL: string;

  private counter: Observable<Duration>;
  private subscription: Subscription;
  private elapsedSinceStart: string = '00:00:00';

  constructor() { }

  ngOnInit() {
    this.counter = Observable.interval(1000).map(() => moment.duration(moment().diff(moment(this.roundStart))));
    this.subscription = this.counter.subscribe((duration) =>
      this.elapsedSinceStart = `${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`
    );
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
}
