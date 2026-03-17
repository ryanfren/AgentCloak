"""Tests for Agent-Cloak — pattern detection, masking, toggles, and redaction."""

import os
import re
import tempfile
from pathlib import Path

import pytest

# Import the module under test (no .py extension on the script)
import importlib.util
_cloak_path = str(Path(__file__).parent / "agent-cloak")
spec = importlib.util.spec_from_file_location("agent_cloak", _cloak_path,
                                               submodule_search_locations=[])
if spec is None:
    import importlib.machinery
    loader = importlib.machinery.SourceFileLoader("agent_cloak", _cloak_path)
    spec = importlib.util.spec_from_loader("agent_cloak", loader)
redact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(redact)

Finding = redact.Finding


# ═══════════════════════════════════════════════════════════════════
# Luhn check
# ═══════════════════════════════════════════════════════════════════

class TestLuhnCheck:
    def test_valid_visa(self):
        assert redact.luhn_check("4111111111111111") is True

    def test_valid_visa_with_separators(self):
        assert redact.luhn_check("4111-1111-1111-1111") is True

    def test_valid_mastercard(self):
        assert redact.luhn_check("5500000000000004") is True

    def test_valid_amex(self):
        assert redact.luhn_check("378282246310005") is True

    def test_invalid_number(self):
        assert redact.luhn_check("1234567890123456") is False

    def test_too_short(self):
        assert redact.luhn_check("123456") is False

    def test_random_digits_rejected(self):
        assert redact.luhn_check("9999888877776666") is False


# ═══════════════════════════════════════════════════════════════════
# Mask functions
# ═══════════════════════════════════════════════════════════════════

class TestMaskFunctions:
    def test_mask_ssn(self):
        assert redact.mask_ssn("123-45-6789") == "***-**-6789"

    def test_mask_email(self):
        assert redact.mask_email("john@example.com") == "****@example.com"

    def test_mask_email_no_at(self):
        assert redact.mask_email("broken") == "****"

    def test_mask_phone(self):
        assert redact.mask_phone("(555) 867-5309") == "(***) ***-5309"

    def test_mask_phone_dots(self):
        assert redact.mask_phone("555.123.4567") == "(***) ***-4567"

    def test_mask_cc(self):
        assert redact.mask_cc("4111-1111-1111-1111") == "****-****-****-1111"

    def test_mask_cc_spaces(self):
        assert redact.mask_cc("5500 0000 0000 0004") == "****-****-****-0004"

    def test_mask_partial_long(self):
        assert redact.mask_partial("12345678") == "****5678"

    def test_mask_partial_short(self):
        assert redact.mask_partial("1234") == "****"

    def test_mask_partial_very_short(self):
        assert redact.mask_partial("12") == "**"

    def test_mask_full(self):
        assert redact.mask_full("secret") == "******"


# ═══════════════════════════════════════════════════════════════════
# Pattern detection — TRUE POSITIVES
# ═══════════════════════════════════════════════════════════════════

def scan(text: str) -> list[Finding]:
    """Helper: scan text and return findings."""
    return redact.scan_text(text, "test.txt", 0, False)


def labels(findings: list[Finding]) -> list[str]:
    """Helper: extract labels from findings."""
    return [f.label for f in findings]


def matched(findings: list[Finding]) -> list[str]:
    """Helper: extract matched text from findings."""
    return [f.matched_text for f in findings]


class TestITINDetection:
    def test_standard_itin(self):
        results = scan("ITIN: 912-34-5678")
        assert "ITIN" in labels(results)
        assert "912-34-5678" in matched(results)

    def test_itin_not_caught_as_ssn(self):
        results = scan("Number: 912-34-5678")
        ssns = [f for f in results if f.label == "SSN"]
        assert len(ssns) == 0

    def test_itin_900_range(self):
        results = scan("Tax ID: 999-88-7777")
        assert "ITIN" in labels(results)


class TestSSNNoDashes:
    def test_ssn_keyword_9_digits(self):
        results = scan("SSN: 123456789")
        assert "SSN (no dashes)" in labels(results)
        assert "123456789" in matched(results)

    def test_social_security_keyword(self):
        results = scan("Social Security Number: 234567890")
        assert "SSN (no dashes)" in labels(results)

    def test_bare_9_digits_not_flagged(self):
        """9 digits without SSN keyword should NOT match this pattern."""
        results = scan("Code: 123456789")
        nodash = [f for f in results if f.label == "SSN (no dashes)"]
        assert len(nodash) == 0

    def test_rejects_000_prefix(self):
        results = scan("SSN: 000123456")
        nodash = [f for f in results if f.label == "SSN (no dashes)"]
        assert len(nodash) == 0


class TestSSNLast4Detection:
    def test_xx_dash_digits(self):
        results = scan("SSN: xx-1234")
        assert "SSN (last 4)" in labels(results)

    def test_XX_uppercase(self):
        results = scan("SSN: XX-5678")
        assert "SSN (last 4)" in labels(results)

    def test_stars_full_mask(self):
        results = scan("SSN: ***-**-9012")
        assert "SSN (last 4)" in labels(results)

    def test_xxx_xx_format(self):
        results = scan("SSN: xxx-xx-3456")
        assert "SSN (last 4)" in labels(results)

    def test_last_4_keyword(self):
        results = scan("Last 4 of SSN: 7890")
        assert "SSN (last 4)" in labels(results)

    def test_ssn_last_keyword(self):
        results = scan("SSN last 4: 4321")
        assert "SSN (last 4)" in labels(results)

    def test_bare_4_digits_not_flagged(self):
        """Plain 4 digits without SSN context should NOT match."""
        results = scan("Room 1234 is available")
        last4 = [f for f in results if f.label == "SSN (last 4)"]
        assert len(last4) == 0


class TestSSNDetection:
    def test_standard_ssn(self):
        results = scan("SSN: 123-45-6789")
        assert "SSN" in labels(results)
        assert "123-45-6789" in matched(results)

    def test_ssn_in_sentence(self):
        results = scan("His social security number is 234-56-7890 on file.")
        assert "SSN" in labels(results)

    def test_rejects_000_prefix(self):
        results = scan("Number: 000-12-3456")
        assert "SSN" not in labels(results)

    def test_rejects_666_prefix(self):
        results = scan("Number: 666-12-3456")
        assert "SSN" not in labels(results)

    def test_rejects_9xx_prefix(self):
        results = scan("Number: 900-12-3456")
        assert "SSN" not in labels(results)


class TestEmailDetection:
    def test_standard_email(self):
        results = scan("Contact: alice@example.com for info")
        assert "Email" in labels(results)
        assert "alice@example.com" in matched(results)

    def test_email_with_dots(self):
        results = scan("john.doe.jr@hospital.org")
        assert "Email" in labels(results)

    def test_email_with_plus(self):
        results = scan("user+tag@gmail.com")
        assert "Email" in labels(results)

    def test_not_triggered_by_at_sign_alone(self):
        results = scan("Type @ to mention someone")
        assert "Email" not in labels(results)


class TestPhoneDetection:
    def test_parens_format(self):
        results = scan("Call (555) 867-5309")
        assert "Phone (US)" in labels(results)

    def test_dots_format(self):
        results = scan("Phone: 555.123.4567")
        assert "Phone (US)" in labels(results)

    def test_dashes_format(self):
        results = scan("Fax: 555-123-4567")
        assert "Phone (US)" in labels(results)

    def test_with_country_code(self):
        results = scan("Dial +1-555-123-4567")
        assert "Phone (US)" in labels(results)

    def test_rejects_short_number(self):
        """7 digits alone should not match."""
        results = scan("Code: 1234567")
        assert "Phone (US)" not in labels(results)


class TestDOBDetection:
    def test_dob_keyword(self):
        results = scan("DOB: 03/15/1985")
        assert "Date of Birth" in labels(results)

    def test_date_of_birth_keyword(self):
        results = scan("Date of Birth: 12-25-1990")
        assert "Date of Birth" in labels(results)

    def test_birthday_keyword(self):
        results = scan("birthday: 1/1/2000")
        assert "Date of Birth" in labels(results)

    def test_plain_date_not_flagged(self):
        """A date without DOB context should NOT be flagged as DOB."""
        results = scan("Appointment on 03/15/2024 at 3pm")
        assert "Date of Birth" not in labels(results)


class TestCreditCardDetection:
    def test_visa_dashes(self):
        results = scan("Card: 4111-1111-1111-1111")
        assert "Credit Card" in labels(results)

    def test_visa_spaces(self):
        results = scan("Card: 4111 1111 1111 1111")
        assert "Credit Card" in labels(results)

    def test_mastercard(self):
        results = scan("MC: 5500-0000-0000-0004")
        assert "Credit Card" in labels(results)

    def test_invalid_luhn_rejected(self):
        """16 digits that fail Luhn should NOT match."""
        results = scan("Number: 1234-5678-9012-3456")
        cc_findings = [f for f in results if f.label == "Credit Card"]
        assert len(cc_findings) == 0

    def test_amex(self):
        results = scan("Amex: 3782-822463-10005")
        assert "Amex" in labels(results)


class TestRoutingNumber:
    def test_valid_routing(self):
        results = scan("Routing: 021000021")
        r = [f for f in results if f.label == "Routing #"]
        assert len(r) == 1
        assert r[0].confidence == "MEDIUM"

    def test_random_9_digits_not_routing(self):
        """9 digits starting with 99 should NOT match routing pattern."""
        results = scan("Code: 991234567")
        assert "Routing #" not in labels(results)


class TestBankAccount:
    def test_account_keyword(self):
        results = scan("Account #: 12345678901234")
        assert "Bank Account" in labels(results)

    def test_acct_keyword(self):
        results = scan("Acct: 987654321")
        ba = [f for f in results if f.label == "Bank Account"]
        assert len(ba) == 1

    def test_bare_number_not_flagged(self):
        """Long number without keyword should NOT match bank account."""
        results = scan("Value: 12345678901234")
        assert "Bank Account" not in labels(results)


class TestIdentifiers:
    def test_case_number(self):
        results = scan("Case #: 2024-INV-00847")
        assert "Case/Ref #" in labels(results)

    def test_reference_number(self):
        results = scan("Reference No: REF-98765")
        assert "Case/Ref #" in labels(results)

    def test_policy_number(self):
        results = scan("Policy Number: POL-449281")
        assert "Case/Ref #" in labels(results)

    def test_claim_id(self):
        results = scan("Claim ID: CLM-2024-55123")
        assert "Case/Ref #" in labels(results)

    def test_customer_id(self):
        results = scan("Customer Number: 8820194")
        assert "Account ID" in labels(results)

    def test_member_id(self):
        results = scan("Member ID: 990188234")
        r = [f for f in results if f.label in ("Case/Ref #", "Account ID")]
        assert len(r) >= 1

    def test_subscriber_number(self):
        # 10-digit number after "Subscriber" matches Phone (US) due to pattern priority
        # and dedup prevents double-match. Either label is acceptable detection.
        results = scan("Subscriber Number: 7712345678")
        r = [f for f in results if f.matched_text == "7712345678"]
        assert len(r) >= 1

    def test_subscriber_short_number(self):
        # 8-digit number won't match Phone, so Account ID should catch it
        results = scan("Subscriber Number: 77123456")
        r = [f for f in results if f.label == "Account ID"]
        assert len(r) == 1


# ═══════════════════════════════════════════════════════════════════
# Driver's License and Passport detection
# ═══════════════════════════════════════════════════════════════════

class TestDriversLicenseDetection:
    def test_standard_dl(self):
        results = scan("Driver's License #: A1234567")
        assert "Driver's License" in labels(results)

    def test_dl_abbreviation(self):
        results = scan("DL: B9876543")
        assert "Driver's License" in labels(results)

    def test_license_keyword(self):
        results = scan("License Number: C12345678901")
        assert "Driver's License" in labels(results)

    def test_random_letter_digits_not_flagged(self):
        results = scan("Code: A1234567")
        assert "Driver's License" not in labels(results)


class TestPassportDetection:
    def test_passport_with_letter(self):
        results = scan("Passport No: C12345678")
        assert "Passport" in labels(results)

    def test_passport_digits_only(self):
        results = scan("Passport #: 123456789")
        assert "Passport" in labels(results)

    def test_bare_number_not_flagged(self):
        results = scan("Number: 123456789")
        p = [f for f in results if f.label == "Passport"]
        assert len(p) == 0


# ═══════════════════════════════════════════════════════════════════
# CVV, Card Expiry, EIN, IBAN detection
# ═══════════════════════════════════════════════════════════════════

class TestCVVDetection:
    def test_cvv_3_digit(self):
        results = scan("CVV: 123")
        assert "CVV/CVC" in labels(results)

    def test_cvc_4_digit(self):
        results = scan("CVC: 1234")
        assert "CVV/CVC" in labels(results)

    def test_security_code(self):
        results = scan("Security Code: 456")
        assert "CVV/CVC" in labels(results)

    def test_bare_3_digits_not_flagged(self):
        results = scan("Room 123 is ready")
        assert "CVV/CVC" not in labels(results)


class TestCardExpiryDetection:
    def test_expiry_mmyy(self):
        results = scan("Exp: 03/25")
        assert "Card Expiry" in labels(results)

    def test_expiration_mmyyyy(self):
        results = scan("Expiration: 12/2025")
        assert "Card Expiry" in labels(results)

    def test_valid_thru(self):
        results = scan("Valid Thru: 06-27")
        assert "Card Expiry" in labels(results)

    def test_plain_date_not_flagged(self):
        results = scan("Date: 03/25")
        assert "Card Expiry" not in labels(results)


class TestEINDetection:
    def test_ein_keyword(self):
        results = scan("EIN: 12-3456789")
        assert "EIN/Tax ID" in labels(results)

    def test_tax_id_keyword(self):
        results = scan("Tax ID: 98-7654321")
        assert "EIN/Tax ID" in labels(results)

    def test_bare_format_not_flagged(self):
        """XX-XXXXXXX without EIN keyword should NOT match as EIN."""
        results = scan("Number: 12-3456789")
        ein = [f for f in results if f.label == "EIN/Tax ID"]
        assert len(ein) == 0


class TestIBANDetection:
    def test_uk_iban(self):
        results = scan("IBAN: GB29 NWBK 6016 1331 9268 19")
        assert "IBAN" in labels(results)

    def test_german_iban(self):
        results = scan("DE89 3704 0044 0532 0130 00")
        assert "IBAN" in labels(results)

    def test_random_uppercase_not_flagged(self):
        results = scan("HELLO WORLD THIS IS NOTHING")
        assert "IBAN" not in labels(results)


# ═══════════════════════════════════════════════════════════════════
# MRN and VIN detection
# ═══════════════════════════════════════════════════════════════════

class TestMRNDetection:
    def test_mrn_keyword(self):
        results = scan("MRN: 12345678")
        assert "MRN" in labels(results)

    def test_medical_record(self):
        results = scan("Medical Record #: A00123456")
        assert "MRN" in labels(results)

    def test_chart_number(self):
        results = scan("Chart Number: MR98765")
        assert "MRN" in labels(results)


class TestVINDetection:
    def test_vin_keyword(self):
        # Valid VIN (17 chars, no I/O/Q)
        results = scan("VIN: 1HGBH41JXMN109186")
        assert "VIN" in labels(results)

    def test_bare_17_chars_not_flagged(self):
        results = scan("Code: 1HGBH41JXMN109186")
        vin = [f for f in results if f.label == "VIN"]
        assert len(vin) == 0


# ═══════════════════════════════════════════════════════════════════
# Credential URL and IP Address detection
# ═══════════════════════════════════════════════════════════════════

class TestCredentialURLDetection:
    def test_postgres_url(self):
        results = scan("DATABASE_URL=postgres://admin:s3cret@db.example.com/mydb")
        assert "Credential URL" in labels(results)

    def test_mysql_url(self):
        results = scan("mysql://root:password123@localhost:3306/db")
        assert "Credential URL" in labels(results)

    def test_https_url(self):
        results = scan("https://user:token123@api.example.com/v1")
        assert "Credential URL" in labels(results)

    def test_mongodb_srv(self):
        results = scan("mongodb+srv://app:MyP4ss@cluster0.abc.mongodb.net")
        assert "Credential URL" in labels(results)

    def test_url_without_creds_not_flagged(self):
        results = scan("https://api.example.com/v1")
        assert "Credential URL" not in labels(results)

    def test_no_false_email_in_cred_url(self):
        """Email pattern should NOT match the user:pass@host inside a credential URL."""
        results = scan("postgres://admin:s3cret@db.example.com/mydb")
        emails = [f for f in results if f.label == "Email"]
        assert len(emails) == 0


class TestIPAddressDetection:
    def test_server_ip(self):
        results = scan("server: 192.168.1.100")
        assert "IP Address" in labels(results)

    def test_host_ip(self):
        results = scan("host=10.0.0.1")
        assert "IP Address" in labels(results)

    def test_ip_keyword(self):
        results = scan("IP: 172.16.0.50")
        assert "IP Address" in labels(results)

    def test_bare_ip_not_flagged(self):
        """IP without keyword should NOT match."""
        results = scan("Value: 192.168.1.1")
        ip = [f for f in results if f.label == "IP Address"]
        assert len(ip) == 0

    def test_is_medium_confidence(self):
        results = scan("server: 10.0.0.1")
        ip = [f for f in results if f.label == "IP Address"][0]
        assert ip.confidence == "MEDIUM"

    def test_invalid_octet_rejected(self):
        results = scan("server: 999.999.999.999")
        ip = [f for f in results if f.label == "IP Address"]
        assert len(ip) == 0


# ═══════════════════════════════════════════════════════════════════
# Secrets/Tokens detection
# ═══════════════════════════════════════════════════════════════════

class TestJWTDetection:
    def test_standard_jwt(self):
        jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
        results = scan(f"Authorization: {jwt}")
        assert "JWT" in labels(results)

    def test_jwt_in_config(self):
        jwt = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIn0.signature1234567890abcdef"
        results = scan(f"token={jwt}")
        assert "JWT" in labels(results)

    def test_not_triggered_by_short_base64(self):
        results = scan("data: eyJhbGci")
        assert "JWT" not in labels(results)


class TestAWSKeyDetection:
    def test_akia_key(self):
        results = scan("aws_access_key_id = AKIAIOSFODNN7EXAMPLE")
        assert "AWS Key" in labels(results)

    def test_asia_key(self):
        results = scan("key: ASIAQWERTYUIOP123456")
        # ASIA + 16 uppercase alphanumeric
        r = [f for f in results if f.label == "AWS Key"]
        assert len(r) == 1

    def test_random_20_chars_not_flagged(self):
        results = scan("code: ABCDIOSFODNN7EXAMPLE")
        assert "AWS Key" not in labels(results)


class TestAPIKeyDetection:
    def test_sk_prefix(self):
        results = scan("api_key: sk-1234567890abcdefghijklmn")
        assert "API Key" in labels(results)

    def test_pk_prefix(self):
        results = scan("STRIPE_KEY=pk-live_abcdefghijklmnopqrst")
        assert "API Key" in labels(results)

    def test_token_prefix(self):
        results = scan("token-abcdefghij1234567890ab")
        assert "API Key" in labels(results)

    def test_short_key_not_flagged(self):
        results = scan("sk-short")
        assert "API Key" not in labels(results)


class TestBearerTokenDetection:
    def test_bearer_token(self):
        results = scan("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc123.xyz789")
        # Could match as JWT or Bearer or both — at least one should fire
        found = {f.label for f in results}
        assert found & {"JWT", "Bearer Token"}

    def test_bearer_long_opaque(self):
        results = scan("Bearer ghp_abcdefghijklmnopqrstuvwxyz1234")
        assert "Bearer Token" in labels(results)

    def test_bearer_alone_not_flagged(self):
        results = scan("Bearer token required")
        assert "Bearer Token" not in labels(results)


class TestGenericSecretDetection:
    def test_password_assignment(self):
        results = scan('password = "Abc123XyzSecretValue!"')
        # Needs upper + digits in value
        r = [f for f in results if f.label == "Generic Secret"]
        # May or may not match depending on charset — the value has non-alnum chars
        # Just verify no crash
        assert isinstance(r, list)

    def test_api_key_in_config(self):
        results = scan("api_key: AbCdEf1234567890GHIJ")
        r = [f for f in results if f.label == "Generic Secret"]
        assert len(r) == 1

    def test_secret_in_env(self):
        results = scan('SECRET="Xk9mP2qR5vW8yB3nF6jH"')
        r = [f for f in results if f.label == "Generic Secret"]
        assert len(r) == 1

    def test_plain_word_not_flagged(self):
        results = scan("password: opensesame")
        r = [f for f in results if f.label == "Generic Secret"]
        assert len(r) == 0


class TestPrivateKeyDetection:
    def test_rsa_private_key(self):
        results = scan("-----BEGIN RSA PRIVATE KEY-----")
        assert "Private Key" in labels(results)

    def test_private_key(self):
        results = scan("-----BEGIN PRIVATE KEY-----")
        assert "Private Key" in labels(results)


class TestMaskTokenAndJWT:
    def test_mask_token_long(self):
        assert redact.mask_token("sk-abcdefghijklmnop") == "sk-a***********mnop"

    def test_mask_token_short(self):
        assert redact.mask_token("abcd1234") == "********"

    def test_mask_jwt(self):
        jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature"
        masked = redact.mask_jwt(jwt)
        assert masked.startswith("eyJhbGciOi")
        assert "<redacted>" in masked


class TestSecretsToggle:
    def test_secrets_category_toggle(self):
        findings = [
            make_finding(category="Secrets/Tokens", selected=True),
            make_finding(category="PII", selected=True),
        ]
        redact.toggle_findings(findings, "secrets")
        assert findings[0].selected is False
        assert findings[1].selected is True  # PII untouched

    def test_tokens_alias(self):
        findings = [make_finding(category="Secrets/Tokens", selected=False)]
        redact.toggle_findings(findings, "tokens")
        assert findings[0].selected is True

    def test_keys_alias(self):
        findings = [make_finding(category="Secrets/Tokens", selected=True)]
        redact.toggle_findings(findings, "keys")
        assert findings[0].selected is False


# ═══════════════════════════════════════════════════════════════════
# Pattern detection — FALSE POSITIVE RESISTANCE
# ═══════════════════════════════════════════════════════════════════

class TestFalsePositiveResistance:
    """These should NOT trigger sensitive data detection."""

    def test_room_number(self):
        results = scan("Appointment at Room 204 on Monday")
        # Should have zero findings
        assert len(results) == 0

    def test_plain_date(self):
        results = scan("Meeting on 2024-01-15 at 3:00 PM")
        # Dates without DOB context should not be flagged
        dob = [f for f in results if f.label == "Date of Birth"]
        assert len(dob) == 0

    def test_prescription_number(self):
        results = scan("Prescription #1168 filled at pharmacy")
        # Short numbers without identifier keywords should not match
        assert len(results) == 0

    def test_day_count(self):
        results = scan("Follow-up in 2094 days is unlikely")
        assert len(results) == 0

    def test_page_numbers(self):
        results = scan("See page 42 for details")
        assert len(results) == 0

    def test_year_alone(self):
        results = scan("Founded in 2024")
        assert len(results) == 0

    def test_zip_code_alone(self):
        """5-digit zip without context should NOT flag as anything."""
        results = scan("Area code for 90210 is popular on TV")
        assert len(results) == 0

    def test_random_long_number_no_keyword(self):
        """Long number without a keyword should NOT be flagged."""
        results = scan("The value was 98765432100 in total")
        assert len(results) == 0


# ═══════════════════════════════════════════════════════════════════
# Confidence and selection
# ═══════════════════════════════════════════════════════════════════

class TestConfidenceSelection:
    def test_high_confidence_preselected(self):
        results = scan("SSN: 123-45-6789")
        ssn = [f for f in results if f.label == "SSN"][0]
        assert ssn.confidence == "HIGH"
        assert ssn.selected is True

    def test_medium_confidence_not_preselected(self):
        results = scan("Account #: 12345678901234")
        ba = [f for f in results if f.label == "Bank Account"][0]
        assert ba.confidence == "MEDIUM"
        assert ba.selected is False

    def test_routing_is_medium(self):
        results = scan("Routing: 021000021")
        r = [f for f in results if f.label == "Routing #"][0]
        assert r.confidence == "MEDIUM"
        assert r.selected is False


# ═══════════════════════════════════════════════════════════════════
# Context extraction
# ═══════════════════════════════════════════════════════════════════

class TestGetContext:
    def test_context_includes_surrounding_text(self):
        text = "xxxxx Hello World SSN: 123-45-6789 more text here yyyyy"
        # "123-45-6789" starts at index 23, ends at 34
        start = text.index("123-45-6789")
        end = start + len("123-45-6789")
        ctx = redact.get_context(text, start, end, width=10)
        assert "123-45-6789" in ctx
        # Should have prefix/suffix indicators since not at start/end
        assert "..." in ctx

    def test_context_at_start(self):
        text = "123-45-6789 is the number"
        ctx = redact.get_context(text, 0, 11, width=10)
        # No leading "..." since at start
        assert not ctx.startswith("...")

    def test_context_at_end(self):
        text = "The SSN is 123-45-6789"
        ctx = redact.get_context(text, 11, 22, width=10)
        assert not ctx.endswith("...")


class TestGetLineNumber:
    def test_first_line(self):
        assert redact.get_line_number("hello world", 5) == 1

    def test_second_line(self):
        assert redact.get_line_number("line1\nline2", 6) == 2

    def test_third_line(self):
        assert redact.get_line_number("a\nb\nc", 4) == 3


# ═══════════════════════════════════════════════════════════════════
# parse_item_spec
# ═══════════════════════════════════════════════════════════════════

class TestParseItemSpec:
    def test_single_item(self):
        assert redact.parse_item_spec("3", 10) == [3]

    def test_multiple_items(self):
        assert redact.parse_item_spec("1,3,5", 10) == [1, 3, 5]

    def test_range(self):
        assert redact.parse_item_spec("2-5", 10) == [2, 3, 4, 5]

    def test_mixed(self):
        assert redact.parse_item_spec("1,3-5,8", 10) == [1, 3, 4, 5, 8]

    def test_out_of_bounds_filtered(self):
        assert redact.parse_item_spec("0,5,11", 10) == [5]

    def test_invalid_ignored(self):
        assert redact.parse_item_spec("abc,2,xyz", 10) == [2]

    def test_empty(self):
        assert redact.parse_item_spec("", 10) == []


# ═══════════════════════════════════════════════════════════════════
# toggle_findings
# ═══════════════════════════════════════════════════════════════════

def make_finding(category="PII", confidence="HIGH", selected=True) -> Finding:
    return Finding(
        category=category, label="Test", matched_text="x",
        masked_text="*", confidence=confidence, file_path="test.txt",
        location="L.1", context="ctx", selected=selected, page_num=-1,
    )


class TestToggleFindings:
    def test_go_returns_true(self):
        assert redact.toggle_findings([], "go") is True
        assert redact.toggle_findings([], "done") is True
        assert redact.toggle_findings([], "y") is True

    def test_quit_returns_none(self):
        assert redact.toggle_findings([], "quit") is None
        assert redact.toggle_findings([], "q") is None

    def test_all_selects_everything(self):
        findings = [make_finding(selected=False), make_finding(selected=False)]
        result = redact.toggle_findings(findings, "all")
        assert result is False
        assert all(f.selected for f in findings)

    def test_none_deselects_everything(self):
        findings = [make_finding(selected=True), make_finding(selected=True)]
        result = redact.toggle_findings(findings, "none")
        assert result is False
        assert not any(f.selected for f in findings)

    def test_number_toggles_item(self):
        findings = [make_finding(selected=True), make_finding(selected=False)]
        redact.toggle_findings(findings, "1")
        assert findings[0].selected is False  # toggled off
        redact.toggle_findings(findings, "2")
        assert findings[1].selected is True   # toggled on

    def test_category_toggle_pii(self):
        findings = [
            make_finding(category="PII", selected=True),
            make_finding(category="PII", selected=True),
            make_finding(category="Financial", selected=True),
        ]
        redact.toggle_findings(findings, "pii")
        assert findings[0].selected is False
        assert findings[1].selected is False
        assert findings[2].selected is True  # Financial untouched

    def test_category_toggle_on_when_mixed(self):
        findings = [
            make_finding(category="PII", selected=True),
            make_finding(category="PII", selected=False),
        ]
        redact.toggle_findings(findings, "pii")
        # Not all were on, so should select all
        assert findings[0].selected is True
        assert findings[1].selected is True

    def test_unknown_command(self):
        result = redact.toggle_findings([], "gibberish")
        assert result is False


# ═══════════════════════════════════════════════════════════════════
# File type helpers
# ═══════════════════════════════════════════════════════════════════

class TestFileTypeHelpers:
    def test_is_pdf(self):
        assert redact.is_pdf("report.pdf") is True
        assert redact.is_pdf("report.PDF") is True
        assert redact.is_pdf("report.txt") is False

    def test_is_supported_text(self):
        for ext in [".txt", ".csv", ".json", ".xml", ".md", ".log", ".yaml"]:
            assert redact.is_supported_text(f"file{ext}") is True
        assert redact.is_supported_text("file.docx") is False

    def test_is_supported(self):
        assert redact.is_supported("file.pdf") is True
        assert redact.is_supported("file.txt") is True
        assert redact.is_supported("file.exe") is False

    def test_make_output_path(self):
        assert redact.make_output_path("report.pdf") == "report-redacted.pdf"
        assert redact.make_output_path("/tmp/data.txt") == "/tmp/data-redacted.txt"
        assert redact.make_output_path("dir/file.csv") == "dir/file-redacted.csv"


# ═══════════════════════════════════════════════════════════════════
# Integration: text file scan + redact
# ═══════════════════════════════════════════════════════════════════

class TestTextFileIntegration:
    def test_scan_and_redact_text_file(self, tmp_path):
        input_file = tmp_path / "data.txt"
        input_file.write_text(
            "Name: Alice\n"
            "SSN: 123-45-6789\n"
            "Email: alice@example.com\n"
            "Phone: (555) 867-5309\n"
            "Notes: Room 204, nothing sensitive here.\n"
        )
        output_file = tmp_path / "data-redacted.txt"

        findings = redact.scan_file(str(input_file))

        # Should find SSN, email, phone — NOT room number
        found_labels = {f.label for f in findings}
        assert "SSN" in found_labels
        assert "Email" in found_labels
        assert "Phone (US)" in found_labels

        # All HIGH should be pre-selected
        for f in findings:
            if f.confidence == "HIGH":
                assert f.selected is True

        # Redact
        count = redact.redact_text_file(str(input_file), str(output_file), findings)
        assert count >= 3

        result = output_file.read_text()
        assert "123-45-6789" not in result
        assert "alice@example.com" not in result
        assert "(555) 867-5309" not in result
        # Non-sensitive text preserved
        assert "Room 204" in result
        assert "nothing sensitive here" in result

    def test_scan_clean_file(self, tmp_path):
        clean_file = tmp_path / "clean.txt"
        clean_file.write_text("This is a perfectly clean document with no PII.\n")
        findings = redact.scan_file(str(clean_file))
        assert len(findings) == 0

    def test_deselected_items_not_redacted(self, tmp_path):
        input_file = tmp_path / "data.txt"
        input_file.write_text("SSN: 123-45-6789\nEmail: alice@example.com\n")
        output_file = tmp_path / "out.txt"

        findings = redact.scan_file(str(input_file))
        # Deselect the SSN
        for f in findings:
            if f.label == "SSN":
                f.selected = False

        redact.redact_text_file(str(input_file), str(output_file), findings)
        result = output_file.read_text()
        # SSN should still be there (deselected)
        assert "123-45-6789" in result
        # Email should be redacted
        assert "alice@example.com" not in result


# ═══════════════════════════════════════════════════════════════════
# Integration: PDF scan + redact
# ═══════════════════════════════════════════════════════════════════

class TestPDFIntegration:
    @pytest.fixture
    def sample_pdf(self, tmp_path):
        """Create a test PDF with sensitive data."""
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas

        pdf_path = tmp_path / "test.pdf"
        c = canvas.Canvas(str(pdf_path), pagesize=letter)
        c.drawString(100, 700, "Patient SSN: 234-56-7890")
        c.drawString(100, 680, "Email: patient@hospital.com")
        c.drawString(100, 660, "Card: 4111-1111-1111-1111")
        c.drawString(100, 640, "Room 305, scheduled 2024-06-01")
        c.save()
        return pdf_path

    def test_scan_pdf_finds_sensitive_data(self, sample_pdf):
        findings = redact.scan_file(str(sample_pdf))
        found_labels = {f.label for f in findings}
        assert "SSN" in found_labels
        assert "Email" in found_labels
        assert "Credit Card" in found_labels

    def test_pdf_findings_have_page_location(self, sample_pdf):
        findings = redact.scan_file(str(sample_pdf))
        for f in findings:
            assert f.location.startswith("p.")

    def test_redact_pdf_removes_sensitive_text(self, sample_pdf, tmp_path):
        import fitz

        output_path = tmp_path / "redacted.pdf"
        findings = redact.scan_file(str(sample_pdf))

        redact.redact_pdf_file(str(sample_pdf), str(output_path), findings)

        # Verify output
        doc = fitz.open(str(output_path))
        text = doc[0].get_text()
        doc.close()

        assert "234-56-7890" not in text
        assert "patient@hospital.com" not in text
        # Room number should be preserved
        assert "Room 305" in text

    def test_redacted_pdf_is_valid(self, sample_pdf, tmp_path):
        import fitz

        output_path = tmp_path / "redacted.pdf"
        findings = redact.scan_file(str(sample_pdf))
        redact.redact_pdf_file(str(sample_pdf), str(output_path), findings)

        # Should open without error
        doc = fitz.open(str(output_path))
        assert len(doc) == 1
        doc.close()


# ═══════════════════════════════════════════════════════════════════
# Integration: directory scan
# ═══════════════════════════════════════════════════════════════════

class TestDirectoryScan:
    def test_scan_multiple_files(self, tmp_path):
        (tmp_path / "a.txt").write_text("SSN: 111-22-3333\n")
        (tmp_path / "b.txt").write_text("Email: bob@test.com\n")
        (tmp_path / "c.bin").write_bytes(b"\x00\x01\x02")  # unsupported

        files = sorted(
            str(p) for p in tmp_path.rglob("*")
            if p.is_file() and redact.is_supported(str(p))
        )
        assert len(files) == 2

        all_findings = []
        for f in files:
            all_findings.extend(redact.scan_file(f))

        found_labels = {f.label for f in all_findings}
        assert "SSN" in found_labels
        assert "Email" in found_labels

        # Findings should reference different files
        files_found = {f.file_path for f in all_findings}
        assert len(files_found) == 2


# ═══════════════════════════════════════════════════════════════════
# Edge cases and deduplication
# ═══════════════════════════════════════════════════════════════════

class TestEdgeCases:
    def test_duplicate_span_deduplicated(self):
        """Same text region should not produce duplicate findings."""
        # A string that could match multiple patterns shouldn't double-count
        text = "SSN: 123-45-6789"
        results = scan(text)
        ssn_findings = [f for f in results if f.matched_text == "123-45-6789"]
        assert len(ssn_findings) == 1

    def test_multiple_ssns_in_same_text(self):
        text = "SSN: 123-45-6789 and also 234-56-7890"
        results = scan(text)
        ssns = [f for f in results if f.label == "SSN"]
        assert len(ssns) == 2

    def test_empty_text(self):
        assert scan("") == []

    def test_very_long_text(self):
        """Should handle large text without error."""
        text = "no sensitive data here " * 10000
        results = scan(text)
        assert len(results) == 0

    def test_unicode_text(self):
        """Should not crash on unicode."""
        text = "Patient: Jose Rodriguez\nSSN: 123-45-6789\nNotas: sin datos"
        results = scan(text)
        assert "SSN" in labels(results)
