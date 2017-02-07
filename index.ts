import {Device, UnisonHT, UnisonHTResponse} from "unisonht";
import * as net from "net";
import * as wol from "wol";
import * as express from "express";

export class Kodi extends Device {
  private socket: net.Socket;
  private speed: number;

  static get JSON_PORT() {
    return 9090;
  }

  constructor(deviceName: string, options: Kodi.Options) {
    super(deviceName, options);
    this.speed = 1;
    options.port = options.port || Kodi.JSON_PORT;
    options.shutdown = options.shutdown !== undefined ? options.shutdown : false;
  }

  start(unisonht: UnisonHT): Promise<void> {
    return super.start(unisonht)
      .then(() => {
        unisonht.getApp().post(`${this.getPathPrefix()}/on`, this.handleOn.bind(this));
        unisonht.getApp().post(`${this.getPathPrefix()}/off`, this.handleOff.bind(this));
      });
  }

  handleOn(req: express.Request, res: UnisonHTResponse, next: express.NextFunction): void {
    res.promiseNoContent(this.wakeUp(60));
  }

  handleOff(req: express.Request, res: UnisonHTResponse, next: express.NextFunction): void {
    if (this.getOptions().shutdown) {
      res.promiseNoContent(this.sendShutdown());
    } else {
      res.promiseNoContent(Promise.resolve());
    }
  }

  protected handleButtonPress(req: express.Request, res: UnisonHTResponse, next: express.NextFunction): void {
    const buttonName = req.query.button;
    this.log.debug(`buttonPress ${buttonName}`);
    const kodiButton = Kodi.translateButtonToKodi(buttonName);
    if (buttonName === 'PAUSE' || buttonName === 'PLAY') {
      this.speed = 1;
      res.promiseNoContent(
        this.sendPlayerJsonRequest({
          method: 'Player.PlayPause',
          params: {
            playerid: 0
          }
        })
      );
    } else if (buttonName === 'FASTFORWARD' || buttonName === 'REWIND') {
      res.promiseNoContent(
        this.sendPlayerJsonRequest({
          method: 'Player.SetSpeed',
          params: {
            speed: this.getNextSpeed(buttonName === 'FASTFORWARD' ? 1 : -1)
          }
        })
      );
    } else {
      res.promiseNoContent(
        this.sendJsonRequest({
          method: `Input.${kodiButton}`
        })
      );
    }
  }

  private sendPlayerJsonRequest(request: any): Promise<void> {
    return this.sendJsonRequest({
      method: `Player.GetActivePlayers`
    })
      .then((activePlayers) => {
        request.params.playerid = activePlayers.result[0].playerid;
        return this.sendJsonRequest(request);
      });
  }

  private getNextSpeed(dir): number {
    if (this.speed == 1 && dir < 0) {
      this.speed = -1;
    } else if (this.speed == -1 && dir > 0) {
      this.speed = 1;
    } else if (dir < 0 && this.speed > 0) {
      this.speed = this.speed / 2;
    } else if (dir > 0 && this.speed > 0) {
      this.speed = this.speed * 2;
    } else if (dir < 0 && this.speed < 0) {
      this.speed = this.speed * 2;
    } else if (dir > 0 && this.speed < 0) {
      this.speed = this.speed / 2;
    }
    return this.speed;
  }

  private wakeUp(retryCount): Promise<void> {
    return this.sendWakeOnLan()
      .then((): Promise<void> => {
        return this.getStatus().then(() => {
        });
      })
      .catch((err) => {
        this.log.debug('trying to wakeup kodi', err);
        if (retryCount === 0) {
          return Promise.reject(err);
        } else {
          return this.sleep(1000)
            .then(() => {
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

  getStatus(): Promise<Device.Status> {
    return this.sendJsonRequest({
      method: 'JSONRPC.Version',
    })
      .then((kodiStatus) => {
        return {
          power: Device.PowerState.ON,
          kodiStatus: kodiStatus.result ? kodiStatus.result : kodiStatus
        };
      });
  }

  private sendWakeOnLan(): Promise<void> {
    if (!this.getOptions().mac) {
      this.log.warn("Cannot send wake on lan because no MAC address was specified in the config.");
      return;
    }
    return new Promise<void>((resolve, reject) => {
      wol.wake(this.getOptions().mac, (err) => {
        if (err) {
          this.log.error('send wol failed: ', err);
          return reject(err);
        }
        resolve();
      });
    });
  }

  private sleep(ms: number) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }

  private sendJsonRequest(data: {jsonrpc?: string; method: string; id?: string}): Promise<any> {
    data.jsonrpc = data.jsonrpc || '2.0';
    data.id = data.id || '' + new Date().getTime();

    return this.getSocket()
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

          this.log.debug('sending', JSON.stringify(data));
          socket.on('error', (err) => {
            this.log.error('could not send', err);
            removeSocketListeners(err);
          });
          socket.on('data', (data) => {
            this.log.debug('receive', data.toString());
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
  }

  private getSocket(): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.writable) {
        return resolve(this.socket);
      }
      this.log.debug('connecting to %s:%d', this.getOptions().address, this.getOptions().port);
      this.socket = net.connect({
        host: this.getOptions().address,
        port: this.getOptions().port
      });
      this.socket.once('error', (err) => {
        this.log.error('connect error', err);
        reject(err);
      });
      this.socket.on('connect', () => {
        this.log.debug('connected to kodi');
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

  public getOptions(): Kodi.Options {
    return <Kodi.Options>super.getOptions();
  }
}

export module Kodi {
  export interface Options extends Device.Options {
    address: string;
    port?: number;
    mac: string;
    shutdown?: boolean;
  }
}
