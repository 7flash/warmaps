import { readFileSync, existsSync } from 'fs';
import path from 'path';

function getTreeMtime(entryPath: string): number {
    const visited = new Set<string>();
    let maxMtime = 0;

    function walk(filePath: string) {
        const resolved = path.resolve(filePath); // No toLowerCase() !!
        if (visited.has(resolved)) return;
        visited.add(resolved);

        try {
            const mtime = Bun.file(resolved).lastModified;
            if (mtime > maxMtime) maxMtime = mtime;
        } catch {
            return;
        }

        try {
            const source = readFileSync(resolved, 'utf-8');
            let ext = path.extname(resolved);
            const transpiler = new Bun.Transpiler({ loader: ext === '.tsx' || ext === '.jsx' ? 'tsx' : 'ts' });
            const imports = transpiler.scanImports(source);
            const dir = path.dirname(resolved);

            for (const imp of imports) {
                if (!imp.path.startsWith('.')) continue;

                const candidates = [
                    imp.path,
                    imp.path + '.ts',
                    imp.path + '.tsx',
                    imp.path + '.js',
                    imp.path + '.jsx',
                    imp.path + '/index.ts',
                    imp.path + '/index.tsx',
                ];

                for (const candidate of candidates) {
                    const full = path.resolve(dir, candidate);
                    if (existsSync(full)) {
                        walk(full);
                        break;
                    }
                }
            }
        } catch { }
    }

    walk(entryPath);
    return maxMtime;
}

getTreeMtime('app/page.client.tsx');
console.log("Did it hang?");
