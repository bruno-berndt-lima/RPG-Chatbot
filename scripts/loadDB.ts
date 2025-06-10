import { DataAPIClient } from "@datastax/astra-db-ts";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Ollama } from "ollama";
import { PuppeteerWebBaseLoader } from "langchain/document_loaders/web/puppeteer";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import pLimit from 'p-limit';
import fs from 'fs';

import "dotenv/config";

type SimilarityMetric = "cosine" | "euclidean" | "dot_product";
type ContentType = "json" | "html" | "pdf";

interface DataSource {
    url: string;
    type: ContentType;
    name: string;
}

const { 
    ASTRA_DB_APPLICATION_TOKEN, 
    ASTRA_DB_COLLECTION, 
    ASTRA_DB_NAMESPACE, 
    ASTRA_DB_API_ENDPOINT
} = process.env;

// Limit concurrent operations to avoid overwhelming Ollama and the database
const CONCURRENCY_LIMIT = 5;
const limit = pLimit(CONCURRENCY_LIMIT);


const MAX_RETRIES = 3; // Retry configuration
const RETRY_DELAY = 5000; // 5 seconds

const ollama = new Ollama({
    host: "http://localhost:11434" // Default Ollama host
});

// Define data sources
const rpgData: DataSource[] = [
    // JSON Sources
    { url: "https://api.open5e.com/v2/spells/", type: "json", name: "spells" },
    { url: "https://api.open5e.com/v2/monsters/", type: "json", name: "monsters" },
    { url: "https://api.open5e.com/v2/classes/", type: "json", name: "classes" },
    { url: "https://api.open5e.com/v2/races/", type: "json", name: "races" },
    { url: "https://api.open5e.com/v2/backgrounds/", type: "json", name: "backgrounds" },
    { url: "https://api.open5e.com/v2/feats/", type: "json", name: "feats" },
    { url: "https://api.open5e.com/v2/conditions/", type: "json", name: "conditions" },
    { url: "https://api.open5e.com/v2/magicitems/", type: "json", name: "magic-items" },
    { url: "https://api.open5e.com/v2/weapons/", type: "json", name: "weapons" },
    { url: "https://api.open5e.com/v2/armor/", type: "json", name: "armor" },
    
    // HTML Sources
    { url: "https://en.wikipedia.org/wiki/Dungeons_%26_Dragons", type: "html", name: "dnd-wiki" },
    { url: "https://en.wikipedia.org/wiki/List_of_Dungeons_%26_Dragons_adventures", type: "html", name: "dnd-adventures" },
    
    // PDF Sources
    { url: "https://media.wizards.com/2018/dnd/downloads/DnD_BasicRules_2018.pdf", type: "pdf", name: "dnd-basic-rules" }
];

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, {namespace: ASTRA_DB_NAMESPACE});

const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 512,
    chunkOverlap: 100
})

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const retryOperation = async <T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = MAX_RETRIES
): Promise<T> => {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;
            console.warn(`Attempt ${attempt}/${maxRetries} failed for ${operationName}:`, error);
            
            if (attempt < maxRetries) {
                console.log(`Retrying in ${RETRY_DELAY/1000} seconds...`);
                await sleep(RETRY_DELAY);
            }
        }
    }
    
    throw new Error(`Operation ${operationName} failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
};

// Add progress tracking
interface Progress {
    lastProcessedUrl: string;
    processedItems: number;
    timestamp: number;
}

const saveProgress = (source: DataSource, progress: Progress) => {
    try {
        const progressData = {
            [source.url]: progress
        };
        fs.writeFileSync('progress.json', JSON.stringify(progressData, null, 2));
    } catch (error) {
        console.error('Error saving progress:', error);
    }
};

const loadProgress = (source: DataSource): Progress | null => {
    try {
        if (fs.existsSync('progress.json')) {
            const progressData = JSON.parse(fs.readFileSync('progress.json', 'utf-8'));
            return progressData[source.url] || null;
        }
    } catch (error) {
        console.error('Error loading progress:', error);
    }
    return null;
};

const fetchJsonPages = async (url: string, source: DataSource) => {
    let allResults = [];
    let nextUrl = url;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const BASE_DELAY = 10000; // 10 seconds
    const BATCH_SIZE = 50; // Process in smaller batches
    
    // Load previous progress
    const progress = loadProgress(source);
    if (progress) {
        console.log(`Resuming from previous progress: ${progress.processedItems} items processed`);
        // Skip already processed items
        allResults = Array(progress.processedItems).fill(null);
        nextUrl = progress.lastProcessedUrl;
    }
    
    while (nextUrl) {
        try {
            console.log(`Fetching JSON page: ${nextUrl}`);
            const response = await fetch(nextUrl);
            
            // Check if we got HTML instead of JSON (rate limiting)
            const contentType = response.headers.get('content-type');
            if (contentType && !contentType.includes('application/json')) {
                const delay = BASE_DELAY * Math.pow(2, retryCount);
                console.log(`Rate limited, waiting ${delay/1000} seconds before retry...`);
                await sleep(delay);
                retryCount++;
                if (retryCount >= MAX_RETRIES) {
                    console.error(`Max retries reached for ${url}. Saving progress and continuing...`);
                    saveProgress(source, {
                        lastProcessedUrl: nextUrl,
                        processedItems: allResults.length,
                        timestamp: Date.now()
                    });
                    console.log(`Successfully processed ${allResults.length} items so far`);
                    break;
                }
                continue;
            }
            
            const data = await response.json();
            
            if (!data.results) {
                console.error(`Invalid response format from ${url}:`, data);
                break;
            }
            
            // Process in smaller batches
            const batch = data.results.slice(0, BATCH_SIZE);
            allResults = allResults.concat(batch);
            
            // Save progress after each batch
            saveProgress(source, {
                lastProcessedUrl: nextUrl,
                processedItems: allResults.length,
                timestamp: Date.now()
            });
            
            // If we processed less than BATCH_SIZE, we're done
            if (batch.length < BATCH_SIZE) {
                nextUrl = null;
            } else {
                nextUrl = data.next;
            }
            
            // Add a longer delay between requests
            const delay = BASE_DELAY * Math.pow(2, retryCount);
            console.log(`Waiting ${delay/1000} seconds before next request...`);
            await sleep(delay);
            retryCount = 0; // Reset retry count on successful request
        } catch (error) {
            console.error(`Error fetching ${nextUrl}:`, error);
            const delay = BASE_DELAY * Math.pow(2, retryCount);
            console.log(`Waiting ${delay/1000} seconds before retry...`);
            await sleep(delay);
            retryCount++;
            if (retryCount >= MAX_RETRIES) {
                console.error(`Max retries reached for ${url}. Saving progress and continuing...`);
                saveProgress(source, {
                    lastProcessedUrl: nextUrl,
                    processedItems: allResults.length,
                    timestamp: Date.now()
                });
                console.log(`Successfully processed ${allResults.length} items so far`);
                break;
            }
        }
    }
    
    return allResults;
}

// Add function to verify embedding dimensions
const verifyEmbeddingDimension = async () => {
    try {
        const testEmbedding = await ollama.embeddings({
            model: "nomic-embed-text",
            prompt: "test"
        });
        
        if (!testEmbedding || !testEmbedding.embedding) {
            throw new Error("Failed to get test embedding");
        }
        
        const dimension = testEmbedding.embedding.length;
        console.log(`Verified embedding dimension: ${dimension}`);
        return dimension;
    } catch (error) {
        console.error("Error verifying embedding dimension:", error);
        throw error;
    }
}

const createCollection = async (similarityMetric: SimilarityMetric = "dot_product") => {
    try {
        // Get the actual dimension from Ollama
        const dimension = await verifyEmbeddingDimension();
        
        const res = await db.createCollection(ASTRA_DB_COLLECTION, {
            vector: {
                dimension: dimension,
                metric: similarityMetric,
            }
        });
        console.log('Collection created successfully:', res);
        return res;
    } catch (error: any) {
        // If collection already exists, just continue
        if (error.name === 'CollectionAlreadyExistsError') {
            console.log('Collection already exists, continuing...');
            return;
        }
        // For other errors, retry
        return retryOperation(
            async () => {
                const dimension = await verifyEmbeddingDimension();
                const res = await db.createCollection(ASTRA_DB_COLLECTION, {
                    vector: {
                        dimension: dimension,
                        metric: similarityMetric,
                    }
                });
                console.log('Collection created successfully:', res);
                return res;
            },
            'createCollection'
        );
    }
}

const fetchHtmlContent = async (url: string) => {
    console.log(`Fetching HTML page: ${url}`);
    const loader = new PuppeteerWebBaseLoader(url, {
        launchOptions: { 
            headless: "new" // Updated to use new headless mode
        },
        gotoOptions: { 
            waitUntil: "domcontentloaded",
        },
        evaluate: async (page, browser) => {
            try {
                const result = await page.evaluate(() => document.body.innerHTML);
                await browser.close();
                return result;
            } catch (error) {
                console.error(`Error evaluating page ${url}:`, error);
                await browser.close();
                throw error;
            }
        }
    });
    return await loader.scrape();
}

const fetchPdfContent = async (url: string) => {
    console.log(`Fetching PDF from: ${url}`);
    try {
        // Download the PDF
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Save temporarily
        const tempPath = `temp_${Date.now()}.pdf`;
        fs.writeFileSync(tempPath, buffer);
        
        // Load the PDF
        const loader = new PDFLoader(tempPath);
        const docs = await loader.load();
        
        // Clean up temp file
        fs.unlinkSync(tempPath);
        
        return docs.map(doc => doc.pageContent).join('\n');
    } catch (error) {
        console.error(`Error fetching PDF from ${url}:`, error);
        throw error;
    }
}

const processJsonItem = async (item: any, collection: any, sourceName: string) => {
    try {
        const itemText = JSON.stringify(item, null, 2);
        const chunks = await splitter.splitText(itemText);
        
        const chunkPromises = chunks.map(async (chunk) => {
            try {
                const embedding = await ollama.embeddings({
                    model: "nomic-embed-text",
                    prompt: chunk
                });

                if (!embedding || !embedding.embedding) {
                    console.warn(`No embedding returned for chunk of item: ${item.name || item.title || item.key || 'Unknown'}`);
                    return;
                }

                const vector = embedding.embedding;

                await retryOperation(
                    async () => {
                        const result = await collection.insertOne({
                            $vector: vector,
                            text: chunk,
                            metadata: {
                                type: sourceName,
                                name: item.name || item.title || item.key || 'Unknown',
                                url: item.url
                            }
                        });
                        console.log(`Inserted JSON chunk for ${item.name || item.title || item.key || 'Unknown'}`);
                        return result;
                    },
                    `insertOne for ${item.name || item.title || item.key || 'Unknown'}`
                );
            } catch (chunkError) {
                console.error(`Failed to process chunk for item: ${item.name || item.title || item.key || 'Unknown'}`, chunkError);
            }
        });

        // Process chunks with concurrency limit
        await Promise.all(chunkPromises.map(promise => limit(() => promise)));
    } catch (error) {
        console.error(`Failed to process item: ${item.name || item.title || item.key || 'Unknown'}`, error);
    }
}

const processHtmlContent = async (content: string, collection: any, sourceName: string, url: string) => {
    try {
        const chunks = await splitter.splitText(content);
        
        // Process chunks sequentially to avoid HTTP2 session issues
        for (const chunk of chunks) {
            try {
                const embedding = await retryOperation(
                    async () => {
                        const result = await ollama.embeddings({
                            model: "nomic-embed-text",
                            prompt: chunk
                        });
                        
                        if (!result || !result.embedding) {
                            throw new Error("No embedding returned");
                        }
                        
                        return result;
                    },
                    `get embedding for chunk from ${url}`
                );

                const vector = embedding.embedding;

                await retryOperation(
                    async () => {
                        const result = await collection.insertOne({
                            $vector: vector,
                            text: chunk,
                            metadata: {
                                type: sourceName,
                                url: url
                            }
                        });
                        console.log(`Inserted HTML chunk from ${url}`);
                        return result;
                    },
                    `insertOne for HTML chunk from ${url}`
                );
            } catch (chunkError) {
                console.error(`Failed to process HTML chunk from ${url}:`, chunkError);
                // Continue with next chunk instead of failing completely
                continue;
            }
        }
    } catch (error) {
        console.error(`Failed to process HTML content from ${url}:`, error);
        throw error;
    }
}

const loadSampleData = async () => {
    try {
        const collection = db.collection(ASTRA_DB_COLLECTION);
        
        for (const source of rpgData) {
            console.log(`Processing source: ${source.url} (${source.type})`);
            try {
                if (source.type === "json") {
                    const items = await fetchJsonPages(source.url, source);
                    console.log(`Found ${items.length} items for ${source.url}`);
                    
                    for (const item of items) {
                        if (item) {
                            await processJsonItem(item, collection, source.name);
                        }
                    }
                } else if (source.type === "html") {
                    const content = await fetchHtmlContent(source.url);
                    if (content) {
                        await processHtmlContent(content, collection, source.name, source.url);
                    }
                } else if (source.type === "pdf") {
                    const content = await fetchPdfContent(source.url);
                    if (content) {
                        await processHtmlContent(content, collection, source.name, source.url);
                    }
                }
            } catch (error) {
                console.error(`Error processing source ${source.url}:`, error);
                continue;
            }
        }
    } catch (error) {
        console.error("Error in loadSampleData:", error);
    }
}

createCollection().then(() => loadSampleData());