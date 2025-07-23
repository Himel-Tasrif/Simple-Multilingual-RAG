import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from typing import List
from langchain_community.document_loaders import PyMuPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings
from dotenv import load_dotenv
from fastapi.templating import Jinja2Templates
from fastapi import Request
# Load environment variables
load_dotenv()

app = FastAPI()

# Paths for storing PDFs and FAISS vector databases
DATA_PATH_BANGLA = "data/bangla_pdfs/"
DATA_PATH_ENGLISH = "data/english_pdfs/"
DB_FAISS_BANGLA = "vectorstore/bangla_db"
DB_FAISS_ENGLISH = "vectorstore/english_db"

# Ensure directories exist
os.makedirs(DATA_PATH_BANGLA, exist_ok=True)
os.makedirs(DATA_PATH_ENGLISH, exist_ok=True)
os.makedirs(DB_FAISS_BANGLA, exist_ok=True)
os.makedirs(DB_FAISS_ENGLISH, exist_ok=True)

# Add this line to enable Jinja templates
templates = Jinja2Templates(directory="templates")

# ✅ Serve Admin Panel UI
@app.get("/")
async def admin_panel(request: Request):
    return templates.TemplateResponse("admin.html", {"request": request})


# ✅ API Endpoint: Upload PDFs
@app.post("/admin/upload_pdf/")
async def upload_pdf(language: str, pdf_files: List[UploadFile] = File(...)):
    """Uploads PDFs for Bangla or English"""
    try:
        save_path = DATA_PATH_BANGLA if language == "bangla" else DATA_PATH_ENGLISH

        for pdf_file in pdf_files:
            file_location = os.path.join(save_path, pdf_file.filename)
            with open(file_location, "wb") as f:
                f.write(await pdf_file.read())

        return JSONResponse(content={"message": f"Successfully uploaded {len(pdf_files)} PDF(s) for {language.capitalize()}."})
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ✅ API Endpoint: List Uploaded PDFs
@app.get("/admin/list_pdfs/")
async def list_pdfs():
    """Returns the list of uploaded PDFs for Bangla and English"""
    try:
        bangla_pdfs = os.listdir(DATA_PATH_BANGLA)
        english_pdfs = os.listdir(DATA_PATH_ENGLISH)

        return JSONResponse(content={"bangla_pdfs": bangla_pdfs, "english_pdfs": english_pdfs})
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ✅ API Endpoint: Download PDFs
@app.get("/admin/download_pdf/")
async def download_pdf(language: str, filename: str):
    """Downloads a specific PDF file"""
    try:
        file_path = os.path.join(DATA_PATH_BANGLA if language == "bangla" else DATA_PATH_ENGLISH, filename)
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(file_path, headers={"Content-Disposition": f"attachment; filename={filename}"})
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ✅ API Endpoint: Generate FAISS Vector Database
@app.post("/admin/generate_vector_db/")
async def generate_vector_db(language: str):
    """Generates FAISS vector database from uploaded PDFs"""
    try:
        pdf_folder = DATA_PATH_BANGLA if language == "bangla" else DATA_PATH_ENGLISH
        db_path = DB_FAISS_BANGLA if language == "bangla" else DB_FAISS_ENGLISH

        pdf_files = [os.path.join(pdf_folder, f) for f in os.listdir(pdf_folder) if f.endswith(".pdf")]
        
        if not pdf_files:
            raise HTTPException(status_code=400, detail=f"No PDFs found in {language} directory.")

        # Load and process PDFs
        all_texts = []
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)

        for pdf in pdf_files:
            loader = PyMuPDFLoader(pdf)
            docs = loader.load()
            chunks = text_splitter.split_documents(docs)
            all_texts.extend(chunks)

        # Generate embeddings and store in FAISS
        vector_db = FAISS.from_documents(all_texts, OpenAIEmbeddings(model="text-embedding-3-large")) #  text-embedding-ada-002
        vector_db.save_local(db_path)

        return JSONResponse(content={"message": f"Successfully created FAISS database for {language.capitalize()}."})
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ✅ Run the FastAPI Admin Server on Port 8002
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8002)
