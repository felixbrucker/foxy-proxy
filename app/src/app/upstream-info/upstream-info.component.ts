import {Component, Input, OnInit} from '@angular/core';

@Component({
  selector: 'app-upstream-info',
  templateUrl: './upstream-info.component.html',
  styleUrls: ['./upstream-info.component.scss']
})
export class UpstreamInfoComponent implements OnInit {

  @Input() name: string;

  constructor() { }

  ngOnInit() {
  }

}
