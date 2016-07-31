/*
 * @Author: BuptStEve
 * @Date:   2016-01-21 15:21:31
 * @Last modified by:   steve
 * @Last modified time: 2016-Jul-31 01:55:53
 */

/* eslint no-console: ["error", { allow: ["warn", "error", "time", "timeEnd", "log"] }] */
/* eslint no-shadow: ["error", { "allow": ["cookie", "next", "err", "callback"] }] */

const url = require('url');
const async = require('async');
const cheerio = require('cheerio');
const superagent = require('superagent');

const Config = require('../config.js');
const BoardModel = require('../models/board.js');
const SectionModel = require('../models/section.js');

/**
 * @desc 根据 sectionUrl 得到分区标题和分区下的版面或小分区,分别将其保存在 subSections/boards 中
 * @author BuptStEve
 * @param {String}   sectionUrl
 * @param {String}   cookie
 * @param {Callback} next
 */
function getOneSection(sectionUrl, cookie, next) {
  superagent
    .get(url.resolve(Config.url.index, sectionUrl))
    .set('Cookie', cookie)
    .end((err, sres) => {
      if (err) return next(err);

      const $ = cheerio.load(sres.text);
      const title = $('#wraper div.menu').eq(0).text().slice(4); // 获取标题,去掉「讨论区-」
      // -- wrapper 拼错了喂！！！--

      console.log(`${title}: ${url.resolve(Config.url.index, sectionUrl)}`);

      const tmpSectionUrls = []; // 小分区链接
      const tmpBoardUrls = []; // 版面链接
      const tmpBoards = []; // 版面:链接+标题

      $('#m_main ul.slist li a').each((idx, elet) => {
        const $elet = $(elet);
        const href = $elet.attr('href');
        const subTitle = $elet.text();
        const hrefPart = href.split('/')[1];

        if (hrefPart === 'section') {
          // 匹配到了小分区
          tmpSectionUrls.push(href);
        } else if (hrefPart === 'board') {
          // 匹配到了 board
          tmpBoardUrls.push(href);

          tmpBoards.push({
            url: href,
            title: subTitle,
          });
        } else {
          // 错误处理
          next(`WTF! Please check ${title}: ${url.resolve(Config.url.index, sectionUrl)}`);
        }
      });

      async.parallel([
        callback => {
          // 更新 Section 文档
          SectionModel.findOneAndUpdate({
            url: sectionUrl,
          }, {
            $set: {
              title,
            },
            $addToSet: {
              subSections: {
                $each: tmpSectionUrls,
              },
              boards: {
                $each: tmpBoardUrls,
              },
            },
          }, Config.FOAU_OPT, (err) => {
            if (err) return callback(err);

            return callback(null);
          });
        },
        callback => {
          // 更新 Board 文档
          async.each(tmpBoards, (board, callback) => {
            BoardModel.findOneAndUpdate({
              url: board.url,
            }, {
              $set: {
                url: board.url,
                title: board.title,
              },
            }, Config.FOAU_OPT, (err) => {
              if (err) return callback(err);

              return callback(null);
            });
          }, err => {
            if (err) return callback(err);

            return callback(null);
          });
        },
      ], err => {
        if (err) return next(err);

        return next(null, tmpSectionUrls);
      });

      return undefined;
    });
}


/*
 * @desc step1 爬取分区下的小分区和版面(updateSections)
 * 依次获取每个大分区(`url: http://m.byr.cn/section/1~9`)下的内容
 * 将大分区下有版面(board)或小分区(subSection,例如[社团组织][2])保存在数据库 Section 文档中,并生成 Board 文档.
 * 获取小分区下的版面内容,保存到 Board 文档中.
 * @author BuptStEve
 */
function updateSections(cookie, next) {
  console.time('updateSections');
  async.waterfall([
    /*
     * @desc 1.生成顶级分区的 url
     * @author BuptStEve
     */
    function generateTopSectionUrls(next) {
      const sectionUrls = [];

      for (let i = Config.section.SECTION_START; i <= Config.section.SECTION_END; i += 1) {
        sectionUrls.push(`/section/${i.toString()}`);
      }

      next(null, sectionUrls);
    },
    /*
     * @desc 2.获取大分区下的 subSections 和 boards
     * @author BuptStEve
     */
    function getTopSections(sectionUrls, next) {
      let allSubSectionUrls = []; // 所有小分区

      async.eachLimit(sectionUrls, 2, (sectionUrl, callback) => {
        getOneSection(sectionUrl, cookie, (err, subSectionUrls) => {
          if (err) return next(err);

          allSubSectionUrls = allSubSectionUrls.concat(subSectionUrls);
          return callback(null);
        });
      }, err => {
        if (err) {
          return next(err);
        }

        return next(null, allSubSectionUrls);
      });
    },
    /*
     * @desc 3.获取 subSections 下的 boards(获取了全部的 boards)
     * @author BuptStEve
     */
    function getSubSections(subSectionUrls, next) {
      async.eachLimit(subSectionUrls, 2, (subSectionUrl, callback) => {
        getOneSection(subSectionUrl, cookie, err => {
          if (err) return next(err);

          return callback(null);
        });
      }, err => {
        if (err) {
          return next(err);
        }

        return next(null, 'done');
      });
    },
  ], (err, results) => {
    if (err) return next(`updateSections: ${err}`);

    console.log('results: ', results);
    console.timeEnd('updateSections');
    return next(null);
  });
}

module.exports = {
  updateSections,
};
