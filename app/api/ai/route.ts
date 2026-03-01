import { streamLLM } from "jsx-ai";

const SYSTEM_PROMPT = `You are WARMAPS AI — a military intelligence analyst embedded in the WARMAPS Global Conflict Monitor.

You have access to real-time GDELT conflict data, FIRMS fire/explosion data, ACLED events, prediction markets, and Pump.fun token data.

Your role:
- Analyze current global conflicts with tactical precision
- Provide geopolitical context and intelligence assessments  
- Answer questions about ongoing wars, tensions, and military operations
- Cross-reference data sources (news, satellite fires, webcams, flights)
- Use military/intelligence terminology naturally ("SITREP", "AO", "SIGINT", etc.)

Style: Concise, analytical, no fluff. Use bullet points for lists. Bold key findings.
Always cite sources when referencing specific events or data points.

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
