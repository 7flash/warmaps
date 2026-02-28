import { start } from 'melina';
import path from 'path';

const appDir = path.join(import.meta.dir, 'app');

await start({
    port: parseInt(process.env.BUN_PORT || "4444"),
    appDir,
    defaultTitle: 'STARWAR — Global Conflict Monitor',
});
