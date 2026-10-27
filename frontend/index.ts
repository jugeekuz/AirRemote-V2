import { registerRootComponent } from 'expo';

import App from './src/app/app';
import { bootstrap } from './src/app/bootstrap';

bootstrap();
// Registers App as 'main' and sets up the environment for Expo Go and
// native builds alike.
registerRootComponent(App);
