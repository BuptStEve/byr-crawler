/*
 * @Author: BuptStEve
 * @Date:   2016-01-21 15:21:31
 * @Last modified by:   steve
 * @Last modified time: 2016-Jul-31 23:46:54
 */

/* eslint no-console: ["error", { allow: ["warn", "error", "time", "timeEnd", "log"] }] */
/* eslint no-shadow: ["error", { "allow": ["cookie", "next", "err", "callback"] }] */

const _ = require('lodash');
const url = require('url');
const async = require('async');
const cheerio = require('cheerio');
const superagent = require('superagent');

const Config = require('../config/config.js');
const ArticleModel = require('../models/article.js');
const CommentModel = require('../models/comment.js');

let totalPageNum = 0;
let currentPageNum = 0;
let articleNum = 0;

/**
 * @desc 将主贴和回帖中的各种图片加上 baseUrl
 * @author BuptStEve
 * @param  {String} baseUrl
 * @param  {Object} $content
 * @param  {Object} $
 * @return {String} html
 */
function addBaseUrl2Img(baseUrl, $content, $) {
  $content.find('a').each((idx, elet) => {
    const originSrc = $(elet).attr('href');
    $(elet).attr('href', url.resolve(baseUrl, originSrc));
  });

  $content.find('img').each((idx, elet) => {
    const originSrc = $(elet).attr('src');
    $(elet).attr('src', url.resolve(baseUrl, originSrc));
  });

  return $content.html();
}

/**
 * @desc 根据原帖内容生成 summary 用于首页展示
 * @author BuptStEve
 * @param  {String} baseUrl
 * @param  {Object} $summary
 * @param  {Object} $
 * @return {Object} $summary
 */
function generateSummary(baseUrl, $summary, $) {
  let firstImg = {};
  let isDone = false;

  $summary.find('img').each((idx, elet) => {
    // console.log($(elet).attr('src').split(baseUrl));
    const splitArr = $(elet).attr('src').split(baseUrl);

    if (!isDone &&
      (splitArr.length === 1 ||
        (splitArr.length > 1 && splitArr[1].split('/')[0] === 'att'))
    ) {
      // 站外图片或站内的 att 图片
      isDone = true;
      firstImg = elet;
    }
    $(elet).remove();
  });

  $summary.html(_.truncate($summary.text(), {
    length: '200',
  }));

  if (firstImg !== {}) {
    $(firstImg).addClass('bn-inline-img');
    $summary.prepend(firstImg);
  }

  // console.log('firstImg: ', firstImg);
  // console.log('$summary: ', $summary);

  return $summary.html();
}

/**
 * @desc 把 $elet 中的回帖信息保存到 tmpCmts 数组中
 * @author BuptStEve
 * @param {Object} article
 * @param {Object} $elet
 * @param {Object} tmpCmts
 * @param {Object} $
 */
function saveComments(article, $elet, tmpCmts, $) {
  // 楼数
  const rank = $elet.find('div.nav a.plant').eq(0).text().split('楼')[0];
  // 回帖人
  const author = $elet.find('div.nav a').eq(1).text();
  // 回帖时间
  const cmtTime = new Date($elet.find('div.nav a.plant').eq(1).text());
  const $cmt = $elet.find('div.sp');
  // 回帖内容(text)
  const cmtBodyText = $cmt.text();
  // 回帖内容(html)
  const cmtBody = addBaseUrl2Img(Config.url.index, $cmt, $);

  tmpCmts.push({
    url: `${article.url}#${rank}`,
    article: article.id,
    author,
    submitTime: cmtTime,
    bodyText: cmtBodyText,
    body: cmtBody,
  });
}

/**
 * @desc 根据 article.url 获取帖子的第一页,得到: 当前页数, 主贴, 其余回帖: 保存在数据库中的 comments 文档中.
 * @author BuptStEve
 * @param {Object}   article
 * @param {String}   cookie
 * @param {Callback} next
 */
function getOneArticleFirstPage(article, cookie, next) {
  superagent
    .get(url.resolve(Config.url.index, article.url))
    .set('Cookie', cookie)
    .timeout(10000)
    .end((err, sres) => {
      if (err) {
        console.log(err);
        const tmpArticle = new ArticleModel({
          url: article.url,
          board: 'err',
          title: 'getOneArticleFirstPage',
          summary: `第${articleNum}篇  ${currentPageNum}/${totalPageNum}`,
          body: err,
        });

        return tmpArticle.save(err => {
          if (err) return next(err);

          return next(null, 0);
        });
      }

      const $ = cheerio.load(sres.text);

      if ($('#m_main > ul').length === 0) {
        ArticleModel.findOneAndUpdate({
          url: article.url,
        }, {
          $set: {
            updateTime: new Date(),
            body: '指定的文章不存在或链接错误',
          },
        }, Config.FOAU_OPT, err => {
          if (err) return next(err);

          return next(null, 0);
        });
      } else {
        const pageNum = $('#m_main div').eq(1).find('a.plant').eq(0)
          .text()
          .split('/')[1];

        const raw = $('#m_main>ul.list');

        let updateNum = 0; // 需要更新的页数(负数表示更新最新3页)

        console.log(url.resolve(Config.url.index, article.url), ': ', pageNum);

        // -- 主贴 --
        const rawArticle = raw.find('li').eq(1);

        // 1.获取发帖的精确时间(秒)
        const submitTimeText = rawArticle.find('div.nav a.plant').eq(1).text();
        const submitTime = new Date(submitTimeText);

        // 2.获取主贴的内容
        const $article = rawArticle.find('div.sp');
        const articleBodyText = $article.text();

        // 处理图片 src 后的主贴 html
        const articleBody = addBaseUrl2Img(Config.url.index, $article, $);
        const articleSummary = generateSummary(Config.url.index, $article, $);

        // -- 跟帖 -- 有没有精彩评论 dom 结构不一样
        const rawComments = $('#m_main>li');
        const tmpComments = []; // 暂时保存回帖

        if (rawComments.length === 10) {
          // --- 有精彩评论---
          // 获取回帖的楼层/回帖人/精确时间(秒)/内容
          rawComments.each((idx, elet) => {
            if (idx !== 0) {
              saveComments(article, $(elet), tmpComments, $);
            }
          });
        } else {
          // --- 没有精彩评论 ---
          raw.find('li').each((idx, elet) => {
            if (idx > 2) {
              saveComments(article, $(elet), tmpComments, $);
            }
          });
        }

        async.parallel([
          callback => {
            // 更新 article
            ArticleModel.findOneAndUpdate({
              url: article.url,
            }, {
              $set: {
                submitTime,
                updateTime: new Date(),
                summary: articleSummary,
                body: articleBody,
                bodyText: articleBodyText,
              },
            }, Config.FOAU_OPT, (err) => {
              if (err) return callback(err);

              // console.log(doc);
              return callback(null);
            });
          },
          callback => {
            // 保存评论到数据库
            async.each(tmpComments, (comment, callback) => {
              CommentModel.findOneAndUpdate({
                url: comment.url,
              }, {
                $set: {
                  article: comment.article,
                  author: comment.author,
                  submitTime: comment.submitTime,
                  bodyText: comment.bodyText,
                  body: comment.body,
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

          if (article.pageNum === 0) {
            // 初次更新: 需要更新的页数为总页数-1(第一页已更新)
            updateNum = pageNum - 1;
            totalPageNum += updateNum + 1;
          } else if (article.pageNum < pageNum) {
            // 有新帖(页数增加): 需要更新的页数为新增的页数(第一页已更新)
            updateNum = pageNum - article.pageNum;
            totalPageNum += updateNum + 1;
          } else if (article.pageNum >= pageNum) {
            // 页数变少: 说明有删帖,获取最新的1页.
            // 页数没变: 获取最新1页的回帖.
            updateNum = -pageNum;
            totalPageNum += 2;
          }

          // 进度
          currentPageNum += 1;
          articleNum += 1;
          console.log(`
            第${articleNum}篇: ${currentPageNum}/${totalPageNum}
            ${((currentPageNum / totalPageNum) * 100).toFixed(2)}%`);

          return next(null, updateNum, pageNum);
        });
      }

      return undefined;
    });
}

/**
 * @desc 根据 article.url 得到一页下各种回帖(可能有主贴).
 * @author BuptStEve
 * @param {Object}   article
 * @param {Callback} next
 */
function getOneArticlePage(article, cookie, next) {
  superagent
    .get(url.resolve(Config.url.index, article.url))
    .set('Cookie', cookie)
    .timeout(10000)
    .end((err, sres) => {
      if (err) {
        console.log(err);
        const tmpArticle = new ArticleModel({
          url: article.url,
          board: 'err',
          title: 'getOneArticlePage',
          author: article.id,
          summary: `第${articleNum}篇 ${currentPageNum}/${totalPageNum}`,
          body: err,
        });

        return tmpArticle.save(err => {
          if (err) return next(err);

          return next(null);
        });
      }

      const $ = cheerio.load(sres.text);
      const raw = $('#m_main > ul.list');

      console.log('getOneArticlePage: ', url.resolve(Config.url.index, article.url));

      // 进度
      currentPageNum += 1;
      console.log(`
        第${articleNum}篇: ${currentPageNum}/${totalPageNum}
        ${((currentPageNum / totalPageNum) * 100).toFixed(2)}%`);

      // -- 非第一页的跟帖 --
      const tmpComments = []; // 暂时保存回帖
      raw.find('li').each((idx, elet) => {
        if (idx !== 0 && idx !== 2) {
          saveComments(article, $(elet), tmpComments, $);
        }
      });

      // 保存评论到数据库
      async.each(tmpComments, (comment, callback) => {
        CommentModel.findOneAndUpdate({
          url: comment.url,
        }, {
          $set: {
            article: comment.article,
            author: comment.author,
            submitTime: comment.submitTime,
            bodyText: comment.bodyText,
            body: comment.body,
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
 * @desc step3 爬取所有帖子和帖子的评论(updateArticles)
 * 根据数据库中的 Article 文档,获取 pageNum(初次运行时为0).
 * 获取帖子的第一页,得到: 当前页数, 主贴, 其余回帖: 保存在数据库中的 comments 文档中.
 * 若 pageNum 为0,则爬取接下来的每一页所有回帖.
 * 若 pageNum 不为0,则进行[增量更新].
 * 增量更新:
 * a)页数没变: 获取最新1页的回帖.
 * b)页数变少: 说明有删帖,获取最新的1页.
 * c)页数变多: 从原页数开始获取到最新页数.
 * @author BuptStEve
 */
function updateArticles(cookie, next) {
  console.time('updateArticles');
  const stream = ArticleModel
    .find({
      title: {
        $not: /[合集]/,
      },
      board: {
        $not: /err/,
      },
      author: {
        $not: /原帖已删除/,
      },
      body: {
        $not: /指定的文章不存在或链接错误/,
      },
      pageNum: 0,
      // pageNum: {$exists: false}
    })
    .batchSize(120)
    // .skip(5)
    // .limit(1200)
    .stream();

  let cache = [];

  /**
   * @desc 无
   * @author BuptStEve
   * @param {Boolean}  isLast
   * @param {Array}    cache
   * @param {String}   cookie
   * @param {Callback} next
   */
  function mainProcess(isLast, cookie, next) {
    async.waterfall([
      /*
       * @desc 1.读取数据库中的 articles 文档
       * @author BuptStEve
       */
      function getArticlesFromDB(next) {
        next(null, cache);
      },
      /*
       * @desc 2.首先获取页面上的现有页数(pageNum),
       * 若是已有页数(board.pageNum)为0(初次运行),则使用现有页数;若是不为0,则根据比较已有和现有页数,最少更新1页.
       * @author BuptStEve
       */
      function getArticlesFirstPage(articles, next) {
        const articlePage = [];

        async.eachLimit(articles, 1, (article, callback) => {
          getOneArticleFirstPage(article, cookie, (err, updateNum, pageNum) => {
            if (err) return callback(err);

            // console.log(article.url, ', pageNum: ', pageNum);

            articlePage.push({
              url: article.url,
              id: article.id,
              updateNum,
              pageNum,
            });

            return callback(null);
          });
        }, err => {
          if (err) return next(err);

          return next(null, articlePage);
        });
      },
      /*
       * @desc 3.获取其中的主贴内容和 comments,最后保存进数据库中.
       * @author BuptStEve
       */
      function getArticlesOtherPages(articles, next) {
        async.eachLimit(articles, 1, (article, callback) => {
          const articlePageUrls = [];

          if (article.updateNum === 0) {
            if (article.pageNum) {
              return ArticleModel.update({
                url: article.url,
              }, {
                $set: {
                  pageNum: article.pageNum,
                },
              }, (err) => {
                if (err) return callback(err);

                // console.log(doc);
                return callback(null);
              });
            }

            return callback(null);
          }

          // 生成 url 数组
          if (article.updateNum > 0) {
            for (let i = 2; i < 2 + article.updateNum; i += 1) {
              articlePageUrls.push(`${article.url}?p=${i.toString()}`);
            }
          } else if (article.updateNum < 0) {
            for (let i = -article.updateNum; i > -article.updateNum - 3; i -= 1) {
              if (i <= 1) {
                break;
              }
              articlePageUrls.push(`${article.url}?p=${i.toString()}`);
            }
          }

          async.eachLimit(articlePageUrls, 3, (articlePageUrl, callback) => {
            const oneArticle = {
              url: articlePageUrl,
              id: article.id,
            };

            getOneArticlePage(oneArticle, cookie, err => {
              if (err) {
                return callback(err);
              }

              return callback(null);
            });
          }, err => {
            if (err) return callback(err);

            ArticleModel.update({
              url: article.url,
            }, {
              $set: {
                pageNum: article.pageNum,
              },
            }, (err) => {
              if (err) return callback(err);

              // console.log(doc);
              return callback(null);
            });

            return undefined;
          });

          return undefined;
        }, err => {
          if (err) {
            return next(err);
          }

          return next(null, 'done');
        });
      },
    ], (err, results) => {
      if (err) return next(`updateArticles err: ${err}`);

      cache = [];
      console.log('results: ', results);

      if (!isLast) {
        stream.resume();
      } else {
        console.timeEnd('updateArticles');
        return next(null);
      }

      return undefined;
    });
  }

  stream.on('data', item => {
    cache.push(item);

    // if (currentPageNum >= sleepNum) {
    //   // 歇一歇～=￣ω￣=～
    //   sleepNum += CONST_NUM;
    //   sleep(5000);
    // }

    if (cache.length === 12) {
      stream.pause();

      process.nextTick(() => {
        mainProcess(false, cookie, next);
      });
    }
  });

  stream.on('error', err => {
    console.error(err);
  });

  stream.on('end', () => {
    if (cache.length > 0) {
      mainProcess(true, cookie, next);
    }
  });

  stream.on('close', () => {
    console.log('query closed...');
  });
}

module.exports = {
  updateArticles,
  addBaseUrl2Img,
  generateSummary,
  saveComments,
};
