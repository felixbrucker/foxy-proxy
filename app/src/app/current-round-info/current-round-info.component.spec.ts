import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CurrentRoundInfoComponent } from './current-round-info.component';

describe('CurrentRoundInfoComponent', () => {
  let component: CurrentRoundInfoComponent;
  let fixture: ComponentFixture<CurrentRoundInfoComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ CurrentRoundInfoComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CurrentRoundInfoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
