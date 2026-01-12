import os
import logging
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

class SecurityService:
    def __init__(self):
        key = os.environ.get("ENCRYPTION_KEY")
        if not key:
            # In production, failing is safer than losing data on restart
            # For local dev without env, we can still warn, but let's be strict as requested by review
            error_msg = "CRITICAL: ENCRYPTION_KEY not found. App cannot start securely."
            logger.critical(error_msg)
            # We raise an error to prevent startup in production if key is missing
            # Only allow bypass if explicitly setting a flag like ALLOW_INSECURE_DEV
            if not os.environ.get("ALLOW_INSECURE_DEV"):
                raise ValueError(error_msg)
            
            logger.warning("⚠️ Using temporary key (Data loss on restart). Set ALLOW_INSECURE_DEV only locally.")
            key = Fernet.generate_key().decode()
        
        try:
            self.cipher = Fernet(key.encode())
        except Exception as e:
            logger.error(f"Invalid ENCRYPTION_KEY format: {e}")
            raise

    def encrypt_data(self, plaintext: str) -> str:
        """Encrypts a string and returns a base64 encoded string."""
        if not plaintext: return ""
        return self.cipher.encrypt(plaintext.encode()).decode()

    def decrypt_data(self, ciphertext: str) -> str | None:
        """Decrypts a string. Returns None if decryption fails."""
        if not ciphertext: return None
        try:
            return self.cipher.decrypt(ciphertext.encode()).decode()
        except InvalidToken:
            logger.warning("Decryption failed: Invalid token. Key might have changed.")
            return None
        except Exception as e:
            logger.error(f"Unexpected decryption error: {e}")
            return None

# Singleton instance
security_service = SecurityService()