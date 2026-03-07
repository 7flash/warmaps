import { readFileSync, existsSync } from 'fs';
import path from 'path';

function getTreeMtime(entryPath: string): number {
    const visited = new Set<string>();
    let maxMtime = 0;

    function walk(filePath: string) {
        const resolved = path.resolve(filePath).toLowerCase(); // Normalize casing for Windows
        if (visited.has(resolved)) return;
        visited.add(resolved);
        // console.log("visiting", filePath);

        try {
            const mtime = Bun.file(resolved).lastModified;
            if (mtime > maxMtime) maxMtime = mtime;
        } catch {
            return; // File doesn't exist or can't be read
        }

        // Extract imports using Bun's fast transpiler
        try {
            const source = readFileSync(resolved, 'utf-8');
            const ext = path.extname(resolved) as '.ts' | '.tsx' | '.js' | '.jsx';
            const transpiler = new Bun.Transpiler({ loader: ext === '.tsx' || ext === '.jsx' ? 'tsx' : 'ts' });
            const imports = transpiler.scanImports(source);
            const dir = path.dirname(resolved);

            for (const imp of imports) {
                // Only follow relative imports (local project files)
                if (!imp.path.startsWith('.')) continue;

                // Try resolving with common extensions
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
        } catch {
            // If transpiler fails, just use the file's own mtime
        }
    }

    walk(entryPath);
    return maxMtime;
}

const t = performance.now();
getTreeMtime('app/page.client.tsx');
console.log("getTreeMtime took", performance.now() - t, "ms");
