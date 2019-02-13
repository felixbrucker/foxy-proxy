import {Component, Input, OnInit} from '@angular/core';

@Component({
  selector: 'app-proxy-info',
  templateUrl: './proxy-info.component.html',
  styleUrls: ['./proxy-info.component.scss']
})
export class ProxyInfoComponent implements OnInit {

  @Input() name: string;
  @Input() maxScanTime: number;

  constructor() { }

  ngOnInit() {
  }

}
