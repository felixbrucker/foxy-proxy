import {Component, Input, OnChanges, OnInit, SimpleChanges, ViewChild} from '@angular/core';
import { Chart } from 'chart.js';
import {LocalStorageService} from '../local-storage.service';

@Component({
  selector: 'app-net-diff-chart',
  templateUrl: './net-diff-chart.component.html',
  styleUrls: ['./net-diff-chart.component.scss']
})
export class NetDiffChartComponent implements OnInit, OnChanges {
  static getScaledRounds(rounds) {
    let scaledRounds = rounds;
    while (scaledRounds.length > 1000) {
      scaledRounds = scaledRounds.filter((round, index) => index % 10 !== 0);
    }

    return scaledRounds;
  }

  @Input() historicalRounds;
  @Input() upstreamFullName: string;

  @ViewChild('netDiffChart', {static: true}) private netDiffChartRef;
  private netDiffChart:any = {};

  constructor(private localStorageService: LocalStorageService) { }

  ngOnInit() {
    const scaledRounds = NetDiffChartComponent.getScaledRounds(this.historicalRounds);
    this.netDiffChart = new Chart(this.netDiffChartRef.nativeElement, {
      type: 'line',
      data: {
        labels: scaledRounds.map(round => round.blockHeight),
        datasets: [{
          data: scaledRounds.map(round => round.netDiff),
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
          }],
        },
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (Object.keys(this.netDiffChart).length === 0) {
      return;
    }
    const scaledRounds = NetDiffChartComponent.getScaledRounds(changes.historicalRounds.currentValue);
    this.netDiffChart.data.labels = scaledRounds.map(round => round.blockHeight);
    this.netDiffChart.data.datasets[0].data = scaledRounds.map(round => round.netDiff);
    this.netDiffChart.update();
  }

  hideCard() {
    this.localStorageService.hideItem('net-diff-chart', this.upstreamFullName);
  }
}
