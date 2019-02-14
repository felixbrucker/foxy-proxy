import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { RoundStatsComponent } from './round-stats.component';

describe('RoundStatsComponent', () => {
  let component: RoundStatsComponent;
  let fixture: ComponentFixture<RoundStatsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ RoundStatsComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(RoundStatsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
