import {Component, Input, OnChanges, OnInit, SimpleChanges, ViewChild} from '@angular/core';
import { Chart } from 'chart.js';

@Component({
  selector: 'app-net-diff-chart',
  templateUrl: './net-diff-chart.component.html',
  styleUrls: ['./net-diff-chart.component.scss']
})
export class NetDiffChartComponent implements OnInit, OnChanges {

  @Input() historicalRounds;

  @ViewChild('netDiffChart') private netDiffChartRef;
  private netDiffChart:any = {};

  constructor() { }

  ngOnInit() {
    this.netDiffChart = new Chart(this.netDiffChartRef.nativeElement, {
      type: 'line',
      data: {
        labels: this.historicalRounds.map(round => round.blockHeight),
        datasets: [{
          data: this.historicalRounds.map(round => round.netDiff),
          pointRadius: 0,
          backgroundColor: [
            'rgba(33, 224, 132, 0.5)',
          ],
          borderColor: [
            'rgb(51, 51, 51, 1)',
          ],
        }],
      },
      options: {
        legend: {
          display: false
        },
        scales: {
          xAxes: [{
            display: true,
            ticks: {
              fontColor: "#dcddde",
            },
          }],
          yAxes: [{
            display: true,
            ticks: {
              fontColor: "#dcddde",
            },
          }]
        },
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (Object.keys(this.netDiffChart).length === 0) {
      return;
    }
    this.netDiffChart.data.labels = changes.historicalRounds.currentValue.map(round => round.blockHeight);
    this.netDiffChart.data.datasets[0].data = changes.historicalRounds.currentValue.map(round => round.netDiff);
    this.netDiffChart.update();
  }

}
