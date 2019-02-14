import {Component, Input, OnInit} from '@angular/core';

@Component({
  selector: 'app-proxy',
  templateUrl: './proxy.component.html',
  styleUrls: ['./proxy.component.scss']
})
export class ProxyComponent implements OnInit {

  @Input() proxy: any;

  constructor() { }

  ngOnInit() {
  }

}
