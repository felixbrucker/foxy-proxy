import {Component, Input, OnInit, ViewChild} from '@angular/core';
import { Chart } from 'chart.js';

@Component({
  selector: 'app-round-stats',
  templateUrl: './round-stats.component.html',
  styleUrls: ['./round-stats.component.scss']
})
export class RoundStatsComponent implements OnInit {

  @Input() totalRounds: number;
  @Input() roundsWithDLs: number;
  @Input() roundsSubmitted: number;
  @Input() roundsWon: number;

  @ViewChild('roundsSubmittedChart') private roundsSubmittedChartRef;
  private roundsSubmittedChart = [];

  constructor() { }

  ngOnInit() {
    this.roundsSubmittedChart = new Chart(this.roundsSubmittedChartRef.nativeElement, {
      type: 'pie',
      data: {
        labels: ['Rounds Won', 'Rounds Submitted', 'Rounds with DLs', 'Rounds without DLs'],
        datasets: [{
          data: [
            this.roundsWon,
            this.roundsSubmitted - this.roundsWon,
            this.roundsWithDLs - this.roundsSubmitted,
            this.totalRounds - this.roundsWithDLs,
          ],
          pointRadius: 0,
          backgroundColor: [
            'rgba(21, 242, 40, 0.5)',
            'rgba(114, 14, 237, 0.5)',
            'rgba(61, 120, 204, 0.5)',
          ],
          borderColor: [
            'rgb(51, 51, 51, 1)',
            'rgb(51, 51, 51, 1)',
            'rgb(51, 51, 51, 1)',
            'rgb(51, 51, 51, 1)',
          ],
        }],
      },
      options: {
        legend: {
          display: false
        },
      }
    });
  }

  getSubmitPercent() {
    if (this.totalRounds === 0) {
      return 0;
    }

    return (this.roundsSubmitted / this.totalRounds * 100).toFixed(2);
  }
}
