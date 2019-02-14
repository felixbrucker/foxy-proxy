import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { NetDiffChartComponent } from './net-diff-chart.component';

describe('NetDiffChartComponent', () => {
  let component: NetDiffChartComponent;
  let fixture: ComponentFixture<NetDiffChartComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ NetDiffChartComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(NetDiffChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
