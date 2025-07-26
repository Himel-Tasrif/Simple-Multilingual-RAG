import os
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import List
from langchain_community.document_loaders import PyMuPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from dotenv import load_dotenv
from fastapi.responses import StreamingResponse
import json
from langchain.prompts import PromptTemplate
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever

# Load environment variables
load_dotenv()

app = FastAPI()

# === Paths for storing PDFs and FAISS vector database ===
DATA_PATH = "data/uploaded_pdfs/"
DB_FAISS = "vectorstore/vec_db"
MCQ_JSON = "mcq_data.json"

# Ensure directories exist
os.makedirs(DATA_PATH, exist_ok=True)
os.makedirs(DB_FAISS, exist_ok=True)

# === Static & Templates ===
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# === Load MCQ data once ===
try:
    with open(MCQ_JSON, "r", encoding="utf-8") as f:
        MCQ_DATA = json.load(f)
except Exception:
    MCQ_DATA = []

# === Serve HTML Interfaces ===
@app.get("/", response_class=FileResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/admin", response_class=FileResponse)
async def admin_panel(request: Request):
    return templates.TemplateResponse("admin.html", {"request": request})

@app.get("/chat", response_class=FileResponse)
async def chat_panel(request: Request):
    return templates.TemplateResponse("chat.html", {"request": request})

# === API Endpoints: Admin Panel ===

# Upload PDFs (single or multiple)
@app.post("/admin/upload_pdf/")
async def upload_pdf(pdf_files: List[UploadFile] = File(...)):
    try:
        for pdf_file in pdf_files:
            file_location = os.path.join(DATA_PATH, pdf_file.filename)
            with open(file_location, "wb") as f:
                f.write(await pdf_file.read())
        return JSONResponse(content={"message": f"Successfully uploaded {len(pdf_files)} PDF(s)."})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# List Uploaded PDFs
@app.get("/admin/list_pdfs/")
async def list_pdfs():
    try:
        pdfs = [f for f in os.listdir(DATA_PATH) if f.endswith(".pdf")]
        return JSONResponse(content={"pdfs": pdfs})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Download PDF
@app.get("/admin/download_pdf/")
async def download_pdf(filename: str):
    try:
        file_path = os.path.join(DATA_PATH, filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(file_path, headers={"Content-Disposition": f"attachment; filename={filename}"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Generate FAISS Vector Database
@app.post("/admin/generate_vector_db/")
async def generate_vector_db():
    try:
        pdf_files = [os.path.join(DATA_PATH, f) for f in os.listdir(DATA_PATH) if f.endswith(".pdf")]
        if not pdf_files:
            raise HTTPException(status_code=400, detail="No PDFs found in uploaded_pdfs directory.")

        # Load and process PDFs
        all_texts = []
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)

        for pdf in pdf_files:
            loader = PyMuPDFLoader(pdf)
            docs = loader.load()
            chunks = text_splitter.split_documents(docs)
            all_texts.extend(chunks)

        # Generate embeddings and store in FAISS
        vector_db = FAISS.from_documents(all_texts, OpenAIEmbeddings(model="text-embedding-3-large"))
        vector_db.save_local(DB_FAISS)

        return JSONResponse(content={"message": f"Successfully created FAISS database from {len(pdf_files)} PDF(s).", "pdfs_used": [os.path.basename(f) for f in pdf_files]})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

# === Serve Chat Interface ===


# === API Endpoints: Chat Assistance ===

# --- AGENTIC RAG PROMPT ---
AGENTIC_RAG_PROMPT = """
You are TenMin AI Assistant for 10 Minute School. Your job is to help students using retrieved context, reasoning, and explanation.

Guidelines:
- Always use the story context to answer.
- If the user question includes multiple choice options, pick the correct one and explain why.
- If the user question does NOT include options, answer directly without mentioning option letters like "(ক)", "(খ)", "(গ)" etc.
- Use MCQ data only to verify your answer — never copy directly.
- Most Important **Always answer in the same language the user used: Bangla → Bangla answer, English → English answer, Banglish → Banglish answer.**
    (Always answer in the exact language and script of the user's question. If the question is in Bangla, your entire answer (including all reasoning, explanation, and justification) must also be in Bangla, 
    with no English words unless they are unavoidable technical terms.
    If the question is in English, answer in English, and if in Banglish/mixed, answer in the same style.)
- Use natural, fluent sentences like a human teacher. Avoid repeating phrases such as "e.g.The context clearly mentions..."
- Always explain the answer Shortly for example the answer is ..." — and explain why. (for bangla: "উত্তর হলো ... কারণ ...")
- If the user asks for clarification, explain again in simpler language.
- If truly no info, or if the user's question is irrelevant to the official HSC Bangla 1st Paper syllabus and the given document (e.g., "tell me about Lionel Messi") or any irrelevent question, clearly say: "Sorry, I can't find a clear answer in the knowledge base."

Context:
{context}

MCQ Data (if matched):
{mcq}

Chat History:
{chat_history}

User Question:
{question}

Your Answer:
"""

# === Helper: Load vector DB + hybrid retriever ===
def load_hybrid_retriever():
    embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
    db = FAISS.load_local(DB_FAISS, embeddings, allow_dangerous_deserialization=True)
    dense_retriever = db.as_retriever(search_kwargs={"k": 5})

    # Build BM25 from same docs
    loader = PyMuPDFLoader(os.path.join(DATA_PATH, os.listdir(DATA_PATH)[0]))
    docs = loader.load()
    sparse_retriever = BM25Retriever.from_documents(docs)

    # Combine
    hybrid = EnsembleRetriever(
        retrievers=[dense_retriever, sparse_retriever],
        weights=[0.6, 0.4]
    )
    return hybrid

# === Helper: Try to match user question with MCQ ===
def match_mcq(question):
    for mcq in MCQ_DATA:
        if mcq["question"] in question:
            return mcq
    return None

# --- Streaming Chat API ---
@app.post("/api/chat")
async def chat_api(request: Request):
    # Accepts: {"history": [...]}
    body = await request.body()
    data = json.loads(body)
    history = data.get("history", [])
    # User's latest question is last "user" turn
    user_turns = [h for h in history if h["role"] == "user"]
    question = user_turns[-1]["content"] if user_turns else ""
    # Prepare chat_history for prompt (format last N turns)
    context_window = []
    for msg in history[-6:]:  # Last 6 turns
        who = "User" if msg["role"] == "user" else "Assistant"
        context_window.append(f"{who}: {msg['content']}")
    chat_history_str = "\n".join(context_window)

    # Load vector DB and retrieve context
    #db = load_hybrid_retriever()
    #retriever = db.as_retriever(search_kwargs={'k': 5})
    #docs = retriever.invoke(question) # get_relevant_documents
    #context = "\n---\n".join([doc.page_content for doc in docs])
    hybrid = load_hybrid_retriever()
    docs = hybrid.invoke(question)
    context = "\n---\n".join([doc.page_content for doc in docs])

    # Check MCQ match
    matched_mcq = match_mcq(question)
    mcq_text = json.dumps(matched_mcq, ensure_ascii=False, indent=2) if matched_mcq else ""

    # Compose agentic RAG prompt
    prompt = PromptTemplate(
        template=AGENTIC_RAG_PROMPT,
        input_variables=["context", "mcq", "chat_history", "question"]
    ).format(context=context, mcq=mcq_text, chat_history=chat_history_str, question=question)

    # LLM with streaming (reasoning enabled by prompt)
    llm = ChatOpenAI(model="gpt-4o-2024-08-06", temperature=0.3, streaming=True)

    def gen():
        # Use LangChain's streaming (token by token)
        for chunk in llm.stream(prompt):
            yield chunk.content

    return StreamingResponse(gen(), media_type="text/plain")

# === Vector DB Status API (for chat.js to check if KB exists) ===
@app.get("/api/vector_db_status")
def vector_db_status():
    try:
        exists = any(os.path.isfile(os.path.join(DB_FAISS, f)) for f in os.listdir(DB_FAISS))
        return {"exists": exists}
    except Exception:
        return {"exists": False}



# === For local testing ===
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8002)