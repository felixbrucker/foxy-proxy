import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { NewVersionSnackbarComponent } from './new-version-snackbar.component';

describe('NewVersionSnackbarComponent', () => {
  let component: NewVersionSnackbarComponent;
  let fixture: ComponentFixture<NewVersionSnackbarComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ NewVersionSnackbarComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(NewVersionSnackbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
