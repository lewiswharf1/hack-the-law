import os
from pathlib import Path

SUPPORTED_FILE_TYPES = {"pdf", "docx", "eml", "csv"}

MIME_TYPE_MAP = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "eml": "message/rfc822",
    "csv": "text/csv",
}


def get_file_type(filename: str) -> str | None:
    """
    Extract and validate file extension from filename.

    Args:
        filename: The original filename (e.g., 'document.pdf')

    Returns:
        Lowercase file type ('pdf', 'docx', 'eml', 'csv') or None if unsupported
    """
    if not filename:
        return None

    ext = Path(filename).suffix.lstrip(".").lower()

    if ext in SUPPORTED_FILE_TYPES:
        return ext

    return None


def validate_file_extension(filename: str) -> tuple[bool, str]:
    """
    Validate that a filename has a supported extension.

    Args:
        filename: The original filename

    Returns:
        Tuple of (is_valid: bool, file_type_or_error_msg: str)
        If valid: (True, file_type)
        If invalid: (False, error_message)
    """
    file_type = get_file_type(filename)

    if file_type:
        return (True, file_type)

    return (
        False,
        f"Unsupported file type. Allowed: {', '.join(sorted(SUPPORTED_FILE_TYPES)).upper()}",
    )


def validate_file_magic(file_path: str, expected_type: str) -> bool:
    """
    Perform basic magic number validation to detect file spoofing.

    Args:
        file_path: Path to the uploaded file
        expected_type: Expected file type ('pdf', 'docx', 'eml', 'csv')

    Returns:
        True if file magic matches expected type, False otherwise
    """
    magic_signatures = {
        "pdf": [b"%PDF"],
        "docx": [b"PK\x03\x04"],  # ZIP archive
        "eml": [b"From:", b"Subject:", b"Date:"],  # Common email headers
        "csv": [b",", b";"],  # CSV delimiters (very loose)
    }

    if expected_type not in magic_signatures:
        return True  # Skip validation for unknown types

    signatures = magic_signatures[expected_type]

    try:
        with open(file_path, "rb") as f:
            header = f.read(1024)  # Read first 1024 bytes

        for sig in signatures:
            if header.startswith(sig):
                return True

        # Relaxed check: if it's CSV, it might just be text without delimiters
        if expected_type == "csv":
            return True

        return False

    except Exception:
        return True  # If we can't read, let downstream handle it
