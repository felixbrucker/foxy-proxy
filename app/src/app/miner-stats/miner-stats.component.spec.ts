import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { MinerStatsComponent } from './miner-stats.component';

describe('MinerStatsComponent', () => {
  let component: MinerStatsComponent;
  let fixture: ComponentFixture<MinerStatsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ MinerStatsComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(MinerStatsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
