import { assertConfig, settings } from './config.js';
import { createApp } from './app.js';
assertConfig();
import('./scripts/setup-central.js').catch(err => console.error('Setup error:', err));
createApp().listen(settings.port,settings.host,()=>console.log(`TPOS_V2_CONNECTED http://${settings.host}:${settings.port}`));
