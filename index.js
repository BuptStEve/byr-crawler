/*
* @Author: BuptStEve
* @Date:   2016-01-18 11:06:15
* @Last Modified by:   BuptStEve
BuptStEve
* @Last Modified time: 2016-03-07 14:41:58
*/

'use strict';

var async    = require('async'),
    mongoose = require('mongoose'),
    cron     = require('node-cron');

var Cookie  = require('./crawlers/cookie.js'),
    Config  = require('./config.js'),
    TopTen  = require('./crawlers/top_ten.js');

mongoose.connect(Config.db);

cron.schedule('*/10 * * * *', function(){
  // 10分钟更新一次
  Cookie.getCookie(function(err, cookie) {
    if (err) { return console.log(err); }

    console.log(cookie);
    TopTen.updateTopTen(cookie, function(err) {
      if (err) { console.log(err); }

      console.log('done');
    });
  });
});

