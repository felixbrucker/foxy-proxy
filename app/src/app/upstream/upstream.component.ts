import {Component, Input, OnInit} from '@angular/core';
import {LocalStorageService} from '../local-storage.service';

@Component({
  selector: 'app-upstream',
  templateUrl: './upstream.component.html',
  styleUrls: ['./upstream.component.scss']
})
export class UpstreamComponent implements OnInit {

  @Input() upstream: any;
  @Input() miners: any;
  @Input() maxScanTime: number;

  constructor(private localStorageService: LocalStorageService) { }

  ngOnInit() {
  }

  showCard(identifier) {
    return this.localStorageService.shouldShowItem(identifier, this.upstream.fullName);
  }
}
