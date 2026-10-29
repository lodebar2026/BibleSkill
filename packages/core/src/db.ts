/**
 * data/bible.sqlite 只读访问。MCP server 与 viewer 共用。
 */
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_VERSION } from './db-schema.js';

export type Token = {
  id: string;
  ref: string;
  bcv: number;
  ord: number;
  surface: string;
  after: string;
  translit: string;
  lemma: string;
  strong: string;
  morph: string;
  glossEn: string;
  glossZh: string | null;
  sense: string | null;
  editions: string | null;
  textType: string;
  variantNote: string | null;
  significant: boolean;
  /** 在 NA28 双括号内。 */
  naBracket: boolean;
};

export type VariantToken = {
  ref: string;
  bcv: number;
  wordNo: number;
  posId: string;
  significant: boolean;
  surface: string;
  strong: string;
  morph: string;
  glossEn: string;
  editions: string | null;
  textType: string;
};

export type SeedClause = {
  seedId: string;
  bcvFirst: number;
  bcvLast: number;
  parentSeedId: string | null;
  rule: string | null;
  role: string | null;
  attributive: boolean;
  predicateToken: string | null;
  /** Macula 标为主语的直属成分；无明示主语为空数组。 */
  subjectTokens: string[];
  tokens: string[];
};

/** Macula 短语树的一个结点（wg）。 */
export type SyntaxNode = { id: number; role: string | null; rule: string | null; cls: string | null; clauseType: string | null };

/** 一个主干词在短语树上的位置：词本身的 role，与从句子顶层到所在 wg 的祖先链。 */
export type TokenSyntax = { role: string | null; path: SyntaxNode[] };

export type LexiconEntry = {
  strong: string;
  source: string;
  lemma: string;
  translit: string | null;
  pos: string | null;
  gloss: string;
  definition: string;
};

const TOKEN_COLUMNS = `id, ref, bcv, ord, surface, after, translit, lemma, strong, morph,
  gloss_en as glossEn, gloss_zh as glossZh, sense, editions, text_type as textType, variant_note as variantNote, significant,
  na_bracket as naBracket`;

/** sqlite 布尔列是 0/1。 */
function toToken(row: unknown): Token {
  const record = row as Omit<Token, 'significant' | 'naBracket'> & { significant: number; naBracket: number };
  return { ...record, significant: record.significant === 1, naBracket: record.naBracket === 1 };
}

export class BibleDb {
  private readonly db: DatabaseSync;

  constructor(readonly filePath: string) {
    if (!existsSync(filePath)) {
      throw new Error(`找不到数据库 ${filePath}：先运行 pnpm data:build`);
    }
    this.db = new DatabaseSync(filePath, { readOnly: true });
    const row = this.db.prepare(`select value from meta where key = 'schema_version'`).get() as { value: string } | undefined;
    if (Number(row?.value) !== SCHEMA_VERSION) {
      throw new Error(`数据库 schema 版本 ${row?.value ?? '未知'} 与程序 ${SCHEMA_VERSION} 不符：重新运行 pnpm data:build`);
    }
  }

  tokensInRange(startBcv: number, endBcv: number): Token[] {
    return this.db
      .prepare(`select ${TOKEN_COLUMNS} from token where bcv between ? and ? order by bcv, ord`)
      .all(startBcv, endBcv)
      .map(toToken);
  }

  tokensByIds(ids: string[]): Map<string, Token> {
    const result = new Map<string, Token>();
    const statement = this.db.prepare(`select ${TOKEN_COLUMNS} from token where id = ?`);
    for (const id of ids) {
      const row = statement.get(id);
      if (row) {
        result.set(id, toToken(row));
      }
    }
    return result;
  }

  variantsInRange(startBcv: number, endBcv: number): VariantToken[] {
    return this.db
      .prepare(`select ref, bcv, word_no as wordNo, pos_id as posId, significant, surface, strong, morph, gloss_en as glossEn,
          editions, text_type as textType
        from variant_token where bcv between ? and ? order by bcv, pos_id`)
      .all(startBcv, endBcv)
      .map((row) => ({ ...(row as unknown as VariantToken), significant: (row as { significant: number }).significant === 1 }));
  }

  /** 这些词在短语树上的位置；没挂上树的词（未对齐、NA28 有而 SBL 没有）不在结果里。 */
  syntaxForTokens(ids: string[]): Map<string, TokenSyntax> {
    const result = new Map<string, TokenSyntax>();
    const leaf = this.db.prepare('select node_id as nodeId, role from token_syntax where token_id = ?');
    const chain = this.db.prepare(`with recursive up(id, parent_id, role, rule, class, clause_type, depth) as (
        select id, parent_id, role, rule, class, clause_type, 0 from syntax_node where id = ?
        union all
        select n.id, n.parent_id, n.role, n.rule, n.class, n.clause_type, up.depth + 1 from syntax_node n join up on n.id = up.parent_id)
      select id, role, rule, class as cls, clause_type as clauseType from up order by depth desc`);
    const paths = new Map<number, SyntaxNode[]>();
    for (const id of ids) {
      const row = leaf.get(id) as { nodeId: number; role: string | null } | undefined;
      if (!row) {
        continue;
      }
      if (!paths.has(row.nodeId)) {
        paths.set(row.nodeId, chain.all(row.nodeId) as unknown as SyntaxNode[]);
      }
      result.set(id, { role: row.role, path: paths.get(row.nodeId)! });
    }
    return result;
  }

  seedsInRange(startBcv: number, endBcv: number): SeedClause[] {
    const rows = this.db
      .prepare(`select seed_id as seedId, bcv_first as bcvFirst, bcv_last as bcvLast, parent_seed_id as parentSeedId,
          rule, role, attributive, predicate_token as predicateToken, subject_tokens as subjectTokens, tokens
        from seed_clause where bcv_last >= ? and bcv_first <= ? order by seed_id`)
      .all(startBcv, endBcv) as Array<Omit<SeedClause, 'attributive' | 'tokens' | 'subjectTokens'> & { attributive: number; tokens: string; subjectTokens: string | null }>;
    return rows.map((row) => ({
      ...row,
      attributive: row.attributive === 1,
      subjectTokens: row.subjectTokens ? row.subjectTokens.split(',') : [],
      tokens: row.tokens.split(','),
    }));
  }

  /**
   * 按扩展 Strong 查词典：TBESH/TBESG 精确匹配扩展号，UBS 中文按基础号
   * （希伯来与亚兰文在 STEPBible 里都用 H 号，UBS 亚兰词条用 A 号，两种都查）。
   */
  lookupLexicon(strong: string): LexiconEntry[] {
    const base = strong.slice(0, 5);
    const candidates = [strong, base];
    if (base.startsWith('H')) {
      candidates.push(`A${base.slice(1)}`);
    }
    const placeholders = candidates.map(() => '?').join(', ');
    return this.db
      .prepare(`select strong, source, lemma, translit, pos, gloss, definition from lexicon
        where strong in (${placeholders}) order by case source when 'UBS-zh' then 0 else 1 end, strong`)
      .all(...candidates) as LexiconEntry[];
  }

  morphExpansion(code: string): string | null {
    const row = this.db.prepare('select expansion from morph_code where code = ?').get(code) as { expansion: string } | undefined;
    return row?.expansion ?? null;
  }

  close(): void {
    this.db.close();
  }
}
