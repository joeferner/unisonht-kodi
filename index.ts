import {Device, DeviceOptions} from "unisonht/lib/Device";

interface KodiOptions extends DeviceOptions {
  address: string;
  mac: string;
}

export default class Kodi extends Device {
  constructor(options: KodiOptions) {
    super(options);
  }
}