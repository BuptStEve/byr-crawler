/**
 * @Author: steve
 * @Date:   2016-Jul-31 23:34:30
 * @Last modified by:   steve
 * @Last modified time: 2016-Jul-31 23:37:19
 */

import fs from 'fs';
import _, { isPlainObject, defaultsDeep } from 'lodash';
import defaultCfg from './default';

/* eslint no-console: ["error", { allow: ["log", "error"] }] */

const cfgs = [];

fs.readdirSync(__dirname).forEach(file => {
  if (file === 'index.js' || /.*\.js\.map/.test(file)) return;

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

cfgs.push(defaultCfg);

export default defaultsDeep.apply(_, cfgs);
