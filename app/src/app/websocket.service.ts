import { Injectable } from '@angular/core';
import { io } from 'socket.io-client';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {

  private socket;

  constructor() {
    this.socket = io('/web-ui');
  }

  subscribe(topic, cb) {
    this.socket.on(topic, cb);
  }

  publish(topic, ...args) {
    this.socket.emit(topic, ...args);
  }

  unsubscribeAll(topic) {
    this.socket.removeAllListeners(topic);
  }

  reconnect() {
    this.socket.disconnect();
    this.socket.connect();
  }
}
