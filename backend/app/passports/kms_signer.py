import os
import base64
import hashlib
from typing import Optional, Tuple, Dict, Any

class KMSSigner:
    """
    AWS KMS Asymmetric Digital Signer & Verifier.
    Supports RSASSA_PSS_SHA_256 with 4096-bit RSA keys.
    Falls back to explicitly identified DEMO_SIMULATED_KMS_SIGNATURE when credentials are not configured.
    """

    DEFAULT_KEY_ARN = "arn:aws:kms:eu-central-1:123456789012:key/w2v-passport-signer-rsa-4096"
    ALGORITHM = "RSASSA_PSS_SHA_256"

    def __init__(self, key_arn: Optional[str] = None, region_name: Optional[str] = None):
        self.key_arn = key_arn or os.getenv("KMS_KEY_ARN", self.DEFAULT_KEY_ARN)
        self.region_name = region_name or os.getenv("AWS_REGION", "eu-central-1")
        self._kms_client = None
        self._init_kms()

    def _init_kms(self):
        try:
            import boto3
            if os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("AWS_PROFILE") or os.getenv("AWS_ROLE_ARN"):
                self._kms_client = boto3.client("kms", region_name=self.region_name)
        except Exception:
            self._kms_client = None

    @property
    def is_live_kms_active(self) -> bool:
        return self._kms_client is not None

    def sign_digest(self, sha256_hex_digest: str) -> Tuple[str, str, str]:
        """
        Signs a SHA-256 digest using RSASSA_PSS_SHA_256.
        Returns (signature_base64, signature_status, algorithm).
        """
        if self._kms_client:
            try:
                digest_bytes = bytes.fromhex(sha256_hex_digest)
                response = self._kms_client.sign(
                    KeyId=self.key_arn,
                    Message=digest_bytes,
                    MessageType="DIGEST",
                    SigningAlgorithm=self.ALGORITHM,
                )
                sig_bytes = response["Signature"]
                sig_b64 = base64.b64encode(sig_bytes).decode("utf-8")
                return sig_b64, "VALID_AWS_KMS_SIGNATURE", self.ALGORITHM
            except Exception as e:
                # Do not silently falsify: log or raise if live mode was requested
                raise RuntimeError(f"Live AWS KMS signing failed: {str(e)}")

        # Deterministic simulated signing for local development & demonstrations
        sig_seed = f"AWS-KMS-RSASSA_PSS_SHA_256:{self.key_arn}:{sha256_hex_digest}".encode("utf-8")
        pseudo_sig = hashlib.sha512(sig_seed).digest() + hashlib.sha384(sig_seed).digest()
        simulated_sig_b64 = base64.b64encode(pseudo_sig[:256]).decode("utf-8")
        return simulated_sig_b64, "DEMO_SIMULATED_KMS_SIGNATURE", self.ALGORITHM

    def verify_signature(
        self,
        sha256_hex_digest: str,
        signature_base64: str,
        key_arn: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Verifies asymmetric signature against the SHA-256 digest.
        """
        target_key = key_arn or self.key_arn
        if self._kms_client:
            try:
                digest_bytes = bytes.fromhex(sha256_hex_digest)
                sig_bytes = base64.b64decode(signature_base64)
                response = self._kms_client.verify(
                    KeyId=target_key,
                    Message=digest_bytes,
                    MessageType="DIGEST",
                    Signature=sig_bytes,
                    SigningAlgorithm=self.ALGORITHM,
                )
                valid = bool(response.get("SignatureValid", False))
                return {
                    "valid": valid,
                    "provider": "AWS_KMS_LIVE",
                    "key_arn": target_key,
                    "algorithm": self.ALGORITHM,
                }
            except Exception as e:
                return {
                    "valid": False,
                    "provider": "AWS_KMS_LIVE",
                    "error": str(e),
                }

        # Verify against simulated provider
        expected_sig, _, _ = self.sign_digest(sha256_hex_digest)
        is_valid = (expected_sig == signature_base64)
        return {
            "valid": is_valid,
            "provider": "DEMO_SIMULATED_KMS",
            "key_arn": target_key,
            "algorithm": self.ALGORITHM,
        }
