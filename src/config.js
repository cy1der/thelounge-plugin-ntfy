"use strict";

const fs = require("fs");
const path = require("path");
const Ajv2019 = require("ajv/dist/2019").default;
const addFormats = require("ajv-formats");
const addErrors = require("ajv-errors");
const {
  initEncryptionKey,
  encrypt,
  decrypt,
  isEncrypted,
} = require("./crypto.js");

const DEFAULT_CONFIG = {
  ntfy: {
    server: "https://ntfy.sh",
    topic: null, // Intentionally left null to force user configuration
    username: null,
    password: null,
    token: null,
    priority: 3,
  },
  config: {
    notify_on_private_messages: {}, // Per-network: { "network-uuid": true/false }
  },
};

const GLOBAL_KEYS = new Set([
  "ntfy.server",
  "ntfy.topic",
  "ntfy.username",
  "ntfy.password",
  "ntfy.token",
  "ntfy.priority",
]);
const GLOBAL_BOOLEAN_KEYS = new Set([]);
const GLOBAL_NUMERIC_KEYS = new Set(["ntfy.priority"]);

const PER_NETWORK_KEYS = new Set(["config.notify_on_private_messages"]);
const PER_NETWORK_BOOLEAN_KEYS = new Set(["config.notify_on_private_messages"]);

const SENSITIVE_KEYS = new Set(["ntfy.password", "ntfy.token"]);

const userConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ntfy", "config"],
  properties: {
    ntfy: {
      type: "object",
      additionalProperties: false,
      required: ["server", "topic"],
      properties: {
        server: {
          type: "string",
          format: "uri",
          errorMessage: "Invalid server URL",
        },
        topic: {
          type: "string",
          minLength: 1,
          errorMessage: "Topic cannot be empty",
        },
        username: { type: "string", nullable: true },
        password: { type: "string", nullable: true },
        token: {
          type: "string",
          format: "ntfy-token",
          nullable: true,
          errorMessage: "Invalid ntfy token, must start with 'tk_'",
        },
        priority: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          default: 3,
          errorMessage: "Priority must be an integer between 1 and 5",
        },
      },
      allOf: [
        {
          if: {
            properties: { username: { type: "string" } },
            required: ["username"],
          },
          then: {
            properties: { password: { type: "string" } },
            required: ["password"],
            errorMessage: {
              properties: {
                password: "Password is required when username is set",
              },
            },
          },
        },
        {
          if: {
            properties: { password: { type: "string" } },
            required: ["password"],
          },
          then: {
            properties: { username: { type: "string" } },
            required: ["username"],
            errorMessage: {
              properties: {
                username: "Username is required when password is set",
              },
            },
          },
        },
      ],
      dependentRequired: {
        username: ["password"],
        password: ["username"],
      },
    },
    config: {
      type: "object",
      additionalProperties: false,
      required: ["notify_on_private_messages"],
      properties: {
        notify_on_private_messages: {
          type: "object",
          additionalProperties: { type: "boolean" },
          default: {},
        },
      },
    },
  },
};

const ajv = new Ajv2019({ allErrors: true });
addFormats(ajv);
addErrors(ajv);
ajv.addFormat("ntfy-token", {
  validate: (data) => typeof data === "string" && data.startsWith("tk_"),
});

let rootDir = null;

function setRootDir(dir) {
  rootDir = dir;
  initEncryptionKey(dir);
}

function decryptSensitiveFields(config) {
  const decrypted = JSON.parse(JSON.stringify(config)); // Deep clone

  for (const key of SENSITIVE_KEYS) {
    const keys = key.split(".");
    let curr = decrypted;

    for (let i = 0; i < keys.length - 1; i++) {
      if (curr[keys[i]]) {
        curr = curr[keys[i]];
      } else {
        curr = null;
        break;
      }
    }

    if (curr) {
      const finalKey = keys[keys.length - 1];
      if (curr[finalKey] && isEncrypted(curr[finalKey])) {
        try {
          curr[finalKey] = decrypt(curr[finalKey]);
        } catch (e) {
          // Leave as-is
        }
      }
    }
  }

  return decrypted;
}

function loadUserConfig(username) {
  if (!rootDir) {
    throw new Error("Root directory is not set");
  }

  const userConfigPath = path.join(rootDir, "config", `${username}.json`);

  if (!fs.existsSync(userConfigPath)) {
    const validate = ajv.compile(userConfigSchema);
    const valid = validate(DEFAULT_CONFIG);

    return [DEFAULT_CONFIG, valid ? [] : validate.errors];
  } else {
    let userConfig;

    try {
      userConfig = JSON.parse(fs.readFileSync(userConfigPath, "utf-8"));
    } catch (e) {
      throw new Error(
        `Invalid JSON in user config for ${username}: ${e.message}`,
      );
    }

    userConfig = decryptSensitiveFields(userConfig);

    const validate = ajv.compile(userConfigSchema);
    const valid = validate(userConfig);

    return [userConfig, valid ? [] : validate.errors];
  }
}

function encryptSensitiveFields(config) {
  const encrypted = JSON.parse(JSON.stringify(config)); // Deep clone

  for (const key of SENSITIVE_KEYS) {
    const keys = key.split(".");
    let curr = encrypted;

    for (let i = 0; i < keys.length - 1; i++) {
      if (curr[keys[i]]) {
        curr = curr[keys[i]];
      } else {
        curr = null;
        break;
      }
    }

    if (curr) {
      const finalKey = keys[keys.length - 1];
      if (curr[finalKey] && !isEncrypted(curr[finalKey])) {
        curr[finalKey] = encrypt(curr[finalKey]);
      }
    }
  }

  return encrypted;
}

function saveUserSetting(username, settingKey, settingValue) {
  if (!rootDir) {
    throw new Error("Root directory is not set");
  }

  if (GLOBAL_KEYS.has(settingKey)) {
    let userConfig = loadUserConfig(username)[0];

    const keys = settingKey.split(".");

    let curr = userConfig;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (key in curr) {
        curr = curr[key];
      }
    }

    if (settingValue && typeof settingValue !== "string") {
      return `Error: expected value to be a string`;
    }

    if (GLOBAL_BOOLEAN_KEYS.has(settingKey)) {
      try {
        settingValue = settingValue
          ? JSON.parse(settingValue.toLowerCase())
          : false;

        if (typeof settingValue !== "boolean") {
          return `Invalid value for ${settingKey}, expected a boolean`;
        }
      } catch {
        return `Invalid value for ${settingKey}, expected a boolean`;
      }
    }

    if (GLOBAL_NUMERIC_KEYS.has(settingKey)) {
      try {
        settingValue = settingValue ? Number(settingValue) : NaN;

        if (isNaN(settingValue) || typeof settingValue !== "number") {
          return `Invalid value for ${settingKey}, expected a number`;
        }
      } catch {
        return `Invalid value for ${settingKey}, expected a number`;
      }
    }

    curr[keys[keys.length - 1]] = settingValue;

    const configToSave = encryptSensitiveFields(userConfig);

    const userConfigPath = path.join(rootDir, "config", `${username}.json`);

    fs.mkdirSync(path.dirname(userConfigPath), { recursive: true });
    fs.writeFileSync(
      userConfigPath,
      JSON.stringify(configToSave, null, 2),
      "utf-8",
    );

    return "Success";
  }

  return `Invalid setting ${settingKey}, allowed settings are: ${Array.from(
    GLOBAL_KEYS,
  ).join(", ")}`;
}

function saveNetworkSetting(username, settingKey, networkUuid, settingValue) {
  if (!rootDir) {
    throw new Error("Root directory is not set");
  }

  if (!PER_NETWORK_KEYS.has(settingKey)) {
    return `Invalid per-network setting ${settingKey}, allowed settings are: ${Array.from(
      PER_NETWORK_KEYS,
    ).join(", ")}`;
  }

  let userConfig = loadUserConfig(username)[0];

  const keys = settingKey.split(".");

  let curr = userConfig;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (key in curr) {
      curr = curr[key];
    }
  }

  const finalKey = keys[keys.length - 1];

  if (!curr[finalKey] || typeof curr[finalKey] !== "object") {
    curr[finalKey] = {};
  }

  if (settingValue === null) {
    delete curr[finalKey][networkUuid];
  } else if (PER_NETWORK_BOOLEAN_KEYS.has(settingKey)) {
    try {
      const boolValue = JSON.parse(settingValue.toLowerCase());

      if (typeof boolValue !== "boolean") {
        return `Invalid value for ${settingKey}, expected a boolean`;
      }

      curr[finalKey][networkUuid] = boolValue;
    } catch {
      return `Invalid value for ${settingKey}, expected a boolean (true/false)`;
    }
  } else {
    curr[finalKey][networkUuid] = settingValue;
  }

  const configToSave = encryptSensitiveFields(userConfig);

  const userConfigPath = path.join(rootDir, "config", `${username}.json`);

  fs.mkdirSync(path.dirname(userConfigPath), { recursive: true });
  fs.writeFileSync(
    userConfigPath,
    JSON.stringify(configToSave, null, 2),
    "utf-8",
  );

  return "Success";
}

function getNetworkSetting(
  userConfig,
  settingKey,
  networkUuid,
  defaultValue = false,
) {
  const keys = settingKey.split(".");

  let curr = userConfig;

  for (const key of keys) {
    if (curr && typeof curr === "object" && key in curr) {
      curr = curr[key];
    } else {
      return defaultValue;
    }
  }

  if (curr && typeof curr === "object" && networkUuid in curr) {
    return curr[networkUuid];
  }

  return defaultValue;
}

module.exports = {
  setRootDir,
  loadUserConfig,
  saveUserSetting,
  saveNetworkSetting,
  getNetworkSetting,
  PER_NETWORK_KEYS,
  PER_NETWORK_BOOLEAN_KEYS,
};
