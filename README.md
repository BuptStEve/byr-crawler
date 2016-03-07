# byr-crawler
一个针对[北邮人论坛移动版][1]的爬虫,

主要目的是为了给 [byrs-news][4] 提供数据.

## 模块构成
* NodeJs 爬虫
* MongoDB 存储数据, Mongoose 进行二者的交互

## Nodejs 爬虫
### step0 登录北邮人论坛(loginByr)
由于有些帖子需要登录权限,因此首先需要模拟登录,之后再进行爬取.

#### 经过测试发现 cookie 最少需要以下三个内容:
* nforum[UTMPKEY]
* nforum[UTMPNUM]
* nforum[UTMPUSERID]

#### 主要步骤:
* 发送 post 消息获取 cookie
* 拼接并保存 cookie

#### 坑: 登录后 302 跳转,导致拿不到正确的 cookie.
因此需要设定 `.redirects(0)`

```javascript
var loginUrl = 'http://m.byr.cn/user/login';
var auth = {
  id    : 'foo',
  passwd: 'bar'
};

superagent
  .post(loginUrl)
  .type('form')
  .send(auth)
  .redirects(0)
  .end(function (err, sres) {
    var rawCookies = sres.headers['set-cookie'];
    var cookie = rawCookies[3].split(';')[0] + '; ' +
                 rawCookies[4].split(';')[0] + '; ' +
                 rawCookies[5].split(';')[0];

    console.log(cookie);
  });
```


### step1 爬取分区下的小分区和版面(updateSections)
#### 首先结构如下:
* 讨论区列表下为10个大分区
* 每个大分区下是版面或是小分区
* 小分区下,都是版面(暂时不存在超过3级的结构)

```
讨论区列表: /section
.
├── 本站站务: /section/0
├── 北邮校园: /section/1
│   ├── 北邮欢迎你: /board/AimBUPT
│   ├── 社团组织: /section/Association
│   │   ├── ACE战队专区: /board/ACETeam
│   │   ├── ...
│   │   └── BUPT魔兽工会: /board/WOWBuptGuild
│   ├── ...
│   └── 助学之家: /board/Selfsupport
├── ...
└── 乡亲乡爱: /section/9
```

观察后决定不爬[0号分区][3]╮(╯_╰)╭.

#### 具体步骤
* 依次获取每个大分区(`url: http://m.byr.cn/section/1~9`)下的内容
* 将大分区下的版面(board)或小分区(subSection,例如[社团组织][2])保存在数据库 Sections 文档中,并生成一个 Board 文档.
* 获取小分区下的版面内容,保存到 Boards 文档中.

### step2 爬取版面下的帖子(updateBoards)
* 根据数据库中的 Boards 文档,获取 pageNum (初次运行时为0).
* 获取版面的第一页,得到: 当前页数, 第一页的各个帖子: 保存在数据库中的一个 Article 文档中.并更新 Board 文档中的最晚发帖时间(lastSubmitTime).
* 若 pageNum 为0,则爬取接下来的每一页(不大于1000页)的所有帖子.(兼职版上万页)
* 若 pageNum 不为0,则进行 [增量更新].

### step3 爬取所有帖子和帖子的评论(updateArticles)
* 根据数据库中的 Articles 文档,获取 pageNum(初次运行时为0).
* 获取帖子的第一页,得到: 当前页数, 主贴, 其余回帖: 保存在数据库中的 comments 文档中.
* 若 pageNum 为0,则爬取接下来的每一页所有回帖.
* 若 pageNum 不为0,则进行 [增量更新].

### step4 定时爬取十大热贴(updateTopTen)
* 1.获取首页十大热贴的 url 链接.
* 2.根据上一步中的十大链接,读取第一页内容，获取页数,并将其保存到数据库.
* 3.获取其中的主贴内容和 comments,最后保存进数据库中.（此处未采用增量更新）

#### 增量更新:
* 页数没变: 获取最新1页的回帖.
* 页数变少: 说明有删帖,获取最新的1页.
* 页数变多: 从原页数开始获取到最新页数.

## Mongoose 进行二者的交互
### 配置与连接
```javascript
var mongoose = require('mongoose');
// var dbConnectionString = 'mongodb://username:passwork@hostname:port/databasename';
var dbConnectionString = 'mongodb://localhost/byr-crawler-demo';

mongoose.connect(dbConnectionString);
```

### Model 与 Schema: 实现模式化数据存储
```javascript
// 1.分区(section)
var SectionSchema = new Schema({
  url        : String,   // 地址: http://m.byr.cn/section/1
  title      : String,   // 标题: 北邮校园
  subSections: [String], // 子分区数组
  boards     : [String]  // 版面数组
});

// 2.版面(board)
var BoardSchema = new Schema({
  url           : String, // 地址: http://m.byr.cn/board/WWWTechnology
  title         : String, // 标题: WWW技术
  pageNum       : {       // 页数: 108
    type   : Number,
    default: 0
  },
  lastSubmitTime: {       // 最新回复时间: 2016-01-17
    type   : Date,
    default: new Date(0)
  }
});

// 3.帖子(article)
var ArticleSchema = new Schema({
  url             : String, // 地址: http://m.byr.cn/article/WWWTechnology/33098
  board           : String, // 所属版面(含页数)
  title           : String, // 标题: [心得]做了个 css3 flex 属性的学习小 demo ～=￣ω￣=～
  author          : String, // 作者: steveyoung
  pageNum         : {       // 页数: 1
    type: Number,
    default: 0
  },
  body            : String, // 帖子内容(html)
  summary         : String, // 摘要内容(html)
  commentsCount   : Number, // 回贴数量
  newCommentsCount: Number, // 新回贴数量(十大贴才有)
  ttUpdateTime    : Date,   // 十大更新时间(十大贴才有): 2015-12-23 16:31:06
  updateTime      : Date,   // 更新时间: 2015-12-23 16:31:06
  submitTime      : Date,   // 发布时间: 2015-12-23 16:31:06
  lastCommentTime : {       // 最新回复时间: 2015-12-23 16:31:06
    type   : Date,
    default: new Date(0)
  }
});

// 4.回帖(comment)
var CommentSchema = new Schema({
  url       : String, // 地址(哈希表示): http://m.byr.cn/article/WWWTechnology/33098#1
  article   : String, // 所属帖子在数据库中的 _id: 56ad9b7568f674b26110a5e8
  author    : String, // 作者: reverland
  body      : String, // 回帖内容(html)
  submitTime: Date    // 发布时间: 2015-12-23 19:09:02
});

mongoose.model('Section', SectionSchema);
mongoose.model('Board', BoardSchema);
mongoose.model('Article', ArticleSchema);
mongoose.model('Comment', CommentSchema);
```

### CRUD 操作
```javascript
// 常用操作 findOneAndUpdate: 插入/更新时使用,由于不确定是否已存在.
var FOAU_OPT = {
  new   : true, // 返回新的文档
  upsert: true  // 如果不存在则插入
  // TODO: select, 指定返回的 fields
};

BoardModel.findOneAndUpdate({
  url: board.url
}, {
  $set: { title: board.title }
}, FOAU_OPT, function (err, doc) {
  if (err) { return next(err);  }
  // console.log(doc);
});

// 常用操作 update: 确定文档已经存在.
BoardModel.update({
  url: board.url
}, {
  $set: {
    lastSubmitTime: boardLastSubmitTime
  }
}, function (err, doc) {
  if (err) { return callback(err); }
  // console.log(doc);
});
```

---
[1]: http://m.byr.cn "北邮人论坛移动版"
[2]: http://m.byr.cn/section/Association "社团组织"
[3]: http://m.byr.cn/section/0 "本站站务"
[4]: https://github.com/BuptStEve/byrs-news "byrs-news"




