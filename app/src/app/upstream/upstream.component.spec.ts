import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { UpstreamComponent } from './upstream.component';

describe('UpstreamComponent', () => {
  let component: UpstreamComponent;
  let fixture: ComponentFixture<UpstreamComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ UpstreamComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(UpstreamComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
