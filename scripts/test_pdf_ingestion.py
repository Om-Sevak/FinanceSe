import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.services.pdf_ingestion import PDFTransactionExtractor


def main():
    parser = argparse.ArgumentParser(description="PDF ingestion tester")
    parser.add_argument(
        "pdf_path",
        type=Path,
        help="Path to the PDF statement to parse",
    )
    args = parser.parse_args()

    pdf_path: Path = args.pdf_path
    if not pdf_path.exists():
        raise SystemExit(f"File not found: {pdf_path}")

    extractor = PDFTransactionExtractor()
    rows = extractor.extract(pdf_path.read_bytes())

    print(f"Extracted {len(rows)} transactions from {pdf_path}:")
    for row in rows:
        print(f"- {row.date} | {row.description} | {row.amount}")


if __name__ == "__main__":
    main()
