import {UnisonHTDevice} from "unisonht";
import * as net from "net";
import * as wol from "wol";
import createLogger from "unisonht/lib/Log";

const log = createLogger('kodi');

export default class Kodi implements UnisonHTDevice {
  private options: Kodi.Options;
  private socket: net.Socket;
  private speed: number;

  static get JSON_PORT() {
    return 9090;
  }

  constructor(options: Kodi.Options) {
    this.speed = 1;
    this.options = options;
    this.options.port = this.options.port || Kodi.JSON_PORT;
    this.options.shutdown = this.options.shutdown !== undefined ? this.options.shutdown : false;
  }

  getName(): string {
    return this.options.name;
  }

  ensureOn(): Promise<void> {
    return this.wakeUp(60);
  }

  ensureOff(): Promise<void> {
    if (this.options.shutdown) {
      return this.sendShutdown();
    } else {
      return Promise.resolve();
    }
  }

  buttonPress(button: string): Promise<void> {
    log.debug(`buttonPress ${button}`);
    const kodiButton = Kodi.translateButtonToKodi(button);
    let request: any;
    if (button === 'PAUSE' || button === 'PLAY'){
      request = {
        method: 'Player.PlayPause',
        params: {
          playerid: 0
        }
      };
    } else if (button === 'FASTFORWARD' || button === 'REWIND') {
      request = {
            method: 'Player.PlayPause',
            params: {
                playerid: 0,
                speed: this.getNextSpeed(button === 'FASTFORWARD' ? 1 : -1)
            }
        };
    } else {
      request = {
        method: `Input.${kodiButton}`
      };
    }
    return this.sendJsonRequest(request);
  }

  private getNextSpeed(dir): number {
    if (this.speed == 1 && dir < 0) {
      this.speed = -1;
    } else {
      this.speed = this.speed * (2 * dir);
    }
    return this.speed;
  }

  private wakeUp(retryCount): Promise<void> {
    return this.sendWakeOnLan()
      .then(()=> {
        return this.getStatus();
      })
      .catch((err)=> {
        log.debug('trying to wakeup kodi', err);
        if (retryCount === 0) {
          return Promise.reject(err);
        } else {
          return this.sleep(1000)
            .then(()=> {
              return this.wakeUp(retryCount--);
            });
        }
      });
  }

  private sendShutdown(): Promise<void> {
    return this.sendJsonRequest({
      method: 'System.Shutdown',
    });
  }

  getStatus(): Promise<any> {
    return this.sendJsonRequest({
      method: 'JSONRPC.Version',
    });
  }

  private sendWakeOnLan(): Promise<void> {
    if (!this.options.mac) {
      log.warn("Cannot send wake on lan because no MAC address was specified in the config.");
      return;
    }
    return new Promise<void>((resolve, reject) => {
      wol.wake(this.options.mac, (err) => {
        if (err) {
          log.error('send wol failed: ', err);
          return reject(err);
        }
        resolve();
      });
    });
  }

  private sleep(ms: number) {
    return new Promise((resolve)=> {
      setTimeout(()=> {
        resolve();
      }, ms);
    });
  }

  private sendJsonRequest(data: {jsonrpc?: string; method: string; id?: string}): Promise<any> {
    data.jsonrpc = data.jsonrpc || '2.0';
    data.id = data.id || '' + new Date().getTime();

    this.getSocket()
      .then((socket) => {
        return new Promise((resolve, reject) => {
          const removeSocketListeners = (err: Error, result?) => {
            socket.removeAllListeners('error');
            socket.removeAllListeners('data');
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          };

          log.debug('sending', JSON.stringify(data));
          socket.on('error', (err) => {
            log.error('could not send', err);
            removeSocketListeners(err);
          });
          socket.on('data', (data) => {
            log.debug('receive', data.toString());
            try {
              const json = JSON.parse(data.toString());
              removeSocketListeners(null, json);
            } catch (err) {
              removeSocketListeners(err);
            }
          });
          socket.write(JSON.stringify(data) + '\n', (err) => {
            if (err) {
              removeSocketListeners(err);
            }
          });
        });
      });

    return Promise.resolve();
  }

  private getSocket(): Promise<net.Socket> {
    return new Promise((resolve, reject)=> {
      if (this.socket && this.socket.writable) {
        return resolve(this.socket);
      }
      log.debug('connecting to %s:%d', this.options.address, this.options.port);
      this.socket = net.connect({
        host: this.options.address,
        port: this.options.port
      });
      this.socket.once('error', (err) => {
        log.error('connect error', err);
        reject(err);
      });
      this.socket.on('connect', () => {
        log.debug('connected to kodi');
        this.socket.removeAllListeners('error');
        resolve(this.socket);
      });
      this.socket.on('end', () => {
        this.socket = null;
      })
    });
  }

  private static translateButtonToKodi(button: string) {
    switch (button.toUpperCase()) {
      case 'GUIDE':
        return 'ContextMenu';
      default:
        return button.substr(0, 1).toUpperCase() + button.substr(1);
    }
  }
}

module Kodi {
  export interface Options {
    name: string;
    address: string;
    port?: number;
    mac: string;
    shutdown?: boolean;
  }
}