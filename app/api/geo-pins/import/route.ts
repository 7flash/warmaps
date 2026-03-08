import { saveGeoPin } from '../../../lib/geo-pins'
import type { GeoPin } from '../../../lib/geo-pins'

export async function POST(req: Request) {
    try {
        const formData = await req.formData()
        const file = formData.get('file') as File
        if (!file) return Response.json({ error: 'No file uploaded' }, { status: 400 })

        const text = await file.text()
        const lines = text.split('\n').filter(l => l.trim())
        if (lines.length < 2) return Response.json({ error: 'CSV must have header + at least 1 row' }, { status: 400 })

        // Parse header
        const header = lines[0].toLowerCase()
        const needsCols = ['sender', 'lat', 'lng', 'message']
        for (const col of needsCols) {
            if (!header.includes(col)) {
                return Response.json({ error: `Missing required column: ${col}` }, { status: 400 })
            }
        }

        const cols = parseCSVLine(lines[0].toLowerCase())
        const senderIdx = cols.indexOf('sender')
        const latIdx = cols.indexOf('lat')
        const lngIdx = cols.indexOf('lng')
        const msgIdx = cols.indexOf('message')
        const tsIdx = cols.indexOf('timestamp')
        const sigIdx = cols.indexOf('signature')

        let imported = 0
        for (let i = 1; i < lines.length; i++) {
            const vals = parseCSVLine(lines[i])
            if (vals.length < 4) continue

            const pin: GeoPin = {
                signature: sigIdx >= 0 ? vals[sigIdx] : `import-${Date.now()}-${i}`,
                sender: vals[senderIdx],
                lat: parseFloat(vals[latIdx]),
                lng: parseFloat(vals[lngIdx]),
                message: vals[msgIdx]?.substring(0, 280) || '',
                timestamp: tsIdx >= 0 ? parseInt(vals[tsIdx]) || Date.now() : Date.now(),
            }

            if (isNaN(pin.lat) || isNaN(pin.lng)) continue

            try { saveGeoPin(pin); imported++; } catch { /* skip duplicates */ }
        }

        return Response.json({ ok: true, imported })
    } catch (err: any) {
        return Response.json({ error: err.message || 'Import failed' }, { status: 500 })
    }
}

/** Simple CSV line parser handling quoted fields */
function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(current.trim())
            current = ''
        } else {
            current += ch
        }
    }
    result.push(current.trim())
    return result
}
