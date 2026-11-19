export function debugSolution(q){
 const fn=q.fn||q.debugTools?.fn||q.code?.match(/function (\w+)/)?.[1];
 const fields={countEligible:['count','amount','status',"'paid'",'customer'],countAvailable:['count','qty','enabled','true','name'],sumPaid:['sum','amount','status',"'paid'",'customer'],totalCompleted:['sum','minutes','done','true','name'],groupPaid:['group','amount','status',"'paid'",'customer'],groupHours:['group','hours','approved','true','team'],sumDelivered:['sum','units','delivered','true','name']}[fn];
 if(!fields)throw new Error('No debug fixture for '+fn);const [kind,amount,flag,accepted,key]=fields;
 if(kind==='count')return `function ${fn}(rows,min){return rows.filter(r=>r.${flag}===${accepted}&&r.${amount}>=min).length;}`;
 if(kind==='group')return `function ${fn}(rows){const totals=Object.create(null);for(const r of rows)if(r.${flag}===${accepted})totals[r.${key}]=(totals[r.${key}]||0)+r.${amount};return totals;}`;
 return `function ${fn}(rows){return rows.filter(r=>r.${flag}===${accepted}).reduce((s,r)=>s+r.${amount},0);}`;
}
export function debugCounterexample(variant){
 const a={amount:2,status:'paid',customer:'Ada'},b={amount:3,status:'paid',customer:'Ada'};
 const args=[[[a],2],[[a,b]],[[a,b]],[[[a]],[[b]]]][variant];
 return {testArgs:JSON.stringify(args),testExpected:JSON.stringify([1,5,{Ada:5},[2,3]][variant])};
}
