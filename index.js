/*
 * @Author: BuptStEve
 * @Date:   2016-01-18 11:06:15
 * @Last modified by:   steve
 * @Last modified time: 2016-Jul-31 21:17:40
 */

 /* eslint no-console: ["error", { allow: ["warn", "error", "time", "timeEnd", "log"] }] */
 /* eslint no-shadow: ["error", { "allow": ["cookie", "next", "err", "callback"] }] */

const cron = require('node-cron');
const mongoose = require('mongoose');

const Cookie = require('./crawlers/cookie.js');
const Config = require('./config.js');
const TopTen = require('./crawlers/top_ten.js');

mongoose.connect(Config.db);

cron.schedule('*/10 * * * *', () => {
  // 10分钟更新一次
  Cookie.getCookie((err, cookie) => {
    if (err) return console.log(err);

    console.log(cookie);
    TopTen.updateTopTen(cookie, err => {
      if (err) return console.log(err);

      return console.log('done');
    });

    return undefined;
  });
});
