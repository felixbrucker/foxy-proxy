import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ProxyInfoComponent } from './proxy-info.component';

describe('ProxyInfoComponent', () => {
  let component: ProxyInfoComponent;
  let fixture: ComponentFixture<ProxyInfoComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ProxyInfoComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ProxyInfoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
