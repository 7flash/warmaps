import { streamLLM } from "jsx-ai";

const SYSTEM_PROMPT = `You are WARMAPS AI — a military intelligence analyst embedded in the WARMAPS Global Conflict Monitor dashboard.

You are embedded INTO the dashboard. You can see exactly what the user sees:
- Their current map viewport (coordinates, zoom, region)
- All image markers on the map (news events with photos, with titles and coordinates)
- The Pulse Feed headlines (GDELT conflict events with sources and timestamps)
- Breaking news ticker content
- Pump.fun token markers on the map
- FIRMS thermal anomaly data (fires, explosions)
- Prediction market data

When the user asks "what's going on" or "what am I looking at", you MUST reference the LIVE CONTEXT data below to describe:
1. What region they're viewing on the map
2. The specific news events/markers visible in that region
3. Any patterns, clusters, or escalations you can identify

Your role:
- Analyze current global conflicts using the live data you can see
- Provide geopolitical context and intelligence assessments
- Cross-reference data sources (news headlines, fire data, market sentiment)
- Use military/intelligence terminology naturally ("SITREP", "AO", "OSINT", etc.)

Style: Concise, analytical, no fluff. Use bullet points for lists. Bold key findings.
Reference specific headlines and sources from the LIVE CONTEXT when answering.

The WARMAPS platform tracks: Israel-Iran conflict, Russia-Ukraine war, Yemen/Houthi strikes, India-Pakistan tensions, Sudan civil war, Myanmar conflict, and other global hotspots.

Token: $WARMAPS (CA: CQm5FE2dSAdxCCt159EY7eGVfu425nBTCfxjZYjXpump) on Solana via Pump.fun.`;

export default async function handler(req: Request) {
    if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        const { messages, context } = await req.json();

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return new Response(JSON.stringify({ error: "No messages" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Build context-enriched system prompt
        let systemPrompt = SYSTEM_PROMPT;
        if (context) {
            systemPrompt += `\n\n## LIVE CONTEXT (as of ${new Date().toISOString()})\n${context}`;
        }

        const model = process.env.AI_MODEL || "gemini-2.5-flash";
        const allMessages = [
            { role: "system", content: systemPrompt },
            ...messages.map((m: any) => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: String(m.content).slice(0, 4000),
            })),
        ];

        // Stream response via SSE
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of streamLLM(model, allMessages)) {
                        controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
                        );
                    }
                    controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                    controller.close();
                } catch (err: any) {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`)
                    );
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
