import fitz  # PyMuPDF


def extract_text(file_path: str) -> str:
    """Extract all text from a PDF file."""
    doc = fitz.open(file_path)
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    text = "\n\n".join(pages)
    if not text.strip():
        raise ValueError("PDF contains no extractable text (possibly scanned without OCR)")
    return text
