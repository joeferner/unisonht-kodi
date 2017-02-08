import {KodiClient} from "./KodiClient";
import * as Logger from "bunyan";
import {createLogger} from "../unisonht/lib/Log";

export class MockKodiClient implements KodiClient {
  private log: Logger;

  constructor() {
    this.log = createLogger('MockKodiClient');
  }

  on(): Promise<void> {
    this.log.info('on');
    return Promise.resolve();
  }

  off(): Promise<void> {
    this.log.info('off');
    return Promise.resolve();
  }

  buttonPress(buttonName: string): Promise<void> {
    this.log.info(`buttonPress ${buttonName}`);
    return Promise.resolve();
  }

  getStatus(): Promise<any> {
    this.log.info('getStatus');
    return Promise.resolve({});
  }
}
