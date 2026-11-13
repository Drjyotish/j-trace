# Security policy

J TRACE handles identifiers that can be misused to harm people. Reports are taken seriously.

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** on this repository (Security → Report a vulnerability). Do not open a public issue for anything that could expose personal data or enable tracking of a person or device.

Include what you found, how to reproduce it, and what an attacker could gain. You will get an acknowledgement, and credit in the fix if you want it.

## In scope — highest priority

- Any way to learn whether an IMEI, phone number or case exists without authorisation.
- Any way for an owner-side user to obtain location, operator, SIM or identity data.
- Any bypass of role, jurisdiction or legal-basis checks on the staff side.
- Any way to reach ownership level 2 using only self-declared evidence.
- Any way to alter or remove audit entries without detection.

## Out of scope

- The demo deployment's public demo accounts and demo secret: they are intentionally public and hold only fictional data.
- Missing hardening that is already listed under "Known gaps" in `docs/05-security-privacy.md`.

## Ground rules

Test only against your own local instance. Never test with another person's real IMEI, phone number or identity.
