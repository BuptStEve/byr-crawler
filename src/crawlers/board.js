/*
 * @Author: BuptStEve
 * @Date:   2016-01-21 15:21:31
 * @Last modified by:   steve
 * @Last modified time: 2016-Aug-09 22:03:31
 */

/* eslint no-shadow: ["error", { "allow": ["cookie", "next", "err", "callback"] }] */

import url from 'url';
import cheerio from 'cheerio';
import superagent from 'superagent';

import { mapLimit, findOneAndUpdate } from '../utils';
import BoardModel from '../models/board.js';
import ArticleModel from '../models/article.js';

let totalPageNum = 0;
let currentPageNum = 0;
let boardNum = 0;

const CONCURRENT_NUM = 10;

/**
 * @desc step2 爬取版面下的帖子(updateBoards)
 * 根据数据库中的 Board 文档,获取 pageNum (初次运行时为0).
 * 获取版面的第一页,得到: 当前页数, 第一页的各个帖子,
 * 保存在数据库中的 Article 文档中.并更新 Board 文档中的最晚发帖时间(lastSubmitTime).
 * 若 pageNum 为0,则爬取接下来的每一页(不大于1000页)的所有帖子.
 * 若 pageNum 不为0,则进行[增量更新].
 * 增量更新:
 * a)页数没变: 获取最新1页的回帖.
 * b)页数变少: 说明有删帖,获取最新的1页.
 * c)页数变多: 从原页数开始获取到最新页数.
 *
 * @author BuptStEve
 * @param {Object} cfg 配置
 */
async function updateBoards(cfg) {
  console.time('updateBoards');

  try {
    /* -- 1.读取数据库中的 boards 文档 -- */
    const boardEntities = await BoardModel
      // .find()
      .find({
        title: {
          $ne: '北邮关注',
        },
      })
      // .skip(43)
      .limit(20)
      // .find({title: "书屋"})
      .exec();

    /**
     * 2.获取各个版面的第一页,得到: 当前页数,第一页的各个帖子,
     * 保存在数据库中的 Article 文档中.
     * 并更新 Board 文档中的最晚发帖时间(lastSubmitTime).
     */

    const boardsPage = [];

    await mapLimit(boardEntities, CONCURRENT_NUM, async (board) => {
      boardNum += 1;
      console.log(`第${boardNum}/${boardEntities.length}个版面`);

      const { updateNum, pageNum } = await getOneBoardPage(board, cfg, true);

      boardsPage.push({
        url: board.url,
        updateNum,
        pageNum,
      });
    });

    /* -- 3.根据 pageNum 获取该页下的所有 articles, 最后保存进数据库中. -- */
    await mapLimit(boardsPage, CONCURRENT_NUM, async (board) => {
      const boardPages = [];

      if (board.updateNum > 0) {
        for (let i = 2; i < 2 + board.updateNum; i += 1) {
          // 生成数组
          boardPages.push({
            url: `${board.url}?p=${i}`,
          });
        }

        await mapLimit(boardPages, CONCURRENT_NUM, async (boardPage) => {
          await getOneBoardPage(boardPage, cfg, false);

          await BoardModel.update({
            url: board.url,
          }, {
            $set: {
              pageNum: board.pageNum,
            },
          }).exec();
        });
      }
    });
  } catch (e) {
    throw e;
  }

  console.timeEnd('updateBoards');
}

/**
 * @desc 根据 board.url 获取版面的某一页,
 * 得到: 当前页数（第一页）,各个帖子,保存在数据库中的 Article 文档中.并更新 Board 文档中的最晚发帖时间(lastSubmitTime).
 * @author BuptStEve
 * @param {Object} board 版面信息
 * @param {String} cfg 配置
 * @param {Boolean} isFirst 是否是第一页
 */
async function getOneBoardPage(board, cfg, isFirst) {
  let boardLastSubmitTime = board.lastSubmitTime;
  const realUrl = url.resolve(cfg.url.index, board.url);

  try {
    const res = await superagent
      .get(realUrl)
      .set('Cookie', cfg.cookie);

    const $ = cheerio.load(res.text);
    const pageNum = +$('#m_main div').eq(1).find('a.plant').eq(0)
      .text()
      .split('/')[1];
    const $boardLinks = $('#m_main ul.list li');

    let updateNum = 0; // 需要更新的页数

    if ($boardLinks.length === 1) {
      return console.log('该版面没有任何主题!');
    }

    const tmpArticles = []; // 帖子

    $boardLinks.each((idx, elet) => {
      const $div = $(elet).find('div');
      const href = $div.eq(0).find('a').attr('href');
      const $text = $div.eq(0).text();
      const title = $text.slice(0, $text.lastIndexOf('('));
      const cmtsCount = $text.slice($text.lastIndexOf('(') + 1, $text.lastIndexOf(')'));
      const author = $div.eq(1).find('a').eq(0).text();
      const tmpTimeArr = $div.eq(1).text().replace(/\u00a0/g, ' ').split(' ');
      const submitTime = str2date(tmpTimeArr[0]);
      const lastCmtTime = str2date(tmpTimeArr[1].split('|')[1]);

      // 更新最晚发帖时间
      if (isFirst && submitTime > boardLastSubmitTime) {
        boardLastSubmitTime = submitTime;
      }

      tmpArticles.push({
        url: href,
        board: board.url,
        title,
        cmtsCount,
        author,
        submitTime,
        lastCmtTime,
      });
    });

    // 更新 article
    tmpArticles.forEach(async (article) => {
      const findOneOpt = { url: article.url };
      const saveOpt = {
        url: article.url,
        board: article.board,
        title: article.title,
        cmtsCount: article.cmtsCount,
        author: article.author,
        submitTime: article.submitTime,
        lastCommentTime: article.lastCommentTime,
      };
      const updateOpt = {
        url: article.url,
        board: article.board,
        title: article.title,
        cmtsCount: article.cmtsCount,
        author: article.author,
        submitTime: article.submitTime,
        lastCommentTime: article.lastCommentTime,
      };

      await findOneAndUpdate(ArticleModel, findOneOpt, saveOpt, updateOpt);
    });

    if (isFirst) {
      // 更新 board 的 lastSubmitTime
      await BoardModel.update({
        url: board.url,
      }, {
        $set: {
          lastSubmitTime: boardLastSubmitTime,
        },
      }).exec();

      // 通过第一页获取需要更新的页数
      if (board.pageNum === 0) {
        // 初次更新: 需要更新的页数为总页数-1(第一页已更新)
        updateNum = pageNum - 1;
      } else if (board.pageNum < pageNum) {
        // 有新帖(页数增加): 需要更新的页数为新增的页数(第一页已更新)
        updateNum = pageNum - board.pageNum;
      }

      // 限制页数最多1000页.(因为第一13000+,第二1200+,第三600-)
      updateNum = updateNum > 1000 ? 1000 : updateNum;

      totalPageNum += updateNum + 1;
    }

    // 进度
    currentPageNum += 1;

    const progressTxt = `${currentPageNum}/${totalPageNum}`;
    const progressPrecent = ((currentPageNum / totalPageNum) * 100).toFixed(2);

    console.log(`第${currentPageNum}页: ${progressTxt} ${progressPrecent}%`);

    return { updateNum, pageNum };
  } catch (e) {
    console.error(e.message);
    throw e;
  }
}

/**
 * @desc 将时间字符串转换为 Date 对象，由于存在 "09:46:31" 这样的时间需要稍微处理下╮(╯_╰)╭
 * @author BuptStEve
 * @param {String} str
 * @return {Object} time
 * @example
 *   var someTime = str2date(str);
 */
function str2date(str) {
  let time = new Date();

  const tmpTime = str.split(':');
  if (tmpTime.length === 3) {
    time.setHours(tmpTime[0]); // 时
    time.setMinutes(tmpTime[1]); // 分
    time.setSeconds(tmpTime[2]); // 秒
  } else {
    time = new Date(str);
    time.setHours(0);
  }

  return time;
}

export default updateBoards;
