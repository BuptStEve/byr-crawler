/*
 * @Author: BuptStEve
 * @Date:   2016-01-18 10:59:48
 * @Last modified by:   steve
 * @Last modified time: 2016-Aug-01 23:39:19
 */

import mongoose from 'mongoose';

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

export default mongoose.model('Board', BoardSchema);
