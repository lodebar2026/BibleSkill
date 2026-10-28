/** 逻辑关系（语义上的修饰）：可与句法挂接（parentId）不同。不依赖其他模块，查看器也能直接引用。 */
export const LOGIC_RELATIONS = ['cause', 'purpose', 'result', 'condition', 'time', 'concession', 'contrast', 'content', 'sequence', 'elaboration', 'comparison'] as const;

export type LogicRelation = (typeof LOGIC_RELATIONS)[number];

export const LOGIC_LABELS: Record<LogicRelation, string> = {
  cause: '原因', purpose: '目的', result: '结果', condition: '条件', time: '时间', concession: '让步',
  contrast: '对比', content: '内容', sequence: '承接', elaboration: '说明', comparison: '比较',
};
