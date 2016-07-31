/*
 * @Author: BuptStEve
 * @Date:   2016-01-21 15:21:31
 * @Last modified by:   steve
 * @Last modified time: 2016-Jul-31 00:56:55
 */

/* eslint no-console: ["error", { allow: ["warn", "error", "time", "timeEnd", "log"] }] */
/* eslint no-shadow: ["error", { "allow": ["cookie", "next", "err", "callback"] }] */

const url = require('url');
const async = require('async');
const cheerio = require('cheerio');
const superagent = require('superagent');

const Config = require('../config.js');
const BoardModel = require('../models/board.js');
const ArticleModel = require('../models/article.js');

let totalPageNum = 0;
let currentPageNum = 0;
let boardNum = 0;

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

/**
 * @desc 根据 board.url 获取版面的第一页,
 * 得到: 当前页数, 第一页的各个帖子: 保存在数据库中的 Article 文档中.并更新 Board 文档中的最晚发帖时间(lastSubmitTime).
 * @author BuptStEve
 * @param {Object}   board
 * @param {String}   cookie
 * @param {Callback} next
 */
function getOneBoardFirstPage(board, cookie, next) {
  let boardLastSubmitTime = board.lastSubmitTime;

  superagent
    .get(url.resolve(Config.url.index, board.url))
    .set('Cookie', cookie)
    .end((err, sres) => {
      if (err) return next(err);

      const $ = cheerio.load(sres.text);
      const pageNum = $('#m_main div').eq(1).find('a.plant').eq(0)
        .text()
        .split('/')[1];

      let updateNum = 0; // 需要更新的页数

      console.log(url.resolve(Config.url.index, board.url), ': ', pageNum);

      if ($('#m_main ul.list li').length === 1) {
        return next('该版面没有任何主题!');
      }

      const tmpArticles = []; // 帖子

      $('#m_main ul.list li').each((idx, elet) => {
        const $div = $(elet).find('div');
        const href = $div.eq(0).find('a').attr('href');
        const $text = $div.eq(0).text();
        const title = $text.slice(0, $text.lastIndexOf('('));
        const cmtsCount = $text.slice($text.lastIndexOf('(') + 1, $text.lastIndexOf(')'));
        const author = $div.eq(1).find('a').eq(0).text();
        const tmpTimeArr = $div.eq(1).text().replace(/\u00a0/g, ' ').split(' ');
        const submitTime = str2date(tmpTimeArr[0]);
        const lastCmtTime = str2date(tmpTimeArr[1].split('|')[1]);

        if (submitTime > boardLastSubmitTime) {
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

      async.parallel([
        callback => {
          // 更新 board 的 lastSubmitTime
          BoardModel.update({
            url: board.url,
          }, {
            $set: {
              lastSubmitTime: boardLastSubmitTime,
            },
          }, (err) => {
            if (err) return callback(err);

            // console.log(doc);
            return callback(null);
          });
        },
        callback => {
          // 更新 article
          async.each(tmpArticles, (article, callback) => {
            ArticleModel.findOneAndUpdate({
              url: article.url,
            }, {
              $set: {
                url: article.url,
                board: article.board,
                title: article.title,
                author: article.author,
                submitTime: article.submitTime,
                lastCommentTime: article.lastCommentTime,
              },
            }, Config.FOAU_OPT, (err) => {
              if (err) return callback(err);

              // console.log(doc);
              return callback(null);
            });
          }, err => {
            if (err) return callback(err);

            return callback(null);
          });
        },
      ], err => {
        if (err) return next(err);

        if (board.pageNum === 0) {
          // 初次更新: 需要更新的页数为总页数-1(第一页已更新)
          updateNum = pageNum - 1;
        } else if (board.pageNum < pageNum) {
          // 有新帖(页数增加): 需要更新的页数为新增的页数(第一页已更新)
          updateNum = pageNum - board.pageNum;
        }

        // updateNum = pageNum - 1;

        // 限制页数最多1000页.(因为第一13000+,第二1200+,第三600-)
        updateNum = updateNum > 1000 ? 1000 : updateNum;

        // 进度
        totalPageNum += updateNum + 1;
        currentPageNum += 1;
        boardNum += 1;
        console.log(`
          第${boardNum}篇: ${currentPageNum}/${totalPageNum}
          ${((currentPageNum / totalPageNum) * 100).toFixed(2)}%`);

        return next(null, updateNum, pageNum);
      });

      return undefined;
    });
}

/**
 * @desc 根据 boardUrl 得到该页下的所有 articles(保存到数据库)
 * @author BuptStEve
 * @param {String}   boardUrl
 * @param {Callback} next
 */
function getOneBoardPage(boardUrl, cookie, next) {
  superagent
    .get(url.resolve(Config.url.index, boardUrl))
    .set('Cookie', cookie)
    .end((err, sres) => {
      if (err) return next(err);

      const $ = cheerio.load(sres.text);

      console.log('getOneBoardPage: ', url.resolve(Config.url.index, boardUrl));

      // 进度
      currentPageNum += 1;
      console.log(`
        第${boardNum}篇: ${currentPageNum}/${totalPageNum}
        ${((currentPageNum / totalPageNum) * 100).toFixed(2)}%`);

      if ($('#m_main ul.list li a').length === 0) {
        return next('该版面没有任何主题!');
      }

      const tmpArticles = []; // 帖子
      $('#m_main ul.list li').each((idx, elet) => {
        const $div = $(elet).find('div');
        const href = $div.eq(0).find('a').attr('href');
        const $text = $div.eq(0).text();
        const title = $text.slice(0, $text.lastIndexOf('('));
        const cmtsCount = $text.slice($text.lastIndexOf('(') + 1, $text.lastIndexOf(')'));
        const author = $div.eq(1).find('a').eq(0).text();
        const tmpTimeArr = $div.eq(1).text().replace(/\u00a0/g, ' ').split(' ');
        const submitTime = str2date(tmpTimeArr[0]);
        const lastCmtTime = str2date(tmpTimeArr[1].split('|')[1]);

        tmpArticles.push({
          url: href,
          board: boardUrl,
          title,
          cmtsCount,
          author,
          submitTime,
          lastCmtTime,
        });
      });

      // 更新 article
      async.each(tmpArticles, (article, callback) => {
        ArticleModel.findOneAndUpdate({
          url: article.url,
        }, {
          $set: {
            url: article.url,
            board: article.board,
            title: article.title,
            commentsCount: article.commentsCount,
            author: article.author,
            submitTime: article.submitTime,
            lastCommentTime: article.lastCommentTime,
          },
        }, Config.FOAU_OPT, (err) => {
          if (err) return callback(err);

          // console.log(doc);
          return callback(null);
        });
      }, err => {
        if (err) return next(err);

        return next(null);
      });

      return undefined;
    });
}

/*
 * @desc step2 爬取版面下的帖子(updateBoards)
 * 根据数据库中的 Board 文档,获取 pageNum (初次运行时为0).
 * 获取版面的第一页,得到: 当前页数, 第一页的各个帖子: 保存在数据库中的 Article 文档中.并更新 Board 文档中的最晚发帖时间(lastSubmitTime).
 * 若 pageNum 为0,则爬取接下来的每一页(不大于1000页)的所有帖子.
 * 若 pageNum 不为0,则进行[增量更新].
 * 增量更新:
 * a)页数没变: 获取最新1页的回帖.
 * b)页数变少: 说明有删帖,获取最新的1页.
 * c)页数变多: 从原页数开始获取到最新页数.
 * @author BuptStEve
 */
function updateBoards(cookie, next) {
  console.time('updateBoards');
  async.waterfall([
    /*
     * @desc 1.读取数据库中的 boards 文档
     * @author BuptStEve
     */
    function getBoardsFromDB(next) {
      BoardModel
      // .find()
        .find({
          title: {
            $ne: '北邮关注',
          },
        })
        // .skip(43)
        .limit(1)
        // .find({title: "书屋"})
        .exec((err, boards) => {
          if (err) return next(err);

          return next(null, boards);
        });
    },
    /*
     * @desc 2.获取版面的第一页,得到: 当前页数, 第一页的各个帖子: 保存在数据库中的 Article 文档中.
     * 并更新 Board 文档中的最晚发帖时间(lastSubmitTime).
     * @author BuptStEve
     */
    function getBoardsFirstPage(boards, next) {
      const boardsPage = [];

      async.eachLimit(boards, 10, (board, callback) => {
        getOneBoardFirstPage(board, cookie, (err, updateNum, pageNum) => {
          if (err) return callback(err);

          // console.log(board.url, ', updateNum: ', updateNum);

          boardsPage.push({
            url: board.url,
            updateNum,
            pageNum,
          });

          return callback(null);
        });
      }, err => {
        if (err) return next(err);

        return next(null, boardsPage);
      });
    },
    /*
     * @desc 3.根据 pageNum 获取该页下的所有 articles, 最后保存进数据库中.
     * @author BuptStEve
     */
    function getBoardsOtherPages(boards, next) {
      async.eachLimit(boards, 1, (board, callback) => {
        const boardPages = [];

        if (board.updateNum > 0) {
          for (let i = 2; i < 2 + board.updateNum; i += 1) {
            // 生成数组
            boardPages.push(`${board.url}?p=${i.toString()}`);
          }

          console.log(board.url, ': ', boardPages.length + 1);

          async.eachLimit(boardPages, 1, (boardPage, callback) => {
            getOneBoardPage(boardPage, cookie, err => {
              if (err) return callback(err);

              return callback(null);
            });
          }, err => {
            if (err) return callback(err);

            BoardModel.update({
              url: board.url,
            }, {
              $set: {
                pageNum: board.pageNum,
              },
            }, (err) => {
              if (err) return callback(err);

              // console.log(doc);
              return callback(null);
            });

            return undefined;
          });
        }

        return callback(null);
      }, err => {
        if (err) return next(err);

        return next(null, 'done');
      });
    },
  ], (err, results) => {
    if (err) return next(`updateBoards err: ${err}`);

    console.log('results: ', results);
    console.timeEnd('updateBoards');
    return next(null);
  });
}

module.exports = {
  updateBoards,
};
