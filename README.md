# RPG Chatbot - D&D 5e Expert

A Next.js-powered chatbot that serves as a ultimate guide for Dungeons & Dragons 5th Edition (D&D 5e). This application combines the power of local Large Language Models (via Ollama) with Retrieval Augmented Generation (RAG) using a vector database to provide accurate, contextual answers about D&D rules, spells, monsters, classes, and more.

## 🎯 Features

- **Comprehensive D&D 5e Knowledge**: Access to rules, spells, monsters, classes, races, backgrounds, feats, conditions, magic items, weapons, and armor
- **Intelligent Context Search**: Vector similarity search retrieves relevant information before generating responses
- **Local LLM**: Uses Ollama for privacy-focused, offline AI responses
- **Multi-Source Data**: Integrates data from Open5e API, Wikipedia, and official D&D PDFs
- **Modern Chat Interface**: Clean, responsive UI with prompt suggestions and real-time messaging
- **RAG Architecture**: Combines retrieval with generation for accurate, context-aware responses

## 🏗 Architecture

### Tech Stack
- **Frontend**: Next.js 14, React, TypeScript
- **Backend**: Next.js API Routes
- **Vector Database**: DataStax Astra DB
- **LLM & Embeddings**: Ollama (llama2 + nomic-embed-text)
- **Data Sources**: Open5e API, Wikipedia, D&D Basic Rules PDF

### How It Works
1. **Data Ingestion**: The `loadDB.ts` script fetches D&D content from multiple sources
2. **Embedding Generation**: Content is chunked and embedded using Ollama's nomic-embed-text model
3. **Vector Storage**: Embeddings are stored in Astra DB with metadata
4. **Query Processing**: User questions are embedded and used for similarity search
5. **Context Retrieval**: Relevant documents are retrieved as context
6. **Response Generation**: Ollama's llama2 model generates responses using the retrieved context

## 🚀 Getting Started

### Prerequisites

1. **Node.js** (v18 or higher)
2. **Ollama** installed and running locally
3. **DataStax Astra DB** account and database

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/bruno-berndt-lima/RPG-Chatbot.git
   cd RPG-Chatbot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Ollama**
   ```bash
   # Install Ollama (if not already installed)
   # Visit https://ollama.ai for installation instructions
   
   # Pull required models
   ollama pull llama2
   ollama pull nomic-embed-text
   ```

4. **Configure environment variables**
   Create a `.env.local` file in the root directory:
   ```env
   ASTRA_DB_APPLICATION_TOKEN=your_astra_db_token
   ASTRA_DB_COLLECTION=rpg_data
   ASTRA_DB_NAMESPACE=default_keyspace
   ASTRA_DB_API_ENDPOINT=your_astra_db_endpoint
   OLLAMA_API_BASE_URL=http://localhost:11434
   ```

5. **Set up Astra DB**
   - Create a DataStax Astra DB account at [astra.datastax.com](https://astra.datastax.com)
   - Create a new database
   - Generate an application token
   - Get your database API endpoint

### Data Loading

Before using the chatbot, you need to populate the vector database:

```bash
# Run the data loading script
npm run seed
```

This script will:
- Fetch data from Open5e API (spells, monsters, classes, etc.)
- Scrape Wikipedia pages about D&D
- Download and process the D&D Basic Rules PDF
- Generate embeddings for all content
- Store everything in your Astra DB collection

**Note**: The data loading process can take several hours due to rate limiting and the large amount of content.

### Running the Application

1. **Start the development server**
   ```bash
   npm run dev
   ```

2. **Open your browser**
   Navigate to `http://localhost:3000`

3. **Start chatting!**
   Ask questions about D&D 5e rules, spells, monsters, or anything RPG-related.

## 💬 Usage Examples

Try asking questions like:
- "How does the Fireball spell work?"
- "What are the different types of dragons in D&D?"
- "Explain the mechanics of opportunity attacks"
- "What classes can cast healing spells?"
- "How do I calculate armor class?"

## 📁 Project Structure

```
RPG-Chatbot/
├── app/
│   ├── api/chat/route.ts               # Main chat API endpoint
│   ├── components/                     # React components
│   │   ├── Bubble.tsx                  # Chat message bubbles
│   │   ├── LoadingBubble.tsx           # Loading indicator
│   │   └── PromptSuggestionsRow.tsx    # Suggested prompts
│   ├── assets/                         # Images and static assets
│   ├── globals.css                     # Global styles
│   └── page.tsx                        # Main chat interface
├── scripts/
│   └── loadDB.ts                       # Data loading and embedding script
├── package.json
└── README.md
```

## 🔧 Configuration

### Ollama Models
- **LLM Model**: `llama2` (default) - Can be changed in `/api/chat/route.ts`
- **Embedding Model**: `nomic-embed-text` - Required for vector embeddings

### Vector Database Settings
- **Similarity Metric**: `dot_product` (default)
- **Chunk Size**: 512 characters
- **Chunk Overlap**: 100 characters
- **Search Results**: Top 10 similar documents

### Data Sources
The application pulls data from:
- **Open5e API**: Official D&D 5e content (spells, monsters, classes, etc.)
- **Wikipedia**: General D&D lore and adventure information
- **D&D Basic Rules PDF**: Official Wizards of the Coast content

## 🔍 API Endpoints

### POST `/api/chat`
Main chat endpoint that processes user messages.

## 🛠 Development

### Adding New Data Sources
To add new data sources, modify the `rpgData` array in `scripts/loadDB.ts`:

```typescript
const rpgData: DataSource[] = [
  // Add your new source
  { url: "your-api-endpoint", type: "json", name: "your-source-name" },
  // ...existing sources
];
```

## 🚨 Troubleshooting

### Common Issues

1. **Ollama not responding**
   - Ensure Ollama is running: `ollama serve`
   - Check if models are pulled: `ollama list`

2. **Database connection errors**
   - Verify your Astra DB credentials in `.env.local`
   - Ensure your database is active

3. **Rate limiting during data loading**
   - The script includes retry logic and progress saving
   - Resume interrupted loads by running the script again

4. **Memory issues**
   - Reduce `CONCURRENCY_LIMIT` in `loadDB.ts`
   - Process data sources individually if needed

## 🙏 Acknowledgments

- **Wizards of the Coast** for D&D 5e content
- **Open5e** for providing the comprehensive API
- **Ollama** for local LLM capabilities
- **DataStax** for Astra DB vector database
- **LangChain** for document processing tools

---
