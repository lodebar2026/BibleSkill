/**
 * data/bible.sqlite 的表结构。构建端（data-build）建表写入，读取端（core/db.ts）只读打开。
 * 改表结构要同时改 SCHEMA_VERSION，读取端会拒绝打开版本不符的库。
 */
export const SCHEMA_VERSION = 4;

export const SCHEMA_SQL = `
create table meta (key text primary key, value text not null);

-- 主干词流：旧约 TAHOT（L/Q/R 文本，语素级），新约 TAGNT（NA28 中有的词）
create table token (
  id text primary key,          -- o010010010072 / n40001001003，见 core/ids.ts
  ref text not null,            -- STEPBible 原始引用 Gen.1.1#07=L
  bcv integer not null,         -- 英文版本节号（NRSV）
  ord integer not null,         -- 节内全序（0 起）
  surface text not null,
  after text not null,          -- 词后的空格/标点（希伯来 maqaf、sof pasuq 等）
  translit text not null,
  lemma text not null,
  strong text not null,         -- 扩展 Strong，如 H7225G；希伯来前缀如 H9003
  morph text not null,          -- 希伯来带语言前缀（HNcfsa）；希腊 Robinson（N-NSF）
  gloss_en text not null,       -- STEPBible 语境译词
  gloss_zh text,                -- Macula mandarin（仅映射上的词）
  sense text,                   -- Macula 义项：旧约 sdbh、新约 ln（仅映射上的词），用词统一按它细分
  editions text,                -- 仅新约：NA28+NA27+SBL+...
  text_type text not null,      -- L / Q(K) / NKO …（STEPBible 原始类型码）
  variant_note text,            -- 拼写/意义异文说明
  significant integer not null,  -- 1 = 有影响翻译的异文（STEPBible 大写标记）
  na_bracket integer not null    -- 1 = 在 NA28 双括号 [[ ]] 内（编者判为后加、但印在正文中）
);
create index token_bcv on token(bcv, ord);

-- 不进主干的异文词（新约非 NA28 词、旧约 LXX 补入的 X 文本），只供展示与注释
create table variant_token (
  ref text not null,
  bcv integer not null,
  word_no integer not null,
  pos_id text not null,         -- 在主干词序中的位置（同格式词 id），用来判断落在哪个子句
  significant integer not null, -- 1 = 主要译本中有翻译（KJV 底本、其他版本、LXX 补文）
  surface text not null,
  strong text not null,
  morph text not null,
  gloss_en text not null,
  editions text,
  text_type text not null
);
create index variant_token_bcv on variant_token(bcv);

-- 主干词 ↔ Macula 词（Macula 编号空间，不得写进工作文件）
create table token_macula (
  token_id text not null,
  macula_id text not null,
  primary key (token_id, macula_id)
);

-- Macula lowfat 子句组（已换算成主干词 id），作为子句切分的第二意见
create table seed_clause (
  seed_id text primary key,     -- 以 Macula 首词 id 命名：o010010010011
  bcv_first integer not null,
  bcv_last integer not null,
  parent_seed_id text,
  rule text,
  role text,
  attributive integer not null,
  predicate_token text,
  subject_tokens text,          -- Macula 标为主语（role="s"）的直属成分的主干词 id，逗号分隔；无则 null
  tokens text not null          -- 本子句自身（不含嵌套子句）的主干词 id，逗号分隔、有序
);
create index seed_clause_bcv on seed_clause(bcv_first, bcv_last);

create table lexicon (
  strong text not null,         -- TBESH/TBESG 用扩展 Strong；UBS 用基础号（H0430/A0002/G0976）
  source text not null,         -- TBESH | TBESG | UBS-zh
  lemma text not null,
  translit text,
  pos text,
  gloss text not null,
  definition text not null
);
create index lexicon_strong on lexicon(strong);

create table morph_code (code text primary key, expansion text not null);

-- 构建过程中对不上、被舍弃或作了判断的地方。STEPBible 许可要求记录对数据的改动，这里即是记录。
create table build_report (kind text not null, ref text not null, detail text not null);
create index build_report_kind on build_report(kind);
`;
