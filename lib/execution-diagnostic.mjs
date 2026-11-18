// Only student.js locations may become editor links; harness locations never do.
export function executionDiagnostic(error,code='',phase='execution'){
 const raw=String(error?.stack||error),name=error?.name||'Error',message=String(error?.message||error);
 const match=raw.match(/student\.js:(\d+):(\d+)/)||raw.match(/student\.js:(\d+)/);
 const lines=String(code).split('\n').length;
 const end=name==='SyntaxError'&&/Unexpected end of input/.test(message);
 const location=match?{line:Math.min(Number(match[1]),lines),column:match[2]?Number(match[2]):null,approximate:end}:{};
 if(phase==='probe')return {kind:'verification',title:'函数组合需要人工核对',message:'这项规则未能自动确认，不能据此判定业务逻辑有误。请保留原代码，由教师核对实际调用关系。'};
 if(/timed out|timeout/i.test(message))return {kind:'timeout',title:'运行超时',message:'程序未在限定时间内结束。检查循环条件和每次循环是否推进。',...location};
 if(name==='SyntaxError')return {kind:'syntax',title:'代码尚未完整解析',message:end?'代码在结束时仍未闭合。请检查括号、引号或注释；末行是发现问题的位置，不一定是遗漏的位置。':'存在语法错误。请检查标记位置及其前一行的括号、标点和表达式。',...location};
 if(name==='ReferenceError')return {kind:'reference',title:'使用了未定义的名称',message:'检查变量或函数名称的拼写、声明位置及作用域。',...location};
 if(name==='TypeError')return {kind:'type',title:'当前值不支持这项操作',message:'检查这里使用的值是否为空、类型是否符合要求，以及被调用的名称是否为函数。',...location};
 return {kind:'runtime',title:'执行遇到问题',message:'请结合失败输入，检查相关代码的执行过程。',...location};
}
