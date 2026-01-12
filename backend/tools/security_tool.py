import os
import base64
import logging
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

class SecurityService:
    def __init__(self):
        # Try to get key from env, otherwise generate a temporary one (dev only warning)
        key = os.environ.get("ENCRYPTION_KEY")
        if not key:
            logger.warning("⚠️ ENCRYPTION_KEY not found in env. Using temporary key. API Keys will be lost on restart!")
            key = Fernet.generate_key().decode()
        
        try:
            self.cipher = Fernet(key.encode() if isinstance(key, str) else key)
        except Exception as e:
            logger.error(f"Invalid ENCRYPTION_KEY: {e}")
            raise

    def encrypt_data(self, plaintext: str) -> str:
        """Encrypts a string and returns a base64 encoded string."""
        if not plaintext: return ""
        return self.cipher.encrypt(plaintext.encode()).decode()

    def decrypt_data(self, ciphertext: str) -> str | None:
        """Decrypts a string. Returns None if decryption fails (invalid key/data)."""
        if not ciphertext: return None
        try:
            return self.cipher.decrypt(ciphertext.encode()).decode()
        except Exception:
            logger.warning("Decryption failed. Data might be corrupted or key changed.")
            return None

# Singleton instance
security_service = SecurityService()
