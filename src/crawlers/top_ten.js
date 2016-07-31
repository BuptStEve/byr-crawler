/*
 * @Author: BuptStEve
 * @Date:   2016-01-21 15:21:31
 * @Last modified by:   steve
 * @Last modified time: 2016-Jul-31 23:46:38
 */

/* eslint no-console: ["error", { allow: ["warn", "error", "time", "timeEnd", "log"] }] */
/* eslint no-shadow: ["error", { "allow": ["cookie", "next", "err", "callback"] }] */

const url = require('url');
const async = require('async');
const cheerio = require('cheerio');
const superagent = require('superagent');

const Config = require('../config/config.js');
const Article = require('./article.js');
const ArticleModel = require('../models/article.js');
const CommentModel = require('../models/comment.js');

let theTime = new Date(); // 保证每次更新时间一致

/**
 * @desc 根据 article.url 得到帖子的 pageNum
 * @author BuptStEve
 * @param {Object}   article
 * @param {String}   cookie
 * @param {Callback} next
 */
function getTTOneArticleFirstPage(article, cookie, next) {
  superagent
    .get(url.resolve(Config.url.index, article.url))
    .set('Cookie', cookie)
    .end((err, sres) => {
      if (err) return next(`getTTOneArticleFirstPage ${err}`);

      const $ = cheerio.load(sres.text);

      if ($('#m_main > ul').length === 0) {
        ArticleModel.findOneAndUpdate({
          url: article.url,
        }, {
          $set: {
            updateTime: theTime,
            body: '指定的文章不存在或链接错误',
          },
        }, Config.FOAU_OPT, (err) => {
          if (err) return next(err);

          // console.log(doc);
          return next(null, 0);
        });
      } else {
        const pageNum = $('#m_main div').eq(1).find('a.plant').eq(0)
          .text()
          .split('/')[1];
        const raw = $('#m_main > ul.list');

        console.log(url.resolve(Config.url.index, article.url), ': ', pageNum);

        // -- 主贴 --
        const rawArticle = raw.find('li').eq(1);

        // 0.获取作者
        const author = rawArticle.find('div.nav a').eq(1).text();

        // 1.获取发帖的精确时间(秒)
        const submitTimeText = rawArticle.find('div.nav a.plant').eq(1).text();
        const submitTime = new Date(submitTimeText);

        // 2.获取主贴的内容
        const $article = rawArticle.find('div.sp');
        const articleBodyText = $article.text();
        // 处理图片 src 后的主贴 html
        const articleBody = Article.addBaseUrl2Img(Config.url.index, $article, $);
        const articleSummary = Article.generateSummary(Config.url.index, $article, $);

          // -- 跟帖 -- 有没有精彩评论 dom 结构不一样
        const rawComments = $('#m_main > li');
        const tmpComments = [];

        if (rawComments.length === 10) {
          // --- 有精彩评论---
          // 获取回帖的楼层/回帖人/精确时间(秒)/内容
          rawComments.each((idx, elet) => {
            if (idx !== 0) {
              Article.saveComments(article, $(elet), tmpComments, $);
            }
          });
        } else {
          // --- 没有精彩评论 ---
          raw.find('li').each((idx, elet) => {
            if (idx > 2) {
              Article.saveComments(article, $(elet), tmpComments, $);
            }
          });
        }

        const oneArticle = {
          pageNum: pageNum - 1,
          id: '',
        };

        async.series([
          callback => {
            // 更新 article 的 submitTime/lastCommentTime/body
            ArticleModel.findOneAndUpdate({
              url: article.url,
            }, {
              $set: {
                title: article.title,
                author,
                newCmtsCount: article.newCmtsCount,
                ttUpdateTime: theTime,
                updateTime: theTime,
                submitTime,
                pageNum,
                commentsCount: 0, // 更新前重置为0
                summary: articleSummary,
                body: articleBody,
                bodyText: articleBodyText,
              },
            }, Config.FOAU_OPT, (err, doc) => {
              if (err) return callback(err);

              // console.log(doc);
              oneArticle.id = doc.id;

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
                  article: oneArticle.id,
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

          return next(null, oneArticle);
          // next(null, pageNum-1);
        });
      }

      return undefined;
    });
}

/**
 * @desc 根据 articleUrl 得到非第一页下各种回帖.
 * @author BuptStEve
 * @param {Object}   article
 * @param {String}   cookie
 * @param {Callback} next
 */
function getTTOneArticlePage(article, cookie, next) {
  superagent
    .get(url.resolve(Config.url.index, article.url))
    .set('Cookie', cookie)
    .end((err, sres) => {
      if (err) return next(` ${url.resolve(Config.url.index, article.url)} ${err}`);

      const $ = cheerio.load(sres.text);
      const raw = $('#m_main > ul.list');

      console.log('getTTOneArticlePage: ', url.resolve(Config.url.index, article.url));

      // -- 非第一页的跟帖 --
      const tmpComments = []; // 暂时保存回帖
      raw.find('li').each((idx, elet) => {
        if (idx !== 0 && idx !== 2) {
          Article.saveComments(article, $(elet), tmpComments, $);
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

        return undefined;
      }, err => {
        if (err) return next(` tmpComments ${err}`);

        return next(null);
      });

      return undefined;
    });
}

/*
 * @desc 主程序:读取首页的十大帖子,将其保存到数据库中
 * @author BuptStEve
 * @param {String}   cookie
 * @param {Callback} next
 */
function updateTopTen(cookie) {
  theTime = new Date();

  console.time('updateTopTen');
  async.waterfall([
    /*
     * @desc 1.获取首页的十大的链接
     * @author BuptStEve
     * @param {Callback} next
     */
    function getTopTenUrl(next) {
      superagent
        .get(Config.url.index)
        .set('Cookie', cookie)
        .end((err, sres) => {
          if (err) return next(` getTopTenUrl ${err}`);

          const $ = cheerio.load(sres.text);
          const topTenArr = []; // 十大数组:保存 url/title/newCmtsCount/lastCommentTime

          $('#m_main ul.slist li a').each((idx, elet) => {
            const $text = $(elet).text();

            topTenArr.push({
              url: $(elet).attr('href'),
              title: $text.slice(0, $text.lastIndexOf('(')),
              newCmtsCount: $text.slice($text.lastIndexOf('(') + 1, $text.lastIndexOf(')')),
            });
          });

          return next(null, topTenArr);
        });
    },
    /*
     * @desc 2.根据上一步中的十大链接,读取第一页内容，获取页数,并将其保存到数据库.
     * @author BuptStEve
     * @param {Array}    topTenArr
     * @param {Callback} next
     */
    function getTopTenFirstPage(topTenArr, next) {
      const articlesPage = []; // 帖子数组(url 中含页数)

      async.eachLimit(topTenArr, 2, (article, callback) => {
        getTTOneArticleFirstPage(article, cookie, (err, oneArticle) => {
          if (err) return callback(`getTTOneArticleFirstPage ${err}`);

          articlesPage.push({
            url: article.url,
            id: oneArticle.id,
            pageNum: oneArticle.pageNum,
          });

          return callback(null);
        });
      }, err => {
        if (err) return next(`topTenArr ${err}`);

        return next(null, articlesPage);
      });
    },
    /*
     * @desc 3.获取其中的主贴内容和 comments,最后保存进数据库中.
     * @author BuptStEve
     * @param {Array}    articlesPage
     * @param {Callback} next
     */
    function getArticles(articlesPage, next) {
      async.eachLimit(articlesPage, 1, (article, callback) => {
        const articlePages = [];

        for (let i = 2; i < 2 + article.pageNum; i += 1) {
          // 生成数组
          articlePages.push({
            url: `${article.url}?p=${i.toString()}`,
            id: article.id,
          });
        }

        async.eachLimit(articlePages, 2, (articlePage, callback) => {
          getTTOneArticlePage(articlePage, cookie, err => {
            if (err) return callback(err);

            return callback(null);
          });
        }, err => {
          if (err) return callback(err);

          return callback(null);
        });
      }, err => {
        if (err) return next(`articlesPage ${err}`);

        return next(null, 'done');
      });
    },
  ], (err, results) => {
    if (err) return console.log(`updateTopTen err: ${err}`);

    console.log(`${theTime}: ${results}`);
    console.timeEnd('updateTopTen');

    return undefined;
  });
}

module.exports = {
  updateTopTen,
};
