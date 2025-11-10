import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;
  private readonly ivLength = 16;
  private readonly authTagLength = 16;

  constructor(private readonly configService: ConfigService) {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey || encryptionKey.length !== 64) {
      this.logger.error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
      throw new InternalServerErrorException('Encryption key is not configured correctly.');
    }
    this.key = Buffer.from(encryptionKey, 'hex');
  }

  encrypt(text: string): string {
    if (!text) {
      return text;
    }

    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();

      return Buffer.concat([iv, authTag, encrypted]).toString('hex');
    } catch (error) {
      this.logger.error('Encryption failed', error.stack);
      throw new InternalServerErrorException('Could not encrypt data.');
    }
  }

  decrypt(encryptedText: string): string {
    if (!encryptedText) {
      return encryptedText;
    }

    try {
      const data = Buffer.from(encryptedText, 'hex');
      const iv = data.slice(0, this.ivLength);
      const authTag = data.slice(this.ivLength, this.ivLength + this.authTagLength);
      const encrypted = data.slice(this.ivLength + this.authTagLength);

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString('utf8');
    } catch (error) {
      this.logger.error('Decryption failed', error.stack);
      // It's safer to return null or an empty string if decryption fails
      // to avoid exposing partially decrypted or incorrect data.
      return null;
    }
  }
}
