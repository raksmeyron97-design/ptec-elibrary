import os
import shutil
import fitz  # PyMuPDF
import pandas as pd

SOURCE_DIR = "/Users/mac/Downloads/Research Methods and Statistics"
OUTPUT_DIR = "/Users/mac/Downloads/PTEC_Bulk_Upload"
PDF_DIR = os.path.join(OUTPUT_DIR, "renamed_pdfs")
COVER_DIR = os.path.join(OUTPUT_DIR, "covers")

def ensure_dirs():
    os.makedirs(PDF_DIR, exist_ok=True)
    os.makedirs(COVER_DIR, exist_ok=True)

def process_pdfs():
    ensure_dirs()
    
    data = []
    
    if not os.path.exists(SOURCE_DIR):
        print(f"Source directory not found: {SOURCE_DIR}")
        return
        
    pdf_files = [f for f in os.listdir(SOURCE_DIR) if f.lower().endswith('.pdf')]
    pdf_files.sort()
    print(f"Found {len(pdf_files)} PDF files in {SOURCE_DIR}")
    
    for idx, filename in enumerate(pdf_files, start=1):
        clean_name = f"book_{idx:03d}"
        new_pdf_name = f"{clean_name}.pdf"
        new_cover_name = f"{clean_name}.jpg"
        
        source_path = os.path.join(SOURCE_DIR, filename)
        pdf_path = os.path.join(PDF_DIR, new_pdf_name)
        cover_path = os.path.join(COVER_DIR, new_cover_name)
        
        # Copy PDF
        shutil.copy2(source_path, pdf_path)
        
        title = os.path.splitext(filename)[0]
        author = "Unknown"
        pages = 0
        
        try:
            doc = fitz.open(source_path)
            
            # Extract cover
            if len(doc) > 0:
                page = doc[0]
                pix = page.get_pixmap(dpi=150)
                pix.save(cover_path)
            
            # Extract metadata
            metadata = doc.metadata
            if metadata:
                if metadata.get('title'):
                    title = metadata['title']
                if metadata.get('author'):
                    author = metadata['author']
            
            pages = len(doc)
            doc.close()
        except Exception as e:
            print(f"Error processing {filename}: {e}")
            
        data.append({
            'title': title,
            'author': author,
            'category': 'Research',
            'department': 'Research',
            'language': 'English',
            'pdf_file': new_pdf_name,
            'cover_file': new_cover_name,
            'keywords': '',
            'isbn': '',
            'year': '',
            'pages': pages,
            'summary': ''
        })
        
    if not data:
        print("No data to save.")
        return

    df = pd.DataFrame(data, columns=[
        'title', 'author', 'category', 'department', 'language', 
        'pdf_file', 'cover_file', 'keywords', 'isbn', 'year', 'pages', 'summary'
    ])
    
    csv_path = os.path.join(OUTPUT_DIR, 'books_upload.csv')
    excel_path = os.path.join(OUTPUT_DIR, 'books_upload.xlsx')
    
    df.to_csv(csv_path, index=False)
    df.to_excel(excel_path, index=False)
    print(f"Processed {len(data)} files.")
    print(f"Outputs saved to {OUTPUT_DIR}")

if __name__ == "__main__":
    process_pdfs()
