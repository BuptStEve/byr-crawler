/*
* @Author: BuptStEve
* @Date:   2016-02-05 16:45:27
* @Last Modified by:   BuptStEve
* @Last Modified time: 2016-02-05 17:00:54
*/

'use strict';
var url        = require('url'),
    async      = require('async'),
    cheerio    = require('cheerio'),
    superagent = require('superagent');

var Config = require('../config.js');

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
    .end(function (err, sres) {
      // 302 跳转
      // if (err) { console.log(err); }

      var rawCookies = sres.headers['set-cookie'];
      var cookie = rawCookies[3].split(';')[0] + '; ' +
                   rawCookies[4].split(';')[0] + '; ' +
                   rawCookies[5].split(';')[0];

      // console.log(cookie);
      next(null, cookie);
    });
}

module.exports = {
  getCookie: getCookie
};
