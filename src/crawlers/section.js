/*
 * @Author: BuptStEve
 * @Date:   2016-01-21 15:21:31
 * @Last modified by:   steve
 * @Last modified time: 2016-Aug-06 06:46:54
 */

/* eslint no-shadow: ["error", { "allow": ["cookie", "next", "err", "callback"] }] */

import url from 'url';
import cheerio from 'cheerio';
import superagent from 'superagent';

import { mapLimit, findOneAndUpdate } from '../utils';
import BoardModel from '../models/board.js';
import SectionModel from '../models/section.js';

const CONCURRENT_NUM = 2;

/*
 * @desc step1 爬取分区下的小分区和版面(updateSections)
 * 依次获取每个大分区(`url: http://m.byr.cn/section/1~9`)下的内容
 * 将大分区下有版面(board)或小分区(subSection,例如[社团组织][2])保存在数据库 Section 文档中,并生成 Board 文档.
 * 获取小分区下的版面内容,保存到 Board 文档中.
 * @author BuptStEve
 * @param {Object} cfg 配置
 */
async function updateSections(cfg) {
  console.time('updateSections');

  /* -- 1.生成顶级分区的 url -- */
  const sectionUrls = [];
  const START = cfg.section.SECTION_START;
  const END = cfg.section.SECTION_END;

  for (let i = START; i <= END; i++) {
    sectionUrls.push(`/section/${i}`);
  }

  /* -- 2.获取大分区下的 subSections 和 boards -- */
  let allSubSectionUrls = []; // 所有小分区

  await mapLimit(sectionUrls, CONCURRENT_NUM, async (sectionUrl) => {
    const subSectionUrls = await getOneSection(sectionUrl, cfg);

    allSubSectionUrls = allSubSectionUrls.concat(subSectionUrls);
  });

  /* -- 3.获取 subSections 下的 boards(获取了全部的 boards) -- */
  await mapLimit(allSubSectionUrls, CONCURRENT_NUM, async (subSectionUrl) => {
    await getOneSection(subSectionUrl, cfg);
  });

  console.timeEnd('updateSections');
}

/**
 * @desc 根据 sectionUrl 得到分区标题和分区下的版面或小分区,分别将其保存在 subSections/boards 中
 * @author BuptStEve
 * @param {String} sectionUrl 分区的 url
 * @param {Object} cfg 配置
 */
async function getOneSection(sectionUrl, cfg) {
  const realUrl = url.resolve(cfg.url.index, sectionUrl);

  try {
    const res = await superagent
      .get(realUrl)
      .set('Cookie', cfg.cookie);

    const $ = cheerio.load(res.text);
    // 获取标题,去掉「讨论区-」
    const title = $('#wraper div.menu').eq(0).text().slice(4);
    // -- wrapper 拼错了喂！！！--

    console.log(`${title}: ${realUrl}`);

    const tmpSectionUrls = []; // 小分区链接
    const tmpBoardUrls = []; // 版面链接
    const tmpBoards = []; // 版面:链接+标题
    const $sectionLinks = $('#m_main ul.slist li a');

    $sectionLinks.each((idx, elet) => {
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
        console.error(`WTF! Please check ${title}: ${realUrl}`);
      }
    });

    // 更新 Section 文档
    const findOneOpt = { url: sectionUrl };
    const saveOpt = {
      url: sectionUrl,
      title,
      subSections: tmpSectionUrls,
      boards: tmpBoardUrls,
    };
    const updateOpt = {
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
    };

    await findOneAndUpdate(SectionModel, findOneOpt, saveOpt, updateOpt);

    // 更新 Board 文档
    tmpBoards.forEach(async (board) => {
      const boardFindOneOpt = { url: board.url };
      const boardSaveOpt = {
        url: board.url,
        title,
        subSections: tmpSectionUrls,
        boards: tmpBoardUrls,
      };
      const boardUpdateOpt = {
        $set: {
          url: board.url,
          title: board.title,
        },
      };

      await findOneAndUpdate(BoardModel, boardFindOneOpt, boardSaveOpt, boardUpdateOpt);
    });

    return tmpSectionUrls;
  } catch (e) {
    throw e;
  }
}

export default updateSections;
