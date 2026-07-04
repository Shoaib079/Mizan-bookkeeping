"""Tests for detect_document_type (UX-C)."""

import pytest

from app.features.documents.detect import (
    Confidence,
    DocumentType,
    detect_document_type,
)


class TestInvoiceDetection:
    def test_xml_efatura_by_content(self):
        content = b'<?xml version="1.0"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"></Invoice>'
        doc_type, confidence = detect_document_type(content)
        assert doc_type == DocumentType.INVOICE
        assert confidence == Confidence.HIGH

    def test_pdf_by_magic_bytes(self):
        content = b"%PDF-1.4 some invoice content"
        doc_type, confidence = detect_document_type(content)
        assert doc_type == DocumentType.INVOICE
        assert confidence == Confidence.MEDIUM

    def test_xml_by_filename(self):
        doc_type, confidence = detect_document_type(
            b"<root>not obviously an invoice</root>",
            filename="fatura.xml",
        )
        assert doc_type == DocumentType.INVOICE
        assert confidence == Confidence.HIGH

    def test_pdf_by_filename(self):
        doc_type, confidence = detect_document_type(
            b"random bytes",
            filename="invoice.pdf",
        )
        assert doc_type == DocumentType.INVOICE
        assert confidence == Confidence.MEDIUM


class TestBankStatementDetection:
    def test_csv_by_extension(self):
        doc_type, confidence = detect_document_type(
            b"date,amount\n2026-01-01,100",
            filename="export.csv",
        )
        assert doc_type == DocumentType.BANK_STATEMENT
        assert confidence == Confidence.HIGH

    def test_xlsx_by_extension(self):
        doc_type, confidence = detect_document_type(
            b"PK\x03\x04...",
            filename="statement.xlsx",
        )
        assert doc_type == DocumentType.BANK_STATEMENT
        assert confidence == Confidence.HIGH

    def test_xls_by_extension(self):
        doc_type, confidence = detect_document_type(
            b"\xd0\xcf\x11\xe0...",
            filename="statement.xls",
        )
        assert doc_type == DocumentType.BANK_STATEMENT
        assert confidence == Confidence.HIGH

    def test_csv_by_content_type(self):
        doc_type, confidence = detect_document_type(
            b"date,amount\n2026-01-01,100",
            content_type="text/csv",
        )
        assert doc_type == DocumentType.BANK_STATEMENT
        assert confidence == Confidence.HIGH


class TestExpenseReceiptDetection:
    def test_jpeg_by_magic_bytes(self):
        content = b"\xff\xd8\xff\xe0photo data..."
        doc_type, confidence = detect_document_type(content)
        assert doc_type == DocumentType.EXPENSE_RECEIPT
        assert confidence == Confidence.MEDIUM

    def test_png_by_magic_bytes(self):
        content = b"\x89PNG\r\n\x1a\nimage data..."
        doc_type, confidence = detect_document_type(content)
        assert doc_type == DocumentType.EXPENSE_RECEIPT
        assert confidence == Confidence.MEDIUM

    def test_image_by_filename(self):
        doc_type, confidence = detect_document_type(
            b"raw data", filename="receipt.jpg"
        )
        assert doc_type == DocumentType.EXPENSE_RECEIPT
        assert confidence == Confidence.MEDIUM

    def test_image_by_content_type(self):
        doc_type, confidence = detect_document_type(
            b"raw data", content_type="image/jpeg"
        )
        assert doc_type == DocumentType.EXPENSE_RECEIPT
        assert confidence == Confidence.MEDIUM


class TestFallback:
    def test_unknown_file_returns_low_confidence(self):
        doc_type, confidence = detect_document_type(b"completely unknown data")
        assert doc_type == DocumentType.EXPENSE_RECEIPT
        assert confidence == Confidence.LOW

    def test_unknown_with_weird_extension(self):
        doc_type, confidence = detect_document_type(
            b"data", filename="something.xyz"
        )
        assert doc_type == DocumentType.EXPENSE_RECEIPT
        assert confidence == Confidence.LOW


class TestDocumentTypeEnum:
    def test_all_types_exist(self):
        assert DocumentType.INVOICE == "invoice"
        assert DocumentType.BANK_STATEMENT == "bank_statement"
        assert DocumentType.EXPENSE_RECEIPT == "expense_receipt"
        assert DocumentType.POS_DAILY_SUMMARY == "pos_daily_summary"

    def test_confidence_levels(self):
        assert Confidence.HIGH == "high"
        assert Confidence.MEDIUM == "medium"
        assert Confidence.LOW == "low"
