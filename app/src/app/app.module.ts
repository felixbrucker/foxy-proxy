import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MainComponent } from './main/main.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NetDiffChartComponent } from './net-diff-chart/net-diff-chart.component';
import { FlexLayoutModule } from '@angular/flex-layout';
import { RoundStatsComponent } from './round-stats/round-stats.component';
import { ProxyComponent } from './proxy/proxy.component';
import { UpstreamComponent } from './upstream/upstream.component';
import { UpstreamInfoComponent } from './upstream-info/upstream-info.component';
import { ProxyInfoComponent } from './proxy-info/proxy-info.component';
import { BlocksWonListComponent } from './blocks-won-list/blocks-won-list.component';
import { LoginComponent } from './login/login.component';
import { FormsModule } from '@angular/forms';
import { MenuComponent } from './menu/menu.component';
import { NewVersionSnackbarComponent } from './new-version-snackbar/new-version-snackbar.component';
import { SettingsComponent } from './settings/settings.component';
import {MatCardModule} from "@angular/material/card";
import {MatButtonModule} from "@angular/material/button";
import {MatIconModule} from "@angular/material/icon";
import {MatProgressBarModule} from "@angular/material/progress-bar";
import {MatToolbarModule} from "@angular/material/toolbar";
import {MatTooltipModule} from "@angular/material/tooltip";
import {MatTabsModule} from "@angular/material/tabs";
import {MatListModule} from "@angular/material/list";
import {MatFormFieldModule} from "@angular/material/form-field";
import {MatInputModule} from "@angular/material/input";
import {MatSnackBarModule} from "@angular/material/snack-bar";
import {MatMenuModule} from "@angular/material/menu";
import {MatProgressSpinnerModule} from "@angular/material/progress-spinner";
import {MatCheckboxModule} from "@angular/material/checkbox";
import {MatRadioModule} from "@angular/material/radio";

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
    BlocksWonListComponent,
    LoginComponent,
    MenuComponent,
    NewVersionSnackbarComponent,
    SettingsComponent
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
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatMenuModule,
    FormsModule,
    MatProgressSpinnerModule,
    FlexLayoutModule,
    MatCheckboxModule,
    MatRadioModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule { }
