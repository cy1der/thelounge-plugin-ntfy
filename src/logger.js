"use strict";

let Logger;

// Inspired by https://github.com/juanjocerero/thelounge-plugin-am/blob/main/src/logger.js
const PluginLogger = {
  init: (logger) => {
    Logger = logger;
  },
  error: (...args) => {
    if (Logger) Logger.error(...args);
  },
  warn: (...args) => {
    if (Logger) Logger.warn(...args);
  },
  info: (...args) => {
    if (Logger) Logger.info(...args);
  },
  debug: (...args) => {
    if (Logger) Logger.debug(...args);
  },
};

module.exports = {
  PluginLogger,
};
