import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectClauseGroups, directPredicateWord, directWords } from './clause-groups.js';
import { parseTree, type Node, type WordNode } from './lowfat-xml.js';

const w = (id: string, text: string, extra = '') => `<w xml:id="${id}" ${extra}>${text}</w>`;
const verb = (id: string, text: string, mood: string, role = '') => w(id, text, `class="verb" mood="${mood}"${role ? ` role="${role}"` : ''}`);
const text = (words: WordNode[]) => words.map((word) => word.attrs['xml:id']).join(' ');
const rules = (node: Node) => collectClauseGroups(node).map((site) => site.clause.attrs.rule);

// 徒 8:27b-28 的 lowfat 结构（照抄 macula-greek SBLGNT/lowfat/05-acts.xml，只留结构与用到的属性）
const ACTS_8_28 = `<sentence>
<wg class="cl" rule="ClCl2">
  <wg class="cl" rule="S-V">
    <wg class="np" role="s">${w('aner', 'ἀνὴρ')}</wg>
    <wg rule="BeVerb" class="vp" role="v">
      ${verb('en', 'ἦν', 'indicative')}
      <wg rule="EitherOrVp" class="vp">
        <wg type="group">${w('te', 'τε')}${verb('hypostrephon', 'ὑποστρέφων', 'participle')}</wg>
        <wg type="group">${w('kai1', 'καὶ')}
          <wg class="cl" rule="V-ADV">
            ${verb('kathemenos', 'καθήμενος', 'participle', 'v')}
            <wg class="pp" rule="PrepNp" role="adv">${w('epi', 'ἐπὶ')}<wg class="np" rule="DetNP">${w('tou', 'τοῦ')}${w('harmatos', 'ἅρματος')}${w('autou', 'αὐτοῦ')}</wg></wg>
          </wg>
        </wg>
      </wg>
    </wg>
  </wg>
  <wg type="group">${w('kai2', 'καὶ')}
    <wg class="cl" rule="V-O">${verb('aneginosken', 'ἀνεγίνωσκεν', 'indicative', 'v')}<wg class="np" role="o">${w('prophetes', 'τὸν προφήτην')}</wg></wg>
  </wg>
</wg>
</sentence>`;

test('徒 8:28 迂说结构：BeVerb 里的分词小句 καθήμενος ἐπὶ τοῦ ἅρματος αὐτοῦ 不另立种子，并进 ἦν 所在子句，谓词仍是 ἦν', () => {
  const sentence = parseTree(ACTS_8_28).children[0]!;
  assert.deepEqual(rules(sentence), ['ClCl2', 'S-V', 'V-O']);
  const sv = collectClauseGroups(sentence).find((site) => site.clause.attrs.rule === 'S-V')!.clause;
  assert.equal(text(directWords(sv)), 'aner en te hypostrephon kai1 kathemenos epi tou harmatos autou');
  assert.equal(directPredicateWord(sv)?.attrs['xml:id'], 'en');
});

// 徒 22:20：并进来的分词小句里，名词化分词（τῶν ἀναιρούντων αὐτόν）在名词短语之内，是真正的从属子句，照旧单列
const ACTS_22_20 = `<sentence>
<wg class="cl" rule="S-V">
  <wg class="np" role="s">${w('autos', 'αὐτὸς')}</wg>
  <wg rule="BeVerb" class="vp" role="v">
    ${verb('emen', 'ἤμην', 'indicative')}
    <wg rule="Conj3CL" class="cl">
      ${verb('ephestos', 'ἐφεστὼς', 'participle')}
      <wg type="group">${w('kai', 'καὶ')}
        <wg class="cl" rule="V-O">
          ${verb('phylasson', 'φυλάσσων', 'participle', 'v')}
          <wg class="np" rule="DetNP" role="o">${w('ta', 'τὰ')}
            <wg class="np" rule="NPofNP">${w('himatia', 'ἱμάτια')}
              <wg rule="DetCL" class="cl">${w('ton', 'τῶν')}
                <wg class="cl" rule="V-O">${verb('anairounton', 'ἀναιρούντων', 'participle', 'v')}${w('auton', 'αὐτόν', 'role="o"')}</wg>
              </wg>
            </wg>
          </wg>
        </wg>
      </wg>
    </wg>
  </wg>
</wg>
</sentence>`;

test('徒 22:20 迂说结构：并列的分词小句都并进 ἤμην 所在子句，其中名词短语里的名词化分词照旧单列', () => {
  const sentence = parseTree(ACTS_22_20).children[0]!;
  assert.deepEqual(rules(sentence), ['S-V', 'DetCL', 'V-O']);
  const sv = collectClauseGroups(sentence)[0]!.clause;
  assert.equal(text(directWords(sv)), 'autos emen ephestos kai phylasson ta himatia');
  assert.equal(directPredicateWord(sv)?.attrs['xml:id'], 'emen');
});
