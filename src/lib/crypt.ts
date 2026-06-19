import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// Requer variável DATABASE_ENCRYPTION_KEY com chave hexadecimal de 32 bytes (64 caracteres)
const ENCRYPTION_KEY = process.env.DATABASE_ENCRYPTION_KEY
  ? Buffer.from(process.env.DATABASE_ENCRYPTION_KEY, 'hex')
  : null;

/**
 * Criptografa uma string usando AES-256-GCM
 * Retorna o resultado no formato: iv(hex):authTag(hex):ciphertext(hex)
 */
export function encryptField(text: string | null | undefined): string | null {
  if (!text) return null;
  if (!ENCRYPTION_KEY) {
    if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
      console.warn('[crypt] ⚠️ DATABASE_ENCRYPTION_KEY não configurada no .env. Ignorando criptografia.');
    }
    return text;
  }

  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('[crypt] Erro ao criptografar campo:', err);
    return text;
  }
}

/**
 * Descriptografa uma string criptografada pelo utilitário acima
 * Espera o formato: iv(hex):authTag(hex):ciphertext(hex)
 */
export function decryptField(encryptedText: string | null | undefined): string | null {
  if (!encryptedText) return null;
  if (!encryptedText.includes(':')) return encryptedText; // Retorna texto original caso não esteja criptografado
  if (!ENCRYPTION_KEY) {
    if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
      console.warn('[crypt] ⚠️ DATABASE_ENCRYPTION_KEY não configurada no .env. Ignorando descriptografia.');
    }
    return encryptedText;
  }

  try {
    const [ivHex, tagHex, encrypted] = encryptedText.split(':');
    if (!ivHex || !tagHex || !encrypted) return encryptedText;

    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    
    const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    console.error('[crypt] Falha ao descriptografar dado:', err);
    return '[DADO INACESSÍVEL - ERRO DE CHAVE]';
  }
}
