/*
 * @Author: BuptStEve
 * @Date:   2016-01-18 10:59:48
 * @Last modified by:   steve
 * @Last modified time: 2016-Jul-31 00:39:49
 */

const mongoose = require('mongoose');

const Schema = mongoose.Schema;

// 3.帖子(article)
const ArticleSchema = new Schema({
  url: String, // 地址: http://m.byr.cn/article/WWWTechnology/33098
  board: String, // 所属版面(含页数)
  title: String, // 标题: [心得]做了个 css3 flex 属性的学习小 demo ～=￣ω￣=～
  author: String, // 作者: steveyoung
  pageNum: { // 页数: 1
    type: Number,
    default: 0,
  },
  body: String, // 帖子内容(html)
  summary: String, // 摘要内容(html)
  bodyText: String, // 文字内容
  commentsCount: Number, // 回贴数量
  newCommentsCount: Number, // 新回贴数量(十大贴才有)
  ttUpdateTime: Date, // 十大更新时间(十大贴才有): 2015-12-23 16:31:06
  updateTime: Date, // 更新时间: 2015-12-23 16:31:06
  submitTime: Date, // 发布时间: 2015-12-23 16:31:06
  lastCommentTime: { // 最新回复时间: 2015-12-23 16:31:06
    type: Date,
    default: new Date(0),
  },
});

module.exports = mongoose.model('Article', ArticleSchema);
