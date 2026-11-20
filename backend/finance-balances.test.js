const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculate, statement, load, brDay } = require('./finance-balances');
const row = (sourceId, data, valor, tipo = 'despesa') => ({ sourceId, data, valor, tipo, descricao: 'Movimento fictício' });
const stored = r => ({ ...r, origem: 'csv', import_source_id: r.sourceId });
function source(rows, saldos) { return { ...statement({ rows, saldos, formato: 'csv' }), estado: 'concluido' }; }
const balance = (data, valor, descricao = 'S A L D O') => ({ data, valor, descricao });
const day = '2026-01-31';

test('último saldo informado não recebe novamente os movimentos antigos nem a base do cadastro', () => {
    const rows = [row('a','2026-01-10',30),row('b','2026-01-11',5,'receita')];
    const s = source(rows,[balance('2025-12-31',100,'Saldo anterior'),balance(day,75)]);
    const result = calculate({ saldo_inicial: 75 }, rows.map(stored), [s], day);
    assert.equal(result.saldo_atual,75); assert.equal(result.saldo_calculado,75);
    assert.equal(result.saldo_calculado_cadastro,50); assert.equal(result.base_calculo.valor,100);
    assert.equal(result.conciliacao.status,'conferido'); assert.equal(result.conciliacao.diferenca,0);
    assert.ok(result.conciliacao.avisos.some(i=>i.codigo==='base_cadastro'));
});
test('diferença entre períodos fica explícita e não altera o saldo informado nem inventa receitas', () => {
    const a = [row('a','2026-01-10',20)], b=[row('b','2026-03-10',10)];
    const s1=source(a,[balance('2025-12-31',100,'Saldo anterior'),balance('2026-01-31',80)]);
    const s2=source(b,[balance('2026-02-28',60,'Saldo anterior'),balance('2026-03-31',50)]);
    const result=calculate({saldo_inicial:50},[...a,...b].map(stored),[s1,s2],'2026-03-31');
    assert.equal(result.saldo_atual,50); assert.equal(result.saldo_calculado,70);
    assert.equal(result.conciliacao.status,'divergente');
    assert.deepEqual(result.conciliacao.avisos.find(i=>i.codigo==='continuidade'),{
        codigo:'continuidade',texto:'O saldo mudou entre extratos sem movimentos suficientes no histórico para explicar a diferença.',desde:'2026-01-31',ate:'2026-02-28'});
});
test('dia sem movimentos mantém saldo e data da fonte, não renomeia a posição para hoje', () => {
    const result=calculate({saldo_inicial:0},[],[source([],[balance('2026-01-20',27)])],day);
    assert.equal(result.saldo_atual,27); assert.equal(result.data_saldo_informado,'2026-01-20');
    assert.equal(result.conciliacao.status,'divergente'); assert.ok(result.conciliacao.avisos.some(i=>i.codigo==='sem_abertura'));
});
test('saldos diferentes na mesma data não são escolhidos silenciosamente nem somados', () => {
    const result=calculate({saldo_inicial:0},[],[source([],[balance(day,27)]),source([],[balance(day,30)])],day);
    assert.equal(result.saldo_atual,null); assert.equal(result.saldo_informado,null); assert.equal(result.conciliacao.status,'conflito');
});
test('extratos sobrepostos com o mesmo saldo e movimento não somam posição ou movimento duas vezes', () => {
    const rows=[row('a','2026-01-10',20)];const s=source(rows,[balance('2025-12-31',100,'Saldo anterior'),balance(day,80)]);
    const result=calculate({saldo_inicial:100},rows.map(stored),[s,s],day);
    assert.equal(result.saldo_atual,80);assert.equal(result.saldo_calculado,80);assert.equal(result.conciliacao.status,'conferido');
});
test('movimentos posteriores produzem estimativa separada, futuro não entra no saldo de hoje', () => {
    const result=calculate({saldo_inicial:100},[stored(row('a','2026-01-21',5)),stored(row('b','2026-02-01',90))],
        [source([],[balance('2026-01-20',27)])],day);
    assert.equal(result.saldo_atual,27);assert.equal(result.saldo_estimado,22);assert.equal(result.movimentos_posteriores,1);assert.equal(result.movimentos_futuros,1);
});
test('ausência ou alteração de movimento registrado impede histórico conferido', () => {
    const r=row('a','2026-01-10',20);const s=source([r],[balance('2025-12-31',100,'Saldo anterior'),balance(day,80)]);
    for(const rows of [[],[stored({...r,valor:10})]]) assert.ok(calculate({saldo_inicial:100},rows,[s],day).conciliacao.avisos.some(i=>i.codigo==='movimentos'));
});
test('sem extrato usa cálculo identificado, sem fabricar saldo bancário', () => {
    const result=calculate({saldo_inicial:100},[stored(row('a','2026-01-10',20))],[],day);
    assert.equal(result.saldo_atual,80);assert.equal(result.saldo_informado,null);assert.equal(result.conciliacao.status,'sem_extrato');
});
test('leitura incompleta, datas futuras e moeda estrangeira não recebem conferência positiva', () => {
    const s=source([],[balance(day,100,'Saldo anterior'),balance(day,100)]);
    assert.equal(calculate({saldo_inicial:100},[],[{...s,estado:'pendente'}],day).conciliacao.status,'incompleto');
    const future=calculate({saldo_inicial:100},[],[source([],[balance('2026-02-01',999)])],day);
    assert.equal(future.saldo_informado,null);assert.ok(future.conciliacao.avisos.some(i=>i.codigo==='data_futura'));
    const foreign=calculate({saldo_inicial:100},[],[{...s,moeda:'USD'}],day);
    assert.equal(foreign.saldo_informado,null);assert.ok(foreign.conciliacao.avisos.some(i=>i.codigo==='moeda'));
});
test('abertura conflitante não é usada como base arbitrária', () => {
    const result=calculate({saldo_inicial:50},[],[source([],[balance(day,100,'Saldo anterior'),balance(day,80)]),source([],[balance(day,70,'Saldo anterior'),balance(day,80)])],day);
    assert.equal(result.base_calculo.origem,'cadastro');assert.equal(result.conciliacao.status,'divergente');
});
test('serviço exige proprietário e conta corretos; referências de cartão não viram saldo de conta', async () => {
    const owner='ficticio@invalid.test',other='outro@invalid.test';
    const docs={finance_contas:[{id:'a',email:owner,saldo_inicial:0}],finance_lancamentos:[],finance_extratos:[
        {email:other,conta_id:'a',...source([],[balance(day,999)])},
        {email:owner,conta_id:'b',...source([],[balance(day,888)])},
        {email:owner,conta_id:'a',cartao_id:'cartao',...source([],[balance(day,777)])},
        {email:owner,conta_id:'a',cartao_id:null,...source([],[balance(day,27)])}]};
    const db={collection(name){return{where(field,op,value){assert.equal(op,'==');return{async get(){return{docs:docs[name].filter(d=>d[field]===value).map(d=>({id:d.id,data:()=>d}))}}}}}}};
    const result=await load(db,owner);assert.equal(result.length,1);assert.equal(result[0].balance.saldo_atual,27);
});
test('dia de corte usa America/Cuiaba em vez de UTC',()=>assert.equal(brDay(new Date('2026-01-02T02:00:00Z')),'2026-01-01'));

test('movimentos manuais sem fonte não recebem conferência por cancelarem o efeito líquido',()=>{
 const r=row('a','2026-01-10',20);const s=source([r],[balance('2025-12-31',100,'Saldo anterior'),balance(day,80)]);
 const result=calculate({saldo_inicial:100},[stored(r),{...row('manual1','2026-01-15',5),origem:'manual'},{...row('manual2','2026-01-15',5,'receita'),origem:'manual'}],[s],day);
 assert.equal(result.conciliacao.diferenca,0);assert.equal(result.conciliacao.status,'incompleto');assert.ok(result.conciliacao.avisos.some(i=>i.codigo==='sem_origem'));
});

test('movimentos depois da última posição deixam conferência incompleta mesmo quando a data do extrato bate',()=>{
 const r=row('a','2026-01-10',20);const s=source([r],[balance('2025-12-31',100,'Saldo anterior'),balance('2026-01-20',80)]);
 const result=calculate({saldo_inicial:100},[stored(r),stored(row('b','2026-01-21',5))],[s],day);
 assert.equal(result.saldo_informado,80);assert.equal(result.saldo_estimado,75);assert.equal(result.conciliacao.status,'incompleto');
});
