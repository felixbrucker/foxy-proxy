import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MainComponent } from './main/main.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import {
  MatButtonModule,
  MatCardModule,
  MatIconModule, MatListModule,
  MatProgressBarModule, MatProgressSpinnerModule, MatTabsModule, MatToolbarModule, MatTooltipModule
} from '@angular/material';
import { NetDiffChartComponent } from './net-diff-chart/net-diff-chart.component';
import {FlexLayoutModule} from '@angular/flex-layout';
import { RoundStatsComponent } from './round-stats/round-stats.component';
import { ProxyComponent } from './proxy/proxy.component';
import { UpstreamComponent } from './upstream/upstream.component';
import { UpstreamInfoComponent } from './upstream-info/upstream-info.component';
import { ProxyInfoComponent } from './proxy-info/proxy-info.component';
import { BlocksWonListComponent } from './blocks-won-list/blocks-won-list.component';

@NgModule({
  declarations: [
    AppComponent,
    MainComponent,
    NetDiffChartComponent,
    RoundStatsComponent,
    ProxyComponent,
    UpstreamComponent,
    UpstreamInfoComponent,
    ProxyInfoComponent,
    BlocksWonListComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatToolbarModule,
    MatTooltipModule,
    MatTabsModule,
    MatListModule,
    MatProgressSpinnerModule,
    FlexLayoutModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
