/*
 * @Author: BuptStEve
 * @Date:   2016-01-18 10:59:48
 * @Last modified by:   steve
 * @Last modified time: 2016-Jul-31 00:40:10
 */

const mongoose = require('mongoose');

const Schema = mongoose.Schema;

// 2.版面(board)
const BoardSchema = new Schema({
  url: String, // 地址: http://m.byr.cn/board/WWWTechnology
  title: String, // 标题: WWW技术
  pageNum: { // 页数: 108
    type: Number,
    default: 0,
  },
  lastSubmitTime: { // 最新回复时间: 2016-01-17
    type: Date,
    default: new Date(0),
  },
});

module.exports = mongoose.model('Board', BoardSchema);
