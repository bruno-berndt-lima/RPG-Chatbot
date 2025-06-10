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
        console.log("Starting chat request processing");
        const { messages } = await req.json();
        const lastMessage = messages[messages?.length - 1]?.content;
        let docContext = "";

        console.log("Getting embeddings from Ollama");
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

        if (!embeddingResponse.ok) {
            throw new Error(`Embedding request failed: ${embeddingResponse.statusText}`);
        }

        const embeddingData = await embeddingResponse.json();
        console.log("Successfully got embeddings");

        try {
            console.log("Querying Astra DB");
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
            console.log("Successfully queried Astra DB");

        }  catch (error) {
            console.error("Error querying database", error);
            docContext = "";
        }

        const template = {
            role: "system",
            content: `You are a master-level assistant and rules expert for Dungeons & Dragons 5th Edition (D&D 5e). 
            You know every rule, class, spell, monster, item, feat, and mechanic from official 5e sources, including the 
            Player's Handbook (PHB), Dungeon Master's Guide (DMG), Monster Manual (MM), Xanathar's Guide to Everything (XGtE), 
            Tasha's Cauldron of Everything (TCoE), and the 5e SRD.

            Your job is to provide accurate, clear, and helpful answers about D&D 5e rules and gameplay. You can assist with 
            character creation, spellcasting, combat mechanics, magic items, class features, abilities, crafting, and more. 
            You also understand common edge cases, rule interactions, and Dungeon Master best practices like encounter building 
            and world design.

            Prioritize the official rules as written (RAW). When appropriate, explain rules as intended (RAI), common house rules, 
            or homebrew options — but always distinguish clearly between them.

            Speak in a friendly, knowledgeable tone. Use specific examples, list class levels or spell slots when needed, and 
            format your answers in markdown. If a question is unclear, ask for clarification before answering.

            You may receive recent content from official APIs or summaries from PDFs and encyclopedias. If not, respond using your 
            knowledge without mentioning what is or isn't in the context.

            Never generate images. Stick to textual guidance.
            
            ----------------------------
            START CONTEXT
            ${docContext}
            END CONTEXT
            ----------------------------
            QUESTION: ${lastMessage}
            ----------------------------
            `
        };

        console.log("Starting chat stream");
        
        // Get the complete response from Ollama first
        console.log("Sending chat request to Ollama");
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "llama2",
                messages: [template, ...messages],
                stream: false, // Get complete response
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Chat request failed:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            throw new Error(`Chat request failed: ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        const content = data.message?.content || "";
        
        console.log("Chat request successful, got response:", content);
        
        // Return the response in the exact format expected by the new page.tsx
        return Response.json({
            id: crypto.randomUUID(),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'llama2',
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: content,
                },
                finish_reason: 'stop'
            }],
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            }
        });

    } catch (error) {
        console.error('Request error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
}