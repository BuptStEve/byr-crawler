/*
* @Author: BuptStEve
* @Date:   2016-01-21 15:21:31
* @Last Modified by:   BuptStEve
* @Last Modified time: 2016-03-07 15:04:12
*/

'use strict';

var url        = require('url'),
    async      = require('async'),
    cheerio    = require('cheerio'),
    superagent = require('superagent');

var Config       = require('../config.js'),
    ArticleModel = require('../models/article.js'),
    CommentModel = require('../models/comment.js');

var theTime = new Date(); //保证每次更新时间一致

/*
 * @desc 主程序:读取首页的十大帖子,将其保存到数据库中
 * @author BuptStEve
 * @param {String}   cookie
 * @param {Callback} next
 */
function updateTopTen(cookie, next) {
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
        .set("Cookie", cookie)
        .end(function (err, sres) {
          if (err) { return next(' getTopTenUrl' + err); }

          var $         = cheerio.load(sres.text);
          var topTenArr = []; // 十大数组:保存 url/title/newCommentsCount/lastCommentTime

          $("#m_main ul.slist li a").each(function (idx, elet) {
            var $text = $(elet).text();

            topTenArr.push({
              url             : $(elet).attr('href'),
              title           : $text.slice(0, $text.lastIndexOf('(')),
              newCommentsCount: $text.slice($text.lastIndexOf('(') + 1, $text.lastIndexOf(')'))
            });
          });

          next(null, topTenArr);
        });
    },
    /*
     * @desc 2.根据上一步中的十大链接,读取第一页内容，获取页数,并将其保存到数据库.
     * @author BuptStEve
     * @param {Array}    topTenArr
     * @param {Callback} next
     */
    function getTopTenFirstPage(topTenArr, next) {
      var articlesPage = []; // 帖子数组(url 中含页数)

      async.eachLimit(topTenArr, 2, function(article, callback) {
        getTTOneArticleFirstPage(article, cookie, function(err, oneArticle) {
          if (err) { return callback('getTTOneArticleFirstPage ' + err); }

          articlesPage.push({
            url    : article.url,
            _id    : oneArticle._id,
            pageNum: oneArticle.pageNum
          });

          callback(null);
        });
      }, function(err) {
        if (err) { return next('topTenArr ' + err); }

        next(null, articlesPage);
      });
    },
    /*
     * @desc 3.获取其中的主贴内容和 comments,最后保存进数据库中.
     * @author BuptStEve
     * @param {Array}    articlesPage
     * @param {Callback} next
     */
    function getArticles(articlesPage, next) {
      async.eachLimit(articlesPage, 1, function(article, callback) {
        var articlePages = [];

        var i = 2;
        for (i = 2; i < 2+article.pageNum; i += 1) {
          // 生成数组
          articlePages.push({
            url: article.url + '?p=' + i.toString(),
            _id: article._id
          });
        }

        async.eachLimit(articlePages, 2, function(articlePage, callback) {
          getTTOneArticlePage(articlePage, cookie, function(err) {
            if (err) { return callback(err); }

            callback(null);
        });
        }, function(err) {
          if (err) { return callback(err); }

          callback(null);
        });

      }, function(err) {
        if (err) { return next('articlesPage ' + err); }

        next(null, 'done');
      });
    }
  ], function(err, results) {
    if (err) {
      return console.log('updateTopTen err: ' + err);
    }
    console.log(theTime + ': ' + results);
    console.timeEnd('updateTopTen');
  });
}

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
    .end(function (err, sres) {
      if (err) { return next('getTTOneArticleFirstPage ' + err); }

      var $ = cheerio.load(sres.text);

      if ($("#m_main > ul").length === 0) {
        ArticleModel.findOneAndUpdate({
          url: article.url
        }, {
          $set: {
            updateTime: theTime,
            body      : "指定的文章不存在或链接错误"
          }
        }, Config.FOAU_OPT, function (err, doc) {
          if (err) { return next(err); }
          // console.log(doc);
          next(null, 0);
        });
      }
      else {
        var pageNum = $("#m_main div").eq(1).find('a.plant').eq(0).text().split('/')[1];
        var raw     = $("#m_main>ul.list");

        console.log(url.resolve(Config.url.index, article.url), ': ', pageNum);

        //-- 主贴 --
        var rawArticle     = raw.find("li").eq(1);

        // 0.获取作者
        var author = rawArticle.find('div.nav a').eq(1).text();

        // 1.获取发帖的精确时间(秒)
        var submitTimeText = rawArticle.find('div.nav a.plant').eq(1).text();
        var submitTime     = new Date(submitTimeText);

        // 2.获取主贴的内容
        var $article        = rawArticle.find('div.sp');
        var articleBodyText = $article.text();
        var articleBody     = addBaseUrl2Img(Config.url.index, $article, $); // 处理图片 src 后的主贴 html
        var articleSummary  = generateSummary(Config.url.index, $article, $);
        // console.log(articleBody);

        //-- 跟帖 -- 有没有精彩评论 dom 结构不一样
        var rawComments = $("#m_main>li");
        var tmpComments = [];

        if (rawComments.length === 10) {
          //--- 有精彩评论---
          // 获取回帖的楼层/回帖人/精确时间(秒)/内容
          rawComments.each(function(idx, elet) {
            if (idx !== 0) {
              saveComments(article, $(elet), tmpComments, $);
            }
          });
        }
        else {
          //--- 没有精彩评论 ---
          raw.find('li').each(function(idx, elet) {
            if (idx > 2) {
              saveComments(article, $(elet), tmpComments, $);
            }
          });
        }

        var oneArticle = {
          pageNum: pageNum-1,
          _id    : ''
        };

        async.series([
          function(callback) {
            // 更新 article 的 submitTime/lastCommentTime/body
            ArticleModel.findOneAndUpdate({
              url: article.url
            }, {
              $set: {
                title           : article.title,
                author          : author,
                newCommentsCount: article.newCommentsCount,
                ttUpdateTime    : theTime,
                updateTime      : theTime,
                submitTime      : submitTime,
                pageNum         : pageNum,
                commentsCount   : 0,  // 更新前重置为0
                summary         : articleSummary,
                body            : articleBody,
                bodyText        : articleBodyText
              }
            }, Config.FOAU_OPT, function (err, doc) {
              if (err) { return callback(err); }
              // console.log(doc);
              oneArticle._id = doc._id;

              callback(null);
            });
          },
          function(callback) {
            // 保存评论到数据库
            async.each(tmpComments, function(comment, callback) {
              CommentModel.findOneAndUpdate({
                url: comment.url
              }, {
                $set: {
                  article   : oneArticle._id,
                  author    : comment.author,
                  submitTime: comment.submitTime,
                  body      : comment.body
                }
              }, Config.FOAU_OPT, function (err, doc) {
                if (err) { return callback(err); }
                // console.log(doc);
                callback(null);
              });
            }, function(err) {
              if (err) { return callback(err); }

              callback(null);
            });
          }
        ], function(err) {
          if (err) { return next(err); }

          next(null, oneArticle);
          // next(null, pageNum-1);
        });
      }
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
    .end(function (err, sres) {
      if (err) { return next(' ' + url.resolve(Config.url.index, article.url) + ' ' + err); }

      var $   = cheerio.load(sres.text);
      var raw = $("#m_main > ul.list");

      console.log('getTTOneArticlePage: ', url.resolve(Config.url.index, article.url));

      //-- 非第一页的跟帖 --
      var tmpComments = []; // 暂时保存回帖
      raw.find('li').each(function(idx, elet) {
        if (idx !== 0 && idx !== 2) {
          saveComments(article, $(elet), tmpComments, $);
        }
      });

      // 保存评论到数据库
      async.each(tmpComments, function(comment, callback) {
        CommentModel.findOneAndUpdate({
          url: comment.url
        }, {
          $set: {
            article   : comment.article,
            author    : comment.author,
            submitTime: comment.submitTime,
            body      : comment.body
          }
        }, Config.FOAU_OPT, function (err, doc) {
          if (err) { return callback(err); }
          // console.log(doc);
          callback(null);
        });
      }, function(err) {
        if (err) { return next(' tmpComments' + err); }

        next(null);
      });
    });
}

/**
 * @desc 把 $elet 中的回帖信息保存到 tmpComments 数组中
 * @author BuptStEve
 * @param {Object} article
 * @param {Object} $elet
 * @param {Object} tmpComments
 * @param {Object} $
 */
function saveComments(article, $elet, tmpComments, $) {
  var rank        = $elet.find('div.nav a.plant').eq(0).text().split('楼')[0]; // 楼数
  var author      = $elet.find('div.nav a').eq(1).text();                      // 回帖人
  var commentTime = new Date($elet.find('div.nav a.plant').eq(1).text());      // 回帖时间
  var $comment    = $elet.find('div.sp');
  var commentBody = addBaseUrl2Img(Config.url.index, $comment, $);             // 回帖内容(html)

  tmpComments.push({
    url       : article.url + '#' + rank,
    article   : article._id,
    author    : author,
    submitTime: commentTime,
    body      : commentBody
  });
}

/**
 * @desc 将主贴和回帖中的各种图片加上 baseUrl
 * @author BuptStEve
 * @param  {String} baseUrl
 * @param  {Object} $content
 * @param  {Object} $
 * @return {String} html
 */
function addBaseUrl2Img(baseUrl, $content, $) {
  $content.find('a').each(function(idx, elet) {
    var originSrc = $(elet).attr('href');
    $(elet).attr('href', url.resolve(baseUrl, originSrc));
  });

  $content.find('img').each(function(idx, elet) {
    var originSrc = $(elet).attr('src');
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
  var firstImg = {};
  var isDone   = false;

  $summary.find('img').each(function(idx, elet) {
    // console.log($(elet).attr('src').split(baseUrl));

    if (!isDone &&
      ($(elet).attr('src').split(baseUrl).length === 1 ||
        $(elet).attr('src').split(baseUrl).length > 1 &&
        $(elet).attr('src').split(baseUrl)[1].split('/')[0] === 'att')
      ) {
      // 站外图片或站内的 att 图片
      isDone   = true;
      firstImg = elet;
    }
    $(elet).remove();
  });

  $summary.html(_.truncate($summary.text(), {'length': '200'}));

  if (firstImg !== {}) {
    $(firstImg).addClass('bn-inline-img');
    $summary.prepend(firstImg);
  }

  // console.log('firstImg: ', firstImg);
  // console.log('$summary: ', $summary);

  return $summary.html();
}

module.exports = {
  updateTopTen: updateTopTen
};
