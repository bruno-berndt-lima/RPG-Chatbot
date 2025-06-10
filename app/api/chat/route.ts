import { DataAPIClient } from "@datastax/astra-db-ts";

const { 
    ASTRA_DB_APPLICATION_TOKEN, 
    ASTRA_DB_COLLECTION, 
    ASTRA_DB_NAMESPACE, 
    ASTRA_DB_API_ENDPOINT,
    OLLAMA_API_BASE_URL = "http://localhost:11434"
} = process.env;

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, {namespace: ASTRA_DB_NAMESPACE});

export async function POST(req: Request) {
    try {
        const { messages } = await req.json();
        const lastMessage = messages[messages?.length - 1]?.content;
        let docContext = "";

        // Get embedding from Ollama
        const embeddingResponse = await fetch(`${OLLAMA_API_BASE_URL}/api/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "nomic-embed-text",
                prompt: lastMessage,
            }),
        });

        const embeddingData = await embeddingResponse.json();

        try {
            const collection = await db.collection(ASTRA_DB_COLLECTION);
            const cursor = collection.find(null, {
                sort: {
                    $vector: embeddingData.embedding, 
                },
                limit: 10,
            })

            const documents = await cursor.toArray();
            const docsMap = documents?.map(doc => doc.text);
            docContext = JSON.stringify(docsMap);

        }  catch (error) {
            console.error("Error querying database", error);
            docContext= "";
        }

        const template = {
            role: "system",
            content: `You are a master-level RPG assistant and rules expert, trained in all aspects of tabletop role-playing games,
            especially Dungeons & Dragons 5th Edition. You know every rule, class, spell, monster, item, and mechanic from 
            the Player's Handbook, Dungeon Master's Guide, Monster Manual, and SRD. You also understand advanced concepts like 
            homebrew design, worldbuilding, dungeon mastering, encounter balancing, and player dynamics.

            Your job is to answer clearly, accurately, and helpfully. Use examples where helpful. Always prioritize the official 
            rules (RAW), but you may also explain common house rules (RAI) and homebrew ideas when asked. When relevant, explain 
            rule interactions, edge cases, and best practices for both players and Dungeon Masters.

            You can summarize large rule sections, create custom content, or walk users through character creation, spell casting, 
            item crafting, or narrative development. If a user asks a lore question, provide clear, canon-consistent information 
            based on official settings like the Forgotten Realms.

            Speak in a helpful, conversational tone. Avoid vague answers—use precise rule references, class levels, ability names, 
            or conditions. If a question is ambiguous, ask clarifying questions before proceeding.

            The conext will provide you with the most recent page from api.open5e.com, wikipedia, and basic rules pdf.

            If the context doesn't include the information you need, answer based on your existing knowledge and don't mention the
            source of your information or what the context does or doesn't include.
            
            Format responses using markdown where applicable and don't return images.
            
            ----------------------------
            START CONTEXT
            ${docContext}
            END CONTEXT
            ----------------------------
            QUESTION: ${lastMessage}
            ----------------------------
            `
        };

        // Create a new ReadableStream for streaming the response
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    const response = await fetch(`${OLLAMA_API_BASE_URL}/api/chat`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            model: "llama2",
                            messages: [template, ...messages],
                            stream: true,
                        }),
                    });

                    const reader = response.body?.getReader();
                    if (!reader) {
                        throw new Error('No reader available');
                    }

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        const chunk = new TextDecoder().decode(value);
                        const lines = chunk.split('\n').filter(line => line.trim());
                        
                        for (const line of lines) {
                            try {
                                const data = JSON.parse(line);
                                if (data.message?.content) {
                                    controller.enqueue(new TextEncoder().encode(data.message.content));
                                }
                            } catch (e) {
                                console.error('Error parsing chunk:', e);
                            }
                        }
                    }
                    controller.close();
                } catch (error) {
                    controller.error(error);
                }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        });

    } catch (error) {
        throw error;
    }
}