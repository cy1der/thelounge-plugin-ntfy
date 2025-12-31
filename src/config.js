"use strict";

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv").default;
const addFormats = require("ajv-formats");
const addErrors = require("ajv-errors");

const DEFAULT_CONFIG = {
  ntfy: {
    server: "https://ntfy.sh",
    topic: null, // Intentionally left null to force user configuration
    username: null,
    password: null,
  },
};

const ALLOWED_KEYS = new Set([
  "ntfy.server",
  "ntfy.topic",
  "ntfy.username",
  "ntfy.password",
]);

const userConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ntfy"],
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
      },
      errorMessage: "Missing or invalid ntfy configuration",
    },
  },
  errorMessage: "Missing or invalid configuration",
};

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
addErrors(ajv);

let rootDir = null;

function setRootDir(dir) {
  rootDir = dir;
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
        `Invalid JSON in user config for ${username}: ${e.message}`
      );
    }

    const validate = ajv.compile(userConfigSchema);
    const valid = validate(userConfig);

    return [userConfig, valid ? [] : validate.errors];
  }
}

function saveUserSetting(username, settingKey, settingValue) {
  if (!rootDir) {
    throw new Error("Root directory is not set");
  }

  if (ALLOWED_KEYS.has(settingKey)) {
    let userConfig = loadUserConfig(username)[0];

    const keys = settingKey.split(".");

    let curr = userConfig;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (key in curr) {
        curr = curr[key];
      }
    }

    curr[keys[keys.length - 1]] = settingValue;

    const userConfigPath = path.join(rootDir, "config", `${username}.json`);

    fs.mkdirSync(path.dirname(userConfigPath), { recursive: true });
    fs.writeFileSync(
      userConfigPath,
      JSON.stringify(userConfig, null, 2),
      "utf-8"
    );

    return "Success";
  }

  return `Invalid setting ${settingKey}, allowed settings are: ${Array.from(
    ALLOWED_KEYS
  ).join(", ")}`;
}

module.exports = {
  setRootDir,
  loadUserConfig,
  saveUserSetting,
};
