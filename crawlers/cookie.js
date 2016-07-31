/*
 * @Author: BuptStEve
 * @Date:   2016-02-05 16:45:27
 * @Last modified by:   steve
 * @Last modified time: 2016-Jul-31 21:20:01
 */

const superagent = require('superagent');

const Config = require('../config.js');

/**
 * @desc 获取 cookie
 * @author BuptStEve
 * @return {String} cookie
 */
function getCookie(next) {
  superagent
    .post(Config.url.login)
    .type('form')
    .send(Config.auth)
    .redirects(0)
    .end((err, sres) => {
      // 302 跳转
      // if (err) { console.log(err); }

      /* eslint max-len: ["error", 120] */
      const rawCookies = sres.headers['set-cookie'];
      const cookie = `${rawCookies[3].split(';')[0]}; ${rawCookies[4].split(';')[0]}; ${rawCookies[5].split(';')[0]}`;

      // console.log(cookie);
      next(null, cookie);
    });
}

module.exports = {
  getCookie,
};
