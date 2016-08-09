/*
 * @Author: BuptStEve
 * @Date:   2016-02-05 16:45:27
 * @Last modified by:   steve
 * @Last modified time: 2016-Aug-04 18:15:55
 */

import superagent from 'superagent';

/**
 * @desc 获取 cookie
 * @author BuptStEve
 * @return {Object} cfg
 * @return {String} cookie
 */
async function getCookie(cfg) {
  let raw;

  try {
    await superagent
      .post(cfg.url.login)
      .type('form')
      .send(cfg.auth)
      .redirects(0);
  } catch (e) {
    raw = e.response.headers['set-cookie'];
  }

  return `${raw[3].split(';')[0]}; ${raw[4].split(';')[0]}; ${raw[5].split(';')[0]}`;
}

export default getCookie;
