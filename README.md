# Agent-Cloak

CLI tool for detecting and redacting sensitive data in PDFs and text files.

Deterministic regex-based scanning with confidence levels, interactive
selection, and format-aware redaction that won't corrupt your files.

## Usage

```bash
agent-cloak invoice.pdf              # scan, select, redact → invoice-redacted.pdf
agent-cloak contracts/               # scan all supported files in a directory
agent-cloak --manual form.pdf        # manual find/replace mode (no auto-scan)
agent-cloak report.pdf -o clean.pdf  # custom output path
```

## How It Works

1. **Scan** — extracts text (PDF via PyMuPDF, or reads plain text) and runs 29 regex
   patterns with validators (Luhn check, keyword proximity, SSN rules, octet validation)
2. **Report** — categorized findings with confidence levels and context snippets.
   HIGH confidence items pre-selected for redaction, MEDIUM shown but unchecked.
3. **Select** — interactive toggle by item number, range, or category
4. **Redact** — PDF gets white-fill redaction annotations via PyMuPDF.
   Text files get same-length `***` replacement. Output is always a new file.

## Detected Patterns

### PII (9 patterns)

| Pattern | Examples | Confidence |
|---------|----------|------------|
| SSN | `123-45-6789` | HIGH |
| ITIN | `912-34-5678` | HIGH |
| SSN (no dashes) | `SSN: 123456789` | HIGH |
| SSN (last 4) | `xx-1234`, `***-**-5678` | HIGH |
| Email | `user@example.com` | HIGH |
| Phone (US) | `(555) 867-5309`, `555.123.4567` | HIGH |
| Date of Birth | `DOB: 03/15/1985` | HIGH |
| Driver's License | `DL: A1234567` | HIGH |
| Passport | `Passport #: C12345678` | HIGH |

### Financial (8 patterns)

| Pattern | Examples | Confidence |
|---------|----------|------------|
| Credit Card | `4111-1111-1111-1111` (Luhn-validated) | HIGH |
| Amex | `3782-822463-10005` (Luhn-validated) | HIGH |
| CVV/CVC | `CVV: 123` | HIGH |
| Card Expiry | `Exp: 03/25` | HIGH |
| EIN/Tax ID | `EIN: 12-3456789` | HIGH |
| IBAN | `GB29 NWBK 6016 1331 9268 19` | HIGH |
| Routing # | `021000021` | MEDIUM |
| Bank Account | `Account #: 12345678901234` | MEDIUM |

### Identifiers (4 patterns)

| Pattern | Examples | Confidence |
|---------|----------|------------|
| Case/Ref # | `Case #: 2024-INV-00847` | HIGH |
| MRN | `MRN: 12345678` | HIGH |
| VIN | `VIN: 1HGBH41JXMN109186` | HIGH |
| Account ID | `Customer Number: 8820194` | MEDIUM |

### Secrets/Tokens (8 patterns)

| Pattern | Examples | Confidence |
|---------|----------|------------|
| JWT | `eyJhbG...` (3-segment base64url) | HIGH |
| AWS Key | `AKIAIOSFODNN7EXAMPLE` | HIGH |
| API Key | `sk-1234567890abcdefghijklmn` | HIGH |
| Bearer Token | `Bearer ghp_abc123...` | HIGH |
| Private Key | `-----BEGIN PRIVATE KEY-----` | HIGH |
| Credential URL | `postgres://user:pass@host` | HIGH |
| IP Address | `server: 192.168.1.100` | MEDIUM |
| Generic Secret | `password=AbCd1234...` | MEDIUM |

## Interactive Commands

```
1,3,5-8       Toggle specific items
pii           Toggle all PII items
financial     Toggle all Financial items
identifiers   Toggle all Identifier items
secrets       Toggle all Secrets/Tokens items
all / none    Select all / deselect all
go            Proceed with redaction
quit          Exit without changes
```

## Supported File Types

PDF, TXT, CSV, TSV, JSON, XML, MD, LOG, HTML, YAML

## Requirements

```bash
pip install pymupdf
```

## Tests

```bash
pip install pytest
python3 -m pytest test_agent_cloak.py -v
```

180 tests covering pattern detection, false positive resistance, masking,
Luhn validation, toggle UX, and end-to-end PDF/text redaction.
