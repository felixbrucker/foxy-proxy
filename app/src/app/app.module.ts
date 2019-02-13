import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MainComponent } from './main/main.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import {MatButtonModule, MatCardModule, MatGridListModule, MatIconModule, MatListModule} from '@angular/material';
import { NetDiffChartComponent } from './net-diff-chart/net-diff-chart.component';
import { CurrentRoundInfoComponent } from './current-round-info/current-round-info.component';
import {FlexLayoutModule} from '@angular/flex-layout';
import { RoundStatsComponent } from './round-stats/round-stats.component';
import { MinerStatsComponent } from './miner-stats/miner-stats.component';
import { ProxyComponent } from './proxy/proxy.component';
import { UpstreamComponent } from './upstream/upstream.component';
import { UpstreamInfoComponent } from './upstream-info/upstream-info.component';

@NgModule({
  declarations: [
    AppComponent,
    MainComponent,
    NetDiffChartComponent,
    CurrentRoundInfoComponent,
    RoundStatsComponent,
    MinerStatsComponent,
    ProxyComponent,
    UpstreamComponent,
    UpstreamInfoComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatGridListModule,
    FlexLayoutModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
