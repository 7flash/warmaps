// app/api/annotations/route.ts — Map Annotation Persistence
// GET: load saved annotations | POST: save new annotations

export async function GET() {
    try {
        const { userDb } = require('../../lib/auth')
        ensureTable(userDb)
        const rows = userDb.db.query('SELECT * FROM map_annotations ORDER BY timestamp DESC LIMIT 200').all() as any[]
        const annotations = rows.map((r: any) => ({
            id: r.id,
            coordinates: JSON.parse(r.coordinates),
            color: r.color,
            width: r.width,
            timestamp: r.timestamp,
        }))
        return Response.json({ annotations })
    } catch (e: any) {
        return Response.json({ annotations: [], error: e.message })
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json() as { annotations: Array<{ coordinates: [number, number][]; color: string; width: number }> }
        if (!body.annotations?.length) {
            return Response.json({ error: 'No annotations provided' }, { status: 400 })
        }

        const { userDb } = require('../../lib/auth')
        ensureTable(userDb)

        let saved = 0
        for (const a of body.annotations) {
            userDb.db.exec(
                `INSERT INTO map_annotations (coordinates, color, width, timestamp) VALUES (?, ?, ?, ?)`,
                [JSON.stringify(a.coordinates), a.color, a.width, Date.now()]
            )
            saved++
        }

        return Response.json({ ok: true, saved })
    } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500 })
    }
}

function ensureTable(userDb: any) {
    try {
        userDb.db.exec(`CREATE TABLE IF NOT EXISTS map_annotations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            coordinates TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#a78bfa',
            width INTEGER NOT NULL DEFAULT 3,
            timestamp INTEGER NOT NULL
        )`)
    } catch { }
}
