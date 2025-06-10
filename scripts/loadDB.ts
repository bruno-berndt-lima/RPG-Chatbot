import { DataAPIClient } from "@datastax/astra-db-ts";
import { PuppeteerWebBaseLoader } from "langchain/document_loaders/web/puppeteer";
import OpenAI from "openai";

import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

import "dotenv/config";

type SimilarityMetric = "cosine" | "euclidean" | "dot_product";

const { 
    ASTRA_DB_APPLICATION_TOKEN, 
    ASTRA_DB_COLLECTION, 
    ASTRA_DB_NAMESPACE, 
    ASTRA_DB_API_ENDPOINT, 
    OPENAI_API_KEY 
} = process.env;

const openai = new OpenAI({apiKey: OPENAI_API_KEY});

const rpgData = [
    "https://api.open5e.com/v2/spells/",
    "https://api.open5e.com/v1/spelllist/",
    "https://api.open5e.com/v1/monsters/",
    "https://api.open5e.com/v2/documents/",
    "https://api.open5e.com/v2/backgrounds/",
    "https://api.open5e.com/v1/planes/",
    "https://api.open5e.com/v1/sections/",
    "https://api.open5e.com/v2/feats/",
    "https://api.open5e.com/v2/conditions/",
    "https://api.open5e.com/v2/races/",
    "https://api.open5e.com/v1/classes/",
    "https://api.open5e.com/v1/magicitems/",
    "https://api.open5e.com/v2/weapons/",
    "https://api.open5e.com/v2/armor/"
]

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, {namespace: ASTRA_DB_NAMESPACE});

const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 512,
    chunkOverlap: 100
})


const createCollection = async (similarityMetric: SimilarityMetric = "dot_product") => {
    const res = await db.createCollection(ASTRA_DB_COLLECTION, {
        vector: {
            dimension: 1536, // change if needed for different models
            metric: similarityMetric,
        }
    });
    console.log(res);
}

const loadSampleData = async () => {
    const collection = await db.collection(ASTRA_DB_COLLECTION);
    for await (const url of rpgData) {
        const content = await scrapePage(url);
        const chunks = await splitter.splitText(content);
        for await (const chunk of chunks) {
            const embedding = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: chunk,
                encoding_format: "float"
            })

            const vector = embedding.data[0].embedding;

            const result = await collection.insertOne({
                $vector: vector,
                text: chunk,
            })
            console.log(result);
        }
    }
}

const scrapePage = async (url: string) => {
    const loader = new PuppeteerWebBaseLoader(url, {
        launchOptions: { 
            headless: true 
        },
        gotoOptions: { 
            waitUntil: "domcontentloaded" 
        },
        evaluate: async (page, browser) => {
            const result = await page.evaluate(() => document.body.innerHTML);
            await browser.close();
            return result;
        }
    });
    return ( await loader.scrape())?.replace(/<[^>]*>?/gm, "");
}

createCollection().then(() => loadSampleData());