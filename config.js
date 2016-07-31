/*
 * @Author: BuptStEve
 * @Date:   2016-01-31 21:26:23
 * @Last modified by:   steve
 * @Last modified time: 2016-Jul-31 21:18:25
 */

module.exports = {
  // -- 用户名/密码 --
  auth: {
    id: 'foo',
    passwd: 'bar',
  },
  // -- mongodb --
  db: 'mongodb://username:passwork@hostname:port/databasename',
  // -- 各类地址 --
  url: {
    index: 'http://m.byr.cn/',
    login: 'http://m.byr.cn/user/login/',
  },
  // -- FindOneAndUpdate 方法配置 --
  FOAU_OPT: {
    new: true, // 返回新的文档
    upsert: true, // 如果不存在则插入
  },
  // -- 1.分区部分 --
  section: {
    SECTION_START: 1, // 开始的分区号
    SECTION_END: 9, // 结束的分区号
  },
};
