/*
 * @Author: BuptStEve
 * @Date:   2016-01-18 10:59:48
 * @Last modified by:   steve
 * @Last modified time: 2016-Aug-01 23:38:36
 */

 import mongoose from 'mongoose';
// const article = require('./article.js');

const Schema = mongoose.Schema;

// 4.回帖(comment)
const CommentSchema = new Schema({
  url: String, // 地址(哈希表示): http://m.byr.cn/article/WWWTechnology/33098#1
  article: String, // 所属帖子在数据库中的 _id: 56ad9b7568f674b26110a5e8
  author: String, // 作者: reverland
  bodyText: String, // 文字内容
  body: String, // 回帖内容(html)
  submitTime: Date, // 发布时间: 2015-12-23 19:09:02
});

export default mongoose.model('Comment', CommentSchema);
