import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { BlocksWonListComponent } from './blocks-won-list.component';

describe('BlocksWonListComponent', () => {
  let component: BlocksWonListComponent;
  let fixture: ComponentFixture<BlocksWonListComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ BlocksWonListComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(BlocksWonListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
