/**
 * 实词判定：用词统一只强制检查实词（名词、动词、形容词含数词、专名）。
 * 虚词（介词、连词、冠词、代词、小品词、希伯来前后缀）允许随中文语法变化。
 *
 * - 希伯来/亚兰词法带语言前缀：`HNcmsa`、`AVqp3ms`，第二个字符是词类
 * - 希腊 Robinson 词法：`N-NSF`、`V-AAI-3S`、`A-NPF`
 * - STEPBible 的 H9xxx 是前缀/后缀等功能语素
 */
export function isContentWord(morph: string, strong: string): boolean {
  if (/^H9\d{3}/.test(strong)) {
    return false;
  }
  if (/^[HA][A-Za-z]/.test(morph) && !morph.includes('-')) {
    return ['N', 'V', 'A'].includes(morph.charAt(1));
  }
  return /^(N|V|A)-/.test(morph);
}
