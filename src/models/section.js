/*
 * @Author: BuptStEve
 * @Date:   2016-01-18 10:59:48
 * @Last modified by:   steve
 * @Last modified time: 2016-Jul-31 00:40:53
 */

const mongoose = require('mongoose');

const Schema = mongoose.Schema;

// 1.分区(section)
const SectionSchema = new Schema({
  url: String, // 地址: http://m.byr.cn/section/1
  title: String, // 标题: 北邮校园
  subSections: [String], // 子分区数组
  boards: [String], // 版面数组
});

module.exports = mongoose.model('Section', SectionSchema);
