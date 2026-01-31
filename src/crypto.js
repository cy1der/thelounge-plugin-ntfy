"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const ENCRYPTED_PREFIX = "enc:";

let encryptionKey = null;

function initEncryptionKey(configDir) {
  const keyPath = path.join(configDir, ".ntfy_key");

  if (fs.existsSync(keyPath)) {
    const keyData = fs.readFileSync(keyPath, "utf-8").trim();
    encryptionKey = Buffer.from(keyData, "hex");

    if (encryptionKey.length !== KEY_LENGTH) {
      throw new Error("Invalid encryption key length");
    }
  } else {
    encryptionKey = crypto.randomBytes(KEY_LENGTH);
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(keyPath, encryptionKey.toString("hex"), {
      encoding: "utf-8",
      mode: 0o600, // R/W for owner only
    });
  }
}

function isInitialized() {
  return encryptionKey !== null;
}

function encrypt(plaintext) {
  if (!encryptionKey) {
    throw new Error("Encryption key not initialized");
  }

  if (!plaintext || typeof plaintext !== "string") {
    return plaintext;
  }

  if (plaintext.startsWith(ENCRYPTED_PREFIX)) {
    return plaintext;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

function decrypt(encryptedText) {
  if (!encryptionKey) {
    throw new Error("Encryption key not initialized");
  }

  if (!encryptedText || typeof encryptedText !== "string") {
    return encryptedText;
  }

  if (!encryptedText.startsWith(ENCRYPTED_PREFIX)) {
    return encryptedText;
  }

  const data = encryptedText.slice(ENCRYPTED_PREFIX.length);
  const parts = data.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

module.exports = {
  initEncryptionKey,
  isInitialized,
  encrypt,
  decrypt,
  isEncrypted,
  ENCRYPTED_PREFIX,
};
