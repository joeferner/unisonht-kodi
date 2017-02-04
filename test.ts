import {UnisonHT} from "unisonht";
import {Kodi} from ".";

const unisonht = new UnisonHT();

unisonht.use(new Kodi('kodi', {
  address: '192.168.0.170',
  mac: 'b8:27:eb:56:17:3c'
}));

unisonht.listen(3000);
