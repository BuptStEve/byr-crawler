/**
 * @Author: steve
 * @Date:   2016-Jul-31 23:34:30
 * @Last modified by:   steve
 * @Last modified time: 2016-Aug-01 23:26:36
 */

import fs from 'fs';
import { isPlainObject, defaultsDeep } from 'lodash';

import defaultCfg from './default';

/**
 * @desc 使用 Promise 包装原生 fs.readdir，为了使用 await
 * @author BuptStEve
 * @param {String} path 文件夹路径
 */
function readDir(path) {
  return new Promise((resolve, reject) => {
    fs.readdir(path, (err, files) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(files);
    });
  });
}

/**
 * @desc 读取本文件夹下的所有配置文件，返回
 * @author BuptStEve
 * @return {Object} 配置对象
 */
async function getCfg() {
  const cfgs = [];
  const excludeFiles = ['index.js', 'default.js'];

  try {
    const files = await readDir(__dirname);

    files.forEach(file => {
      if (excludeFiles.includes(file)) return;

      try {
        const cfg = require(`./${file}`); // eslint-disable-line global-require

        if (isPlainObject(cfg)) {
          cfgs.push(cfg);
        }
      } catch (e) {
        throw e;
      }

      return;
    });
  } catch (e) {
    throw e;
  }

  cfgs.push(defaultCfg); // 默认配置最后放入

  return cfgs.reduce((a, b) => defaultsDeep(a, b), {});
}

export default getCfg;
