/*
 * MIT License
 * Copyright (c) 2017 Krzysztof Derek
 * https://github.com/xkxd/gulp-html-partial
 * 
 * David Graeff: Removed deprecated gulp-utils. Correct "Buffer" usage. Use regex replace for substitutions.
 */
const fs = require('fs');
const partition = require('./partition');
const html = require('html');
const PluginError = require('plugin-error');
const colors = require('ansi-colors');
var log = require('fancy-log');

module.exports = (function () {
  "use strict";
  const pluginName = 'gulp-html-partial';

  const options = {
    tagName: 'partial',
    basePath: '',
    variablePrefix: '@@'
  };

  /**
   * Matches <tagName></tagName> and <tagName />
   *
   * @param {String} html - stringified file content
   * @returns {Array.<String>}
   */
  function getTags(html) {
    const closed = html.match(new RegExp(`<${options.tagName}(.*)/${options.tagName}>`, 'g')) || [];
    const selfClosed = html.match(new RegExp(`<${options.tagName}(.*?)\/>`, 'g')) || [];

    return [].concat(closed, selfClosed);
  }

  /**
   * Extracts attributes from template tags as an array of objects
   *
   * @example of output
   * [
   *   { 
   *     key: 'src',
   *     value: 'partial.html'
   *   },
   *   { 
   *     key: 'title',
   *     value: 'Some title'
   *   }
   * ]
   *
   * @param {String} tag - tag to replace
   * @returns {Array.<Object>}
   */
  function getAttributes(tag) {
    let running = true;
    const attributes = [];
    const regexp = /(\S+)=["']?((?:.(?!["']?\s+(?:\S+)=|[>"']))+.)["']?/g;

    while (running) {
      const match = regexp.exec(tag);

      if (match) {
        attributes.push({
          key: match[1],
          value: match[2]
        })
      } else {
        running = false;
      }
    }

    return attributes;
  }

  /**
   * Gets file using node.js' file system based on src attribute
   *
   * @param {Array.<Object>} attributes - tag
   * @returns {String}
   */
  function getPartial(attributes) {
    const splitAttr = partition(attributes, (attribute) => attribute.key === 'src');
    const sourcePath = splitAttr[0][0] && splitAttr[0][0].value;
    let file;

    if (sourcePath && fs.existsSync(options.basePath + sourcePath)) {
      file = injectHTML(fs.readFileSync(options.basePath + sourcePath))
    } else if (!sourcePath) {
      log(`${pluginName}:`, new PluginError(pluginName, colors.red(`Some partial does not have 'src' attribute`)).message);
    } else {
      log(`${pluginName}:`, new PluginError(pluginName, colors.red(`File ${options.basePath + sourcePath} does not exist.`)).message);
    }

    return replaceAttributes(file, splitAttr[1] || []);
  }

  /**
   * Replaces partial content with given attributes
   *
   * @param {Object|undefined} file - through2's file object
   * @param {Array.<Object>} attributes - tag
   * @returns {String}
   */
  function replaceAttributes(file, attributes) {
    let html = file && file.toString() || '';
    for (let attribute of attributes) {
      const needle = new RegExp(options.variablePrefix + attribute.key, 'mg');
      html = html.replace(needle, attribute.value);
    }
    return html;
  }

  /**
   * @param {String} html - HTML content of modified file
   * @returns {String}
   */
  function getHTML(html) {
    const tags = getTags(html);
    const partials = tags.map((tag) => getPartial(getAttributes(tag)));

    return tags.reduce((output, tag, index) =>
      output.replace(tag, partials[index]), html);
  }

  /**
   * @param {Object} file - through2's or nodejs' file object
   * @returns {Object}
   */
  function injectHTML(file) {
    if (file.contents) {
      file.contents = Buffer.from(html.prettyPrint(getHTML(file.contents.toString())));
    } else {
      file = Buffer.from(html.prettyPrint(getHTML(file.toString())))
    }

    return file;
  }

  /**
   * @param {Object} config - config object
   * @returns {Buffer}
   */
  function transform(config) {
    Object.assign(options, config);

    return require('through2').obj(function (file, enc, callback) {
      if (file.isStream()) {
        this.emit('error', new PluginError(pluginName, 'Streams are not supported'));

        return callback(null, file);
      }

      if (file.isBuffer()) {
        file = injectHTML(file);
      }

      this.push(file);

      return callback()
    });
  }

  return transform;
})();
