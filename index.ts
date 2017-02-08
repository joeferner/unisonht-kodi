import {Device, UnisonHT, UnisonHTResponse} from "unisonht";
import * as express from "express";
import {MockKodiClient} from "./MockKodiClient";
import {KodiClientImpl} from "./KodiClientImpl";
import {KodiClient} from "./KodiClient";

export class Kodi extends Device {
  private client: KodiClient;

  static get JSON_PORT() {
    return 9090;
  }

  constructor(deviceName: string, options: Kodi.Options) {
    super(deviceName, options);
    this.client = process.env.NODE_ENV === 'development'
      ? new MockKodiClient()
      : new KodiClientImpl(
        options.address,
        options.port || Kodi.JSON_PORT,
        options.mac
      );
    options.shutdown !== undefined ? options.shutdown : false
  }

  start(unisonht: UnisonHT): Promise<void> {
    return super.start(unisonht)
      .then(() => {
        unisonht.getApp().post(`${this.getPathPrefix()}/on`, this.handleOn.bind(this));
        unisonht.getApp().post(`${this.getPathPrefix()}/off`, this.handleOff.bind(this));
      });
  }

  handleOn(req: express.Request, res: UnisonHTResponse, next: express.NextFunction): void {
    res.promiseNoContent(this.client.on());
  }

  handleOff(req: express.Request, res: UnisonHTResponse, next: express.NextFunction): void {
    if (this.getOptions().shutdown) {
      res.promiseNoContent(this.client.off());
    } else {
      res.promiseNoContent(Promise.resolve());
    }
  }

  protected handleButtonPress(req: express.Request, res: UnisonHTResponse, next: express.NextFunction): void {
    const buttonName = req.query.button;
    this.log.debug(`buttonPress ${buttonName}`);
    res.promiseNoContent(this.client.buttonPress(buttonName));
  }

  getStatus(): Promise<Device.Status> {
    return this.client.getStatus()
      .then((kodiStatus) => {
        return {
          power: Device.PowerState.ON,
          kodiStatus: kodiStatus.result ? kodiStatus.result : kodiStatus
        };
      });
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
