/*
* @Author: BuptStEve
* @Date:   2016-01-18 10:59:48
* @Last Modified by:   BuptStEve
* @Last Modified time: 2016-02-04 14:17:39
*/

'use strict';

var mongoose = require('mongoose');
var Schema   = mongoose.Schema;
var article  = require('./article.js');
var IdString = Schema.Types.String;

// 4.回帖(comment)
var CommentSchema = new Schema({
  url       : String, // 地址(哈希表示): http://m.byr.cn/article/WWWTechnology/33098#1
  article   : String, // 所属帖子在数据库中的 _id: 56ad9b7568f674b26110a5e8
  author    : String, // 作者: reverland
  body      : String, // 回帖内容(html)
  submitTime: Date    // 发布时间: 2015-12-23 19:09:02
});

module.exports = mongoose.model('Comment', CommentSchema);
