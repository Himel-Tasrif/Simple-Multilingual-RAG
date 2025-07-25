import os
from dotenv import load_dotenv
from langchain_community.document_loaders import PyMuPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter

load_dotenv()
print(os.getenv("OPENAI_API_KEY"))


# === CONFIG ===
PDF_DIR = "data/uploaded_pdfs/"
OUTPUT_TEXT_DIR = "debug_outputs/"

CHUNK_SIZE = 500
CHUNK_OVERLAP = 100

os.makedirs(OUTPUT_TEXT_DIR, exist_ok=True)

def save_text_to_file(text, filename):
    with open(filename, "w", encoding="utf-8") as f:
        f.write(text)

def extract_and_save(pdf_path, base_filename):
    # Load PDF and extract all text (with page info)
    loader = PyMuPDFLoader(pdf_path)
    docs = loader.load()
    full_text = ""
    for i, doc in enumerate(docs):
        full_text += f"\n{'='*20} PAGE {i+1} {'='*20}\n"
        full_text += doc.page_content
    # Save full raw text
    text_file = os.path.join(OUTPUT_TEXT_DIR, f"{base_filename}_full.txt")
    save_text_to_file(full_text, text_file)
    print(f"Saved extracted text to {text_file}")

    # Split into chunks
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    chunks = text_splitter.split_documents(docs)
    # Save each chunk with index and (optionally) page number metadata
    chunk_file = os.path.join(OUTPUT_TEXT_DIR, f"{base_filename}_chunks.txt")
    with open(chunk_file, "w", encoding="utf-8") as f:
        for idx, chunk in enumerate(chunks):
            page = chunk.metadata.get("page", "?")
            f.write(f"\n----- CHUNK {idx+1} (page {page}) -----\n")
            f.write(chunk.page_content.strip() + "\n")
    print(f"Saved chunked text to {chunk_file}")
    return len(chunks)

def main():
    pdf_files = [f for f in os.listdir(PDF_DIR) if f.lower().endswith(".pdf")]
    if not pdf_files:
        print("No PDF files found in", PDF_DIR)
        return

    for pdf in pdf_files:
        pdf_path = os.path.join(PDF_DIR, pdf)
        base_filename = os.path.splitext(pdf)[0]
        print(f"Processing: {pdf_path}")
        n_chunks = extract_and_save(pdf_path, base_filename)
        print(f"  -> Extracted and chunked into {n_chunks} chunks.\n")

if __name__ == "__main__":
    main()