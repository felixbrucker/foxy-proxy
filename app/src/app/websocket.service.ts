import { Injectable } from '@angular/core';
import * as io from 'socket.io-client';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {

  private socket;

  constructor() {
    this.socket = io();
  }

  subscribe(topic, cb) {
    this.socket.on(topic, cb);
  }

  publish(topic, ...args) {
    this.socket.emit(topic, ...args);
  }
}
