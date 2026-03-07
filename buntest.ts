import { build } from 'bun';

const result = await build({
    entrypoints: ['app/page.client.tsx'],
    outdir: undefined,
    target: 'browser',
    sourcemap: 'linked'
});
console.log('Success:', result.success);
console.log('Logs:', result.logs);
console.log('Outputs:', result.outputs.map(o => ({ kind: o.kind, path: o.path })));
