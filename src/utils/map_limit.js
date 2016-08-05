/**
 * @Author: BuptStEve
 * @Date:   2016-Aug-02 10:47:27
 * @Last modified by:   steve
 * @Last modified time: 2016-Aug-06 02:32:03
 */

/**
 * @desc I'll explain it when you are older
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

export default mapLimit
