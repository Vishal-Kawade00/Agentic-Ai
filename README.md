# 🧠 Stateless Hybrid-Rerank RAG Microservice

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express%20(ESM)-404D59?style=for-the-badge)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_1.5_Flash-8E75B2?style=for-the-badge)

An enterprise-grade, distributed Retrieval-Augmented Generation (RAG) system designed to chat with complex documents with zero hallucinations. 

This project bypasses standard LangChain wrappers to implement a custom, deeply integrated pipeline featuring **Hybrid Search (Reciprocal Rank Fusion)** and **Cross-Encoder Reranking**, bridging a lightweight UI with a cloud-GPU inference engine.

---

## 🏛️ System Architecture

The application is built on a **Serverless-Hybrid Microservice Architecture**, strictly separating the UI/Routing concerns from the heavy Machine Learning computations.

1.  **The API Gateway (Node.js/Express):** A stateless, ES Module-based Express server acting as a traffic controller. It handles multipart file parsing, rate limiting, and exact-timeout network forwarding without permanently storing sensitive user files.
2.  **The Inference Engine (Python/FastAPI):** A cloud-hosted (Google Colab T4 GPU) AI backend that handles computationally expensive vectorization, index building, and Large Language Model generation.
3.  **The Client (React):** A responsive split-screen UI utilizing memory-blob rendering (`URL.createObjectURL`) to display documents securely without requiring third-party cloud storage (e.g., AWS S3).

## 🚀 The AI Retrieval Pipeline (How It Works)

To completely eliminate LLM hallucinations and capture both semantic meaning and exact keyword matches, this system uses a multi-stage retrieval pipeline:

1.  **Recursive Chunking:** Documents are parsed using `pdfplumber` and sliced using a Recursive Character Text Splitter to preserve semantic boundaries (paragraphs/sentences) with strict overlaps.
2.  **Parallel Hybrid Search:**
    * **Vector Search (Semantic):** Chunks are embedded using `all-MiniLM-L6-v2` and stored in an in-memory **ChromaDB** index.
    * **Lexical Search (Keyword):** A parallel **BM25** index tokenizes the corpus to catch exact part numbers, acronyms, or IDs that semantic math often misses.
3.  **Reciprocal Rank Fusion (RRF):** The results from ChromaDB and BM25 are mathematically fused to grab the top 10 most balanced context chunks.
4.  **Cross-Encoder Reranking:** The top 10 chunks are passed to a `ms-marco-MiniLM-L-6-v2` Cross-Encoder. This acts as a strict judge, calculating the deep attention between the user's query and the chunks, narrowing the context down to the absolute best **Top 3**.
5.  **Grounded Generation:** The meticulously filtered context is injected into a strict system prompt via the **Google Gemini 1.5 Flash API**, which streams back the final answer along with exact page citations.

## 🛠️ Tech Stack

**Backend & ML Engine**
* **API Gateway:** Node.js, Express.js (ES Modules), Multer, Axios, Helmet
* **AI Microservice:** Python, FastAPI, Uvicorn, pyngrok
* **Vector Database:** ChromaDB (Ephemeral In-Memory)
* **Embeddings & Reranking:** HuggingFace `sentence-transformers`
* **Lexical Search:** `rank_bm25`
* **LLM:** Google Generative AI (Gemini 1.5 Flash)

**Frontend**
* **Framework:** React (Vite)
* **Styling:** Custom CSS / Flexbox

## 💡 Key Engineering Decisions

* **Stateless by Design:** Intentionally dropped MongoDB and Cloudinary. Files exist only in volatile memory during the session and are instantly purged from the Node server after transmission, prioritizing architecture and accuracy over bloated user authentication.
* **Strict Source Citations:** The UI refuses to output text without attaching the exact `page_number` metadata extracted during the embedding phase, ensuring enterprise trust in the generated output.