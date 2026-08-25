"""Pydantic schemas for the BRABO OCR API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

# Stable keys of `fields`, shared with the frontend `ocrService.ts`.
FIELD_KEYS = [
    "supplierName",
    "supplierVat",
    "supplierBce",
    "invoiceNumber",
    "invoiceDate",
    "dueDate",
    "paymentTermsDays",
    "iban",
    "structuredCommunication",
    "totalExclVat",
    "vatRate",
    "vatAmount",
    "totalInclVat",
]


class OcrField(BaseModel):
    """A single extracted field: its value plus a 0..1 confidence."""

    value: Any = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class OcrSuggestion(BaseModel):
    """Bookkeeping suggestion derived from the extraction (PCMN, CIR92…)."""

    pcmnAccount: str | None = None
    category: str | None = None
    label: str | None = None
    deductibilityRate: int | None = None
    deductibleVatRate: int | None = None
    isInvestment: bool = False
    description: str | None = None


class OcrExtractResult(BaseModel):
    engine: str = "paddleocr"
    engineVersion: str
    processedAt: str
    pages: int
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rawText: str
    fields: dict[str, OcrField]
    suggestion: OcrSuggestion
    warnings: list[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    engine: str | None = None
    engineVersion: str | None = None
    lang: str | None = None
    cpu: bool | None = None
    device: str | None = None
    error: str | None = None
