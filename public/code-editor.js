// A small textarea enhancement: preserve the learner's source and native editing.
export function bindCodeEditor(textarea){
 if(!textarea)return null;
 const frame=document.createElement('div');frame.className='code-editor';
 const gutter=document.createElement('div');gutter.className='editor-gutter';gutter.setAttribute('aria-hidden','true');
 const numbers=document.createElement('div');gutter.append(numbers);
 const status=document.createElement('p');status.className='editor-status';
 textarea.before(frame);frame.append(gutter,textarea);frame.after(status);
 textarea.setAttribute('wrap','off');textarea.setAttribute('aria-label','代码编辑区');textarea.autocapitalize='off';textarea.autocomplete='off';
 let marked=null;
 function update(){
  const count=textarea.value.split('\n').length;
  numbers.replaceChildren(...Array.from({length:count},(_,i)=>{const line=document.createElement('span');line.textContent=i+1;if(marked===i+1)line.className='error-line';return line;}));
  const before=textarea.value.slice(0,textarea.selectionStart),rows=before.split('\n');
  status.textContent=`第 ${rows.length} 行 · 第 ${rows.at(-1).length+1} 列 · 回车延续缩进`;
  numbers.style.transform=`translateY(${-textarea.scrollTop}px)`;
 }
 const onInput=()=>{marked=null;update();};
 const scroll=()=>{numbers.style.transform=`translateY(${-textarea.scrollTop}px)`;};
 const indent=event=>{
  if(event.key!=='Enter'||event.isComposing||event.ctrlKey||event.metaKey||textarea.selectionStart!==textarea.selectionEnd)return;
  const position=textarea.selectionStart,before=textarea.value.slice(0,position),current=before.split('\n').at(-1),base=current.match(/^\s*/)[0];
  const extra=/[{[(]\s*$/.test(current)?'  ':'';
  const pair=extra&&/^\s*[}\])]/.test(textarea.value.slice(position));
  const text='\n'+base+extra+(pair?'\n'+base:'');
  event.preventDefault();
  // insertText keeps Chrome's undo history; the fallback retains source and selection.
  if(!document.execCommand('insertText',false,text)){textarea.setRangeText(text,position,position,'end');textarea.dispatchEvent(new Event('input',{bubbles:true}));}
  if(pair)textarea.setSelectionRange(position+1+base.length+extra.length,position+1+base.length+extra.length);
  update();
 };
 textarea.addEventListener('input',onInput);textarea.addEventListener('scroll',scroll);textarea.addEventListener('click',update);textarea.addEventListener('keyup',update);textarea.addEventListener('select',update);textarea.addEventListener('keydown',indent);update();
 return {refresh:update,clear(){marked=null;update();},locate(line,column){
  const rows=textarea.value.split('\n');if(!Number.isInteger(line)||line<1||line>rows.length)return;
  marked=line;const start=rows.slice(0,line-1).reduce((n,s)=>n+s.length+1,0),col=Math.max(0,Math.min((column||1)-1,rows[line-1].length));
  textarea.focus();textarea.setSelectionRange(start+col,column?Math.min(start+col+1,start+rows[line-1].length):start+rows[line-1].length);
  const height=parseFloat(getComputedStyle(textarea).lineHeight)||22;textarea.scrollTop=Math.max(0,(line-3)*height);textarea.scrollIntoView({block:'center',behavior:'smooth'});update();
 },dispose(){textarea.removeEventListener('input',onInput);textarea.removeEventListener('scroll',scroll);textarea.removeEventListener('click',update);textarea.removeEventListener('keyup',update);textarea.removeEventListener('select',update);textarea.removeEventListener('keydown',indent);}};
}
