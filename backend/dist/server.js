import 'dotenv/config';
import { createApp } from './app.js';
import { env } from './config.js';
const app = createApp();
app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`eSRS backend listening on http://localhost:${env.PORT}`);
});
