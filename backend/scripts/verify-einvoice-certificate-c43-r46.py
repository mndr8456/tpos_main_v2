"""R4.6 isolated signer certificate policy gate. Reads JSON on stdin; outputs only codes.
Requires cryptography installed into .venv-ubl. CA issuer PEM must be operator-pinned.
No private key supplied here, no network, no sensitive diagnostics.
"""
import sys,json,hashlib,re,datetime

def out(ready,code):
 print(json.dumps({'ready':ready,'code':code},separators=(',',':')))
try:
 from cryptography import x509
 from cryptography.hazmat.primitives import serialization
 from cryptography.x509.oid import ObjectIdentifier,ExtensionOID
 inp=json.load(sys.stdin)
 cert=x509.load_pem_x509_certificate(inp['certificate'].encode())
 ca=x509.load_pem_x509_certificate(inp['issuerCA'].encode())
 expected_pin=inp.get('issuerCaSha256','').replace(':','').lower()
 if not re.fullmatch('[a-f0-9]{64}',expected_pin) or hashlib.sha256(ca.public_bytes(serialization.Encoding.DER)).hexdigest()!=expected_pin:
  out(False,'R46_CA_PIN_MISMATCH');sys.exit(0)
 now=datetime.datetime.now(datetime.timezone.utc)
 if now<cert.not_valid_before_utc or now>cert.not_valid_after_utc:
  out(False,'R46_CERT_NOT_VALID_NOW');sys.exit(0)
 if not ca.extensions.get_extension_for_oid(ExtensionOID.BASIC_CONSTRAINTS).value.ca:
  out(False,'R46_ISSUER_NOT_CA');sys.exit(0)
 cert.verify_directly_issued_by(ca)
 ku=cert.extensions.get_extension_for_oid(ExtensionOID.KEY_USAGE).value
 eku=cert.extensions.get_extension_for_oid(ExtensionOID.EXTENDED_KEY_USAGE).value
 if not ku.content_commitment or ObjectIdentifier('1.3.6.1.4.1.311.10.3.12') not in eku:
  out(False,'R46_CERT_USAGE_NOT_ALLOWED');sys.exit(0)
 def at(oid):
  v=cert.subject.get_attributes_for_oid(ObjectIdentifier(oid))
  return v[0].value if len(v)==1 else ''
 def norm(v):return re.sub('[^0-9A-Z]','',str(v).upper())
 if norm(at('2.5.4.97'))!=norm(inp.get('tin')) or norm(at('2.5.4.5'))!=norm(inp.get('registration')) or not at('2.5.4.97') or not at('2.5.4.5'):
  out(False,'R46_CERT_TIN_BRN_MISMATCH');sys.exit(0)
 if norm(at('2.5.4.6'))!='MY':
  out(False,'R46_CERT_COUNTRY_NOT_MY');sys.exit(0)
 out(True,'R46_SIGNER_CERTIFICATE_PROFILE_PASSED')
except ImportError:
 out(False,'R46_CRYPTOGRAPHY_NOT_INSTALLED')
except Exception:
 out(False,'R46_SIGNER_CERTIFICATE_UNVERIFIED')
