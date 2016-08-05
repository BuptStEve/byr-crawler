/**
 * @Author: BuptStEve
 * @Date:   2016-Aug-02 10:47:27
 * @Last modified by:   steve
 * @Last modified time: 2016-Aug-06 06:13:00
 */

/**
 * @desc 控制并发
 * @author BuptStEve
 * @param {Array} arr
 * @param {Number} coNum
 * @param {Function} fn
 */
async function mapLimit(arr, coNum, fn) {
  let i = 0;
  const len = arr.length;

  while (i < len) {
    const tasks = arr.slice(i, i + coNum).map(val => fn(val));

    try {
      await Promise.all(tasks);
    } catch (e) {
      throw e;
    } finally {
      i += coNum;
    }
  }
}

/**
* @desc 封装查询一条记录，若不存在则创建，否则更新的功能
* @author BuptStEve
* @param {Object} Model 模型
* @param {Object} findOneOpt 查询条件
* @param {Object} saveOpt 保存内容
* @param {Object} updateOpt 更新内容
*/
async function findOneAndUpdate(Model, findOneOpt, saveOpt, updateOpt) {
  const entity = await Model.findOne(findOneOpt).exec();

  if (!entity) {
    await new Model(saveOpt).save();
  } else {
    await entity.update(updateOpt).exec();
  }
}

export {
  mapLimit,
  findOneAndUpdate,
};
