import {Component, Input, OnInit} from '@angular/core';

@Component({
  selector: 'app-upstream',
  templateUrl: './upstream.component.html',
  styleUrls: ['./upstream.component.scss']
})
export class UpstreamComponent implements OnInit {

  @Input() upstream: any;
  @Input() miners: any;
  @Input() maxScanTime: number;
  @Input() totalCapacity: number;

  constructor() { }

  ngOnInit() {
  }

}
