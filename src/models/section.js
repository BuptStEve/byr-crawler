/*
 * @Author: BuptStEve
 * @Date:   2016-01-18 10:59:48
 * @Last modified by:   steve
 * @Last modified time: 2016-Aug-01 23:39:32
 */

import mongoose from 'mongoose';

const Schema = mongoose.Schema;

// 1.分区(section)
const SectionSchema = new Schema({
  url: String, // 地址: http://m.byr.cn/section/1
  title: String, // 标题: 北邮校园
  subSections: [String], // 子分区数组
  boards: [String], // 版面数组
});

export default mongoose.model('Section', SectionSchema);
