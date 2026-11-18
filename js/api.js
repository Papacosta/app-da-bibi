// Camada de dados: Supabase (produção) ou localStorage (modo demonstração).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const MODO_DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;

const CONFIG_PADRAO = {
  id: 1, valor_percurso: 25, percursos_por_dia: 2, km_percurso: 8,
  minutos_percurso: 20, consumo_km_l: 11, preco_combustivel: 6, dias_semana: [1, 2, 3, 5],
};

// ---------- Mensagens de erro em português (heurística 9) ----------
export function traduzirErro(e) {
  const msg = String(e?.message || e || '');
  const code = e?.code || '';
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos. Confira e tente de novo.';
  if (/Email not confirmed/i.test(msg)) return 'Este e-mail ainda não foi confirmado. Peça ao admin para confirmar o usuário no Supabase.';
  if (code === '23505' || /duplicate key/i.test(msg)) return 'Esse dia já está registrado. Abra o dia no calendário para editar.';
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'Você não tem permissão para fazer isso. Só o admin pode alterar registros.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sem conexão com a internet. Verifique o Wi-Fi ou os dados móveis e tente de novo.';
  if (/JWT|session/i.test(msg)) return 'Sua sessão expirou. Entre de novo.';
  return 'Algo deu errado: ' + msg;
}

// =================================================================
// Adaptador Supabase
// =================================================================
async function criarSupabase() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const ok = (r) => { if (r.error) throw r.error; return r.data; };

  return {
    async sessao() {
      const { data } = await sb.auth.getSession();
      return data.session ? data.session.user : null;
    },
    async entrar(email, senha) {
      ok(await sb.auth.signInWithPassword({ email, password: senha }));
    },
    async sair() { await sb.auth.signOut(); },
    async perfil() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;
      return ok(await sb.from('perfis').select('*').eq('id', user.id).single());
    },
    async carregarTudo(admin) {
      const [dias, pagamentos] = await Promise.all([
        sb.from('dias').select('*').order('data'),
        sb.from('pagamentos').select('*').order('data', { ascending: false }),
      ]);
      const base = { dias: ok(dias), pagamentos: ok(pagamentos), gastos: [], custos: {}, config: null };
      if (!admin) return base;
      const [gastos, custos, config] = await Promise.all([
        sb.from('gastos').select('*').order('data', { ascending: false }),
        sb.from('custos_dia').select('*'),
        sb.from('configuracoes').select('*').eq('id', 1).single(),
      ]);
      base.gastos = ok(gastos);
      for (const c of ok(custos)) base.custos[c.dia_id] = Number(c.custo_combustivel);
      base.config = ok(config);
      return base;
    },
    async salvarDia(dia, custo) {
      const salvo = ok(await sb.from('dias').upsert(dia).select().single());
      ok(await sb.from('custos_dia').upsert({ dia_id: salvo.id, custo_combustivel: custo }));
      return salvo;
    },
    async excluirDia(id) { ok(await sb.from('dias').delete().eq('id', id)); },
    async salvar(tabela, linha) { return ok(await sb.from(tabela).upsert(linha).select().single()); },
    async excluir(tabela, id) { ok(await sb.from(tabela).delete().eq('id', id)); },
    async salvarConfig(c) { ok(await sb.from('configuracoes').update(c).eq('id', 1)); },
  };
}

// =================================================================
// Adaptador de demonstração (tudo no navegador)
// =================================================================
function criarDemo() {
  const CHAVE = 'app-da-bibi-demo';
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  const ler = () => {
    try { const s = JSON.parse(localStorage.getItem(CHAVE)); if (s) return s; } catch { /* sem storage */ }
    return semente();
  };
  let mem = null;
  const db = () => (mem ??= ler());
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(mem)); } catch { /* ok */ } };
  const espera = () => new Promise((r) => setTimeout(r, 250));

  function semente() {
    // Gera dias de exemplo no mês passado e neste mês, até ontem.
    const dias = [], custos = {};
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    for (let d = new Date(inicio); d < hoje; d.setDate(d.getDate() + 1)) {
      const sem = d.getDay();
      const previsto = [1, 2, 3, 5].includes(sem);
      const extra = sem === 4 && d.getDate() % 3 === 0;
      if (!previsto && !extra) continue;
      // deixa alguns dias previstos sem registro, para mostrar "pendentes"
      if (previsto && d.getDate() % 9 === 0) continue;
      const faltou = previsto && d.getDate() % 11 === 0;
      const id = uid();
      const data = d.toISOString().slice(0, 10);
      dias.push({ id, data, status: faltou ? 'nao_levei' : 'levei', percursos: faltou ? 0 : 2,
        km: faltou ? 0 : 16, minutos: faltou ? 0 : 40, valor: faltou ? 0 : 50, observacao: extra ? 'Aula extra' : '' });
      custos[id] = faltou ? 0 : +(16 / 11 * 6).toFixed(2);
    }
    const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 28).toISOString().slice(0, 10);
    return {
      config: { ...CONFIG_PADRAO }, dias, custos,
      pagamentos: [{ id: uid(), data: mesPassado, valor: 500, observacao: 'Pix' }],
      gastos: [{ id: uid(), data: mesPassado, categoria: 'manutencao', descricao: 'Troca de óleo', valor: 180 }],
      usuario: null,
    };
  }

  const PERFIS = {
    'admin@demo': { id: 'a', email: 'admin@demo', nome: 'Você (admin)', papel: 'admin' },
    'tia@demo': { id: 't', email: 'tia@demo', nome: 'Tia', papel: 'responsavel' },
  };

  return {
    async sessao() { return db().usuario ? PERFIS[db().usuario] : null; },
    async entrar(email) {
      await espera();
      const p = PERFIS[email.trim().toLowerCase()];
      if (!p) throw new Error('Invalid login credentials');
      db().usuario = p.email; gravar();
    },
    async sair() { db().usuario = null; gravar(); },
    async perfil() { return db().usuario ? PERFIS[db().usuario] : null; },
    async carregarTudo(admin) {
      await espera();
      const s = structuredClone(db());
      s.dias.sort((a, b) => a.data.localeCompare(b.data));
      s.pagamentos.sort((a, b) => b.data.localeCompare(a.data));
      s.gastos.sort((a, b) => b.data.localeCompare(a.data));
      return admin ? s : { dias: s.dias, pagamentos: s.pagamentos, gastos: [], custos: {}, config: null };
    },
    async salvarDia(dia, custo) {
      await espera();
      const s = db();
      const dup = s.dias.find((d) => d.data === dia.data && d.id !== dia.id);
      if (dup) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      const linha = { ...dia, id: dia.id || uid() };
      const i = s.dias.findIndex((d) => d.id === linha.id);
      if (i >= 0) s.dias[i] = linha; else s.dias.push(linha);
      s.custos[linha.id] = custo; gravar();
      return linha;
    },
    async excluirDia(id) { await espera(); const s = db(); s.dias = s.dias.filter((d) => d.id !== id); delete s.custos[id]; gravar(); },
    async salvar(tabela, linha) {
      await espera();
      const s = db(); const l = { ...linha, id: linha.id || uid() };
      const i = s[tabela].findIndex((x) => x.id === l.id);
      if (i >= 0) s[tabela][i] = l; else s[tabela].push(l);
      gravar(); return l;
    },
    async excluir(tabela, id) { await espera(); const s = db(); s[tabela] = s[tabela].filter((x) => x.id !== id); gravar(); },
    async salvarConfig(c) { await espera(); db().config = { ...db().config, ...c }; gravar(); },
    reiniciarDemo() { mem = semente(); gravar(); },
  };
}

export const api = MODO_DEMO ? criarDemo() : await criarSupabase();
export { CONFIG_PADRAO };
